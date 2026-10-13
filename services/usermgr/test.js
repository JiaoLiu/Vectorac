// test.js - Device Center v3 端到端测试
// 覆盖 pro 文档优化建议的全部改动点：
//   ① /provision 只收 hardware_id，服务器生成 SN+FactoryKey
//   ② /activate 用 HardwareID + nonce + HMAC 签名
//   ③ 签名串 "v1|activate|hardware_id|timestamp|nonce"
//   ④ 二维码只放 temp_token
//   ⑤ device_name → nickname
//   ⑥ /bind/poll 加 HMAC 认证
//   ⑦ /device/status 新增
//   ⑧ nonce 防重放
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 环境变量必须先设置再 require server
const PORT = 3042;
const ADMIN = 'testadmin';
const PROV = 'testprov';
process.env.PORT = String(PORT);
process.env.ADMIN_PASSWORD = ADMIN;
process.env.PROVISION_TOKEN = PROV;
process.env.VOLCANO_ENABLED = 'false';
process.env.JWT_SECRET = 'testsecret';
process.env.KEY_ENCRYPTION_SECRET = 'a'.repeat(64);
// 测试用 dev 模式（不真实发短信），设置 SMS 变量为空字符串
// dotenv 不覆盖已存在的 process.env 值，所以空字符串会阻止真实短信
process.env.SMS_ACCESS_KEY_ID = '';
process.env.SMS_ACCESS_KEY_SECRET = '';
process.env.SMS_SIGN_NAME = '';
process.env.SMS_TEMPLATE_CODE = '';

// 每次使用独立临时目录，覆盖外部配置，避免测试删除或写入现有数据库。
// 保留测试数据库供失败后排查；必须在 require server/db 之前设置。
process.env.USERMGR_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'usermgr-test-'));

const { app, buildSignString, deriveLocalHostname, rateBuckets } = require('./server');
const DB = require('./db');
const volcano = require('./volcano');
const captcha = require('./captcha');

// 测试辅助：清除某手机号的短信 rate limit（测试中需要连续发码，生产不会这样）
function clearSmsRateLimit(phone) {
  const today = new Date().toISOString().slice(0, 10);
  for (const key of rateBuckets.keys()) {
    if (key.startsWith(`sms:${phone}:`) || key === `sms:phone-day:${phone}:${today}`) {
      rateBuckets.delete(key);
    }
  }
}

// 测试辅助：清除所有 IP 维度的短信 rate limit（测试在同一 IP 发大量短信）
function clearIpSmsRateLimit() {
  for (const key of rateBuckets.keys()) {
    if (key.startsWith('sms:ip-')) rateBuckets.delete(key);
  }
}

// 辅助：完成一次滑块校验，返回一次性 captcha_token
async function getCaptchaToken() {
  const c = await req('GET', '/xiaov/api/captcha/slider');
  const targetX = captcha.__testGetTarget(c.body.captcha_id);
  // 构造合理拖拽轨迹（>200ms、起点≈0、>=3 点）
  const trail = [];
  const t0 = Date.now();
  for (let i = 0; i <= 8; i++) {
    trail.push({ x: Math.round(targetX * i / 8), t: t0 + i * 60 });
  }
  const v = await req('POST', '/xiaov/api/captcha/verify', {
    captcha_id: c.body.captcha_id,
    slider_x: targetX,
    trail,
  });
  if (!v.body.captcha_token) throw new Error('captcha verify failed: ' + JSON.stringify(v.body));
  return v.body.captcha_token;
}

// DynamicRegister payload 必须先 AES 解密，不能把 Base64 密文当 DeviceSecret。
{
  const productSecret = '0123456789abcdef-product-secret';
  const key = Buffer.from(productSecret, 'utf8').subarray(0, 16);
  const expectedSecret = 'device-secret-for-esp32';
  const cipher = crypto.createCipheriv('aes-128-cbc', key, key);
  const payload = Buffer.concat([cipher.update(expectedSecret, 'utf8'), cipher.final()]).toString('base64');
  if (volcano.decryptDeviceSecret(payload, productSecret) !== expectedSecret) {
    throw new Error('DynamicRegister DeviceSecret decrypt regression');
  }
}

function req(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const opts = {
      method,
      hostname: '127.0.0.1',
      port: PORT,
      path,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };
    if (data) opts.headers['Content-Length'] = data.length;
    const r = http.request(opts, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => {
        let json;
        try { json = JSON.parse(buf); } catch (e) { json = { _raw: buf }; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function sign(factoryKey, action, hardwareId, timestamp, nonce) {
  const s = buildSignString(action, hardwareId, timestamp, nonce);
  return crypto.createHmac('sha256', Buffer.from(factoryKey, 'hex')).update(s).digest('base64');
}

// provision verify 签名：v1|provision_verify|hardwareId|challenge → HMAC hex
function signVerify(factoryKey, hardwareId, challenge) {
  const s = `v1|provision_verify|${hardwareId}|${challenge}`;
  return crypto.createHmac('sha256', Buffer.from(factoryKey, 'hex')).update(s).digest('hex');
}

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}

// 数据归属新模型：服务期/绑定挂物理设备（MAC）；按任意一份 SN 凭证 id 定位
function svcOf(credentialId) {
  const c = DB.getCredentialById(credentialId);
  return DB.getServiceByHardware(c.product_id, c.hardware_id);
}
function rightsOf(credentialId) {
  return DB.getSnRights(credentialId);
}

let server;

async function main() {
  server = app.listen(PORT, async () => {
    console.log('=== Device Center v3 测试 ===\n');

    check('局域网主机名由冒号格式 HardwareID 严格派生', deriveLocalHostname('AC:A7:04:28:C9:10') === 'xiaov-aca70428c910.local');
    check('局域网主机名接受无分隔 HardwareID', deriveLocalHostname('ACA70428C910') === 'xiaov-aca70428c910.local');
    check('局域网主机名拒绝非法 HardwareID', deriveLocalHostname('AC:A7:04:28:C9:10<script>') === null);

    // ===== 1. 健康检查 =====
    let r = await req('GET', '/healthz');
    check('健康检查', r.status === 200);

    r = await req('GET', '/xiaov/account/');
    check('产品用户页带尾斜杠直接返回', r.status === 200);

    r = await req('GET', '/xiaov/account');
    check('产品用户页无尾斜杠只重定向一次', r.status === 301 && r.body._raw.includes('/xiaov/account/'));

    // ===== 2. 管理员产品列表 =====
    r = await req('GET', '/admin/api/products', null, { Authorization: `Bearer ${ADMIN}` });
    check('管理员产品列表', r.status === 200 && Array.isArray(r.body));
    const xiaovId = r.body.find(p => p.code === 'xiaov')?.id;
    r = await req('GET', '/admin/api/products', null, { Authorization: `Bearer ${PROV}` });
    check('烧录令牌不可访问管理接口', r.status === 401);
    check('xiaov 产品存在', !!xiaovId);

    r = await req('GET', '/xiaov/api/product');
    check('产品用户页返回自身品牌', r.status === 200 && r.body.code === 'xiaov' && r.body.name === '小V机器人');

    // ===== 3. 出厂录入阶段 1（返回 SN + FactoryKey + challenge，status=provisioning） =====
    r = await req('POST', '/admin/api/provision', {
      product: 'xiaov',
      hardware_id: 'AC:A7:04:28:C9:10',
    }, { Authorization: `Bearer ${PROV}` });
    check('出厂录入阶段1成功', r.status === 200 && r.body.ok && !!r.body.sn && !!r.body.factory_key && !!r.body.challenge);
    const sn = r.body.sn;
    const factoryKey = r.body.factory_key;
    const hwid = 'AC:A7:04:28:C9:10';
    console.log(`    SN=${sn}, FactoryKey=${factoryKey.slice(0, 16)}...`);

    // 重复录入（provisioning 状态）：返回原 SN + 原 FactoryKey + 新 challenge
    r = await req('POST', '/admin/api/provision', {
      product: 'xiaov',
      hardware_id: 'AC:A7:04:28:C9:10',
    }, { Authorization: `Bearer ${PROV}` });
    check('provisioning 状态重试返回原 SN+FactoryKey', r.body.ok && r.body.sn === sn && r.body.factory_key === factoryKey && !!r.body.challenge);
    const challenge = r.body.challenge;

    // ===== 3b. activate 在 provisioning 状态应被拦截 =====
    let ts = Date.now();
    let nonce = crypto.randomBytes(8).toString('hex');
    let sig = sign(factoryKey, 'activate', hwid, ts, nonce);
    r = await req('POST', '/xiaov/api/device/activate', {
      hardware_id: hwid, timestamp: ts, nonce, signature: sig,
    });
    check('provisioning 状态激活被拒', r.status === 403 && r.body.error === 'device_not_provisioned');

    // ===== 3c. 错误 HMAC response 验证失败 =====
    r = await req('POST', '/admin/api/provision/verify', {
      product: 'xiaov', hardware_id: hwid, challenge,
      response: crypto.randomBytes(32).toString('hex'),
    }, { Authorization: `Bearer ${PROV}` });
    check('错误 HMAC 验证失败', r.status === 401 && r.body.error === 'hmac_mismatch');

    // ===== 3d. 出厂录入阶段 2（验证 HMAC challenge → status=provisioned） =====
    const verifyResp = signVerify(factoryKey, hwid, challenge);
    r = await req('POST', '/admin/api/provision/verify', {
      product: 'xiaov', hardware_id: hwid, challenge, response: verifyResp,
    }, { Authorization: `Bearer ${PROV}` });
    check('出厂录入阶段2验证成功', r.status === 200 && r.body.ok && r.body.status === 'provisioned' && r.body.sn === sn);

    // ===== 3e. 已 provisioned 后再调 /provision 不返回 FactoryKey =====
    r = await req('POST', '/admin/api/provision', {
      product: 'xiaov',
      hardware_id: 'AC:A7:04:28:C9:10',
    }, { Authorization: `Bearer ${PROV}` });
    check('已 provisioned 返回 already_provisioned', r.body.already_provisioned === true && r.body.sn === sn && !r.body.factory_key);

    // ===== 4. 首次激活（改动②③⑧：HardwareID + nonce + HMAC） =====
    ts = Date.now();
    nonce = crypto.randomBytes(8).toString('hex');
    sig = sign(factoryKey, 'activate', hwid, ts, nonce);
    r = await req('POST', '/xiaov/api/device/activate', {
      hardware_id: hwid, timestamp: ts, nonce, signature: sig,
    });
    check('首次激活成功', r.body.ok === true && r.body.recovered === false);
    check('激活返回 SN', r.body.sn === sn);
    check('激活返回 device_secret', !!r.body.device_secret);
    check('激活返回 rtc_app_id', !!r.body.rtc_app_id);
    let deviceSecret1 = r.body.device_secret;
    let rtcAppId1 = r.body.rtc_app_id;

    // 新模型：权益按"实际激活后一年、火山控制"自动记录——实际激活成功即视为
    // 获得一年 License，到期按激活时间 +1 年推算（展示用，无人工确认关卡）。
    ts = Date.now(); nonce = crypto.randomBytes(8).toString('hex');
    sig = sign(factoryKey, 'status', hwid, ts, nonce);
    r = await req('POST', '/xiaov/api/device/status', { hardware_id: hwid, timestamp: ts, nonce, signature: sig });
    {
      const rights = DB.getSnRights(DB.getCredentialBySn(xiaovId, sn).id);
      // provider_expires_at 为 SQLite UTC 格式（'YYYY-MM-DD HH:MM:SS'），
      // 必须按 UTC 解析；直接 new Date() 会按本地时区解析导致 ±8 小时偏差
      const expMs = new Date(rights.provider_expires_at.replace(' ', 'T') + 'Z').getTime();
      const oneYearMs = Date.now() + 365 * 86400e3;
      check('激活即获得一年权益（激活推算到期）', r.body.provider_available === true && rights.provider_renew_status === 'completed' && !rights.provider_license_id);
      check('推算到期时间 = 激活时间 +1 年（误差 ≤1 分钟）', Math.abs(expMs - oneYearMs) < 60e3);
      check('无 provider_unconfirmed 字段（确认关卡已撤销）', !('provider_unconfirmed' in r.body));
    }

    // 模拟历史平台：设备已有 DeviceSecret，但产品 RTCAppID 尚未保存。
    DB.db.prepare("UPDATE products SET rtc_app_id = NULL WHERE id = ?").run(xiaovId);
    ts = Date.now(); nonce = crypto.randomBytes(8).toString('hex');
    sig = sign(factoryKey, 'activate', hwid, ts, nonce);
    r = await req('POST', '/xiaov/api/device/activate', {
      hardware_id: hwid, timestamp: ts, nonce, signature: sig,
    });
    check('产品缺 RTCAppID 时补调用激活', r.body.ok === true && r.body.recovered === false);
    check('补调用后产品永久保存 RTCAppID', DB.getProductRow(xiaovId).rtc_app_id === r.body.rtc_app_id);
    deviceSecret1 = r.body.device_secret;
    rtcAppId1 = r.body.rtc_app_id;

    // ===== 5. erase_flash 恢复（同一个 HardwareID 二次激活，应返回原 device_secret） =====
    ts = Date.now(); nonce = crypto.randomBytes(8).toString('hex');
    sig = sign(factoryKey, 'activate', hwid, ts, nonce);
    r = await req('POST', '/xiaov/api/device/activate', {
      hardware_id: hwid, timestamp: ts, nonce, signature: sig,
    });
    check('二次激活返回原 device_secret', r.body.recovered === true && r.body.device_secret === deviceSecret1);
    check('二次激活返回原 rtc_app_id', r.body.rtc_app_id === rtcAppId1);

    // ===== 6. 错误签名被拒绝 =====
    ts = Date.now(); nonce = crypto.randomBytes(8).toString('hex');
    r = await req('POST', '/xiaov/api/device/activate', {
      hardware_id: hwid, timestamp: ts, nonce,
      signature: crypto.randomBytes(32).toString('base64'),
    });
    check('错误签名被拒', r.status === 401);

    // ===== 7. 过期时间戳被拒 =====
    const oldTs = Date.now() - 10 * 60 * 1000;
    nonce = crypto.randomBytes(8).toString('hex');
    sig = sign(factoryKey, 'activate', hwid, oldTs, nonce);
    r = await req('POST', '/xiaov/api/device/activate', {
      hardware_id: hwid, timestamp: oldTs, nonce, signature: sig,
    });
    check('过期时间戳被拒', r.status === 401 && r.body.reason === 'timestamp_out_of_window');

    // ===== 8. nonce 重放被拒（改动⑧） =====
    ts = Date.now(); nonce = crypto.randomBytes(8).toString('hex');
    sig = sign(factoryKey, 'activate', hwid, ts, nonce);
    r = await req('POST', '/xiaov/api/device/activate', {
      hardware_id: hwid, timestamp: ts, nonce, signature: sig,
    });
    check('首次使用 nonce 成功', r.status === 200);
    r = await req('POST', '/xiaov/api/device/activate', {
      hardware_id: hwid, timestamp: ts, nonce, signature: sig,
    });
    check('nonce 重放被拒', r.status === 401 && r.body.reason === 'nonce_reused');

    // ===== 9. 用户注册（需短信验证码） =====
    // 先发注册验证码
    clearIpSmsRateLimit();
    let regToken = await getCaptchaToken();
    r = await req('POST', '/xiaov/api/auth/sms-code', { phone: '13800138000', purpose: 'register', captcha_token: regToken });
    check('注册验证码发送成功', r.status === 200 && r.body.ok);
    const regCode = r.body.dev_code;
    // 注册时带验证码
    r = await req('POST', '/xiaov/api/auth/register', {
      phone: '13800138000', password: 'test12345', code: regCode,
    });
    check('用户注册成功', r.body.token && r.body.user);
    check('注册返回 phone', r.body.user.phone === '13800138000');
    const userToken = r.body.token;

    // 重复注册被拒
    regToken = await getCaptchaToken();
    r = await req('POST', '/xiaov/api/auth/sms-code', { phone: '13800138000', purpose: 'register', captcha_token: regToken });
    check('已注册手机号发注册验证码被拒', r.status === 409);

    // ===== 9b. phone 登录 + 校验 =====
    // 登录用 phone
    r = await req('POST', '/xiaov/api/auth/login', {
      phone: '13800138000', password: 'test12345',
    });
    check('phone 登录成功', r.body.token && r.body.user.phone === '13800138000');

    // 错误密码
    r = await req('POST', '/xiaov/api/auth/login', {
      phone: '13800138000', password: 'wrongpass',
    });
    check('phone 登录密码错误被拒', r.status === 401);

    // 不存在的手机号
    r = await req('POST', '/xiaov/api/auth/login', {
      phone: '13900000000', password: 'test12345',
    });
    check('未注册手机号登录被拒', r.status === 401);

    // 手机号格式校验
    r = await req('POST', '/xiaov/api/auth/register', {
      phone: '12345', password: 'test12345', code: '123456',
    });
    check('非法手机号被拒', r.status === 400 && r.body.error === 'invalid_phone');

    r = await req('POST', '/xiaov/api/auth/register', {
      phone: '10999999999', password: 'test12345', code: '123456',
    });
    check('非 1[3-9] 开头手机号被拒', r.status === 400 && r.body.error === 'invalid_phone');

    // 缺少验证码被拒
    r = await req('POST', '/xiaov/api/auth/register', {
      phone: '13800138001', password: 'test12345',
    });
    check('注册缺验证码被拒', r.status === 400 && r.body.error === 'missing_code');

    // 重复 phone 被拒（需先发码，但已注册手机号发码会被拒，所以直接注册不带码）
    r = await req('POST', '/xiaov/api/auth/register', {
      phone: '13800138000', password: 'test12345', code: '123456',
    });
    check('重复 phone 注册被拒', r.status === 409 && r.body.error === 'phone_exists');

    // email 选填：注册一个带 email 的用户
    clearIpSmsRateLimit();
    let emailToken = await getCaptchaToken();
    r = await req('POST', '/xiaov/api/auth/sms-code', { phone: '13900139001', purpose: 'register', captcha_token: emailToken });
    check('13900139001 注册验证码发送', r.status === 200);
    r = await req('POST', '/xiaov/api/auth/register', {
      phone: '13900139001', password: 'test12345', email: 'alice@example.com', code: r.body.dev_code,
    });
    check('带 email 注册成功', r.body.token && r.body.user.email === 'alice@example.com');

    // 非法 email 被拒
    emailToken = await getCaptchaToken();
    r = await req('POST', '/xiaov/api/auth/sms-code', { phone: '13900139002', purpose: 'register', captcha_token: emailToken });
    r = await req('POST', '/xiaov/api/auth/register', {
      phone: '13900139002', password: 'test12345', email: 'not-an-email', code: r.body.dev_code,
    });
    check('非法 email 被拒', r.status === 400 && r.body.error === 'invalid_email');

    // 缺少 phone 被拒
    r = await req('POST', '/xiaov/api/auth/register', {
      password: 'test12345',
    });
    check('缺少 phone 被拒', r.status === 400 && r.body.error === 'missing_params');

    // 密码过短被拒
    r = await req('POST', '/xiaov/api/auth/register', {
      phone: '13900139003', password: '123',
    });
    check('密码过短被拒', r.status === 400 && r.body.error === 'password_too_short');

    // /me 返回 phone + email
    r = await req('GET', '/xiaov/api/me', null, { Authorization: `Bearer ${userToken}` });
    check('/me 返回 phone', r.body.phone === '13800138000');
    check('/me 返回 email（可能为空）', 'email' in r.body);

    // ===== 9c. 手机号标准化（各种格式 → 统一 13800138000） =====
    // 用各种格式登录已注册的 13800138000，都应成功
    for (const fmt of ['138 0013 8000', '138-0013-8000', '+86 13800138000', '8613800138000']) {
      r = await req('POST', '/xiaov/api/auth/login', { phone: fmt, password: 'test12345' });
      check(`标准化登录成功: ${fmt}`, r.body.token && r.body.user.phone === '13800138000');
    }
    // 用带空格格式注册已存在号 → 判为重复（标准化后做了唯一性检查）
    r = await req('POST', '/xiaov/api/auth/register', { phone: '138 0013 8000', password: 'test12345' });
    check('标准化后重复检测', r.status === 409 && r.body.error === 'phone_exists');

    // ===== 9d. 密码找回：短信验证码 + 重置密码 =====
    // 13700137000 专门用于重置密码测试，注册时先发注册验证码
    clearIpSmsRateLimit();
    let forgotToken = await getCaptchaToken();
    r = await req('POST', '/xiaov/api/auth/sms-code', { phone: '13700137000', purpose: 'register', captcha_token: forgotToken });
    check('密码找回测试号注册验证码发送', r.status === 200);
    const forgotRegCode = r.body.dev_code;
    r = await req('POST', '/xiaov/api/auth/register', { phone: '13700137000', password: 'oldpass123', code: forgotRegCode });
    check('密码找回测试号注册成功', r.body.token);

    // 发送重置验证码（dev 模式返回 dev_code）；需先通过滑块校验
    // 无 token 应被拒
    r = await req('POST', '/xiaov/api/auth/sms-code', { phone: '13700137000', purpose: 'reset_password' });
    check('短信接口无滑块 token 被拒', r.status === 403 && r.body.error === 'captcha_required');
    // 拿到 token 后再发
    clearSmsRateLimit('13700137000');
    clearIpSmsRateLimit();
    const captchaToken = await getCaptchaToken();
    r = await req('POST', '/xiaov/api/auth/sms-code', { phone: '13700137000', purpose: 'reset_password', captcha_token: captchaToken });
    check('发送验证码成功', r.body.ok && !!r.body.dev_code && r.body.expires_in === 300);
    const resetCode = r.body.dev_code;

    // 错误验证码被拒
    r = await req('POST', '/xiaov/api/auth/reset-password', { phone: '13700137000', code: '000000', new_password: 'newpass123' });
    check('错误验证码被拒', r.status === 401 && r.body.error === 'invalid_or_expired_code');

    // 新密码过短被拒
    r = await req('POST', '/xiaov/api/auth/reset-password', { phone: '13700137000', code: resetCode, new_password: '123' });
    check('重置密码过短被拒', r.status === 400 && r.body.error === 'password_too_short');

    // 正确验证码 + 新密码 → 重置成功
    r = await req('POST', '/xiaov/api/auth/reset-password', { phone: '13700137000', code: resetCode, new_password: 'newpass456' });
    check('重置密码成功', r.body.ok === true);

    // 验证码不可重用
    r = await req('POST', '/xiaov/api/auth/reset-password', { phone: '13700137000', code: resetCode, new_password: 'newpass789' });
    check('验证码不可重用', r.status === 401 && r.body.error === 'invalid_or_expired_code');

    // 旧密码登录失败
    r = await req('POST', '/xiaov/api/auth/login', { phone: '13700137000', password: 'oldpass123' });
    check('旧密码登录失败', r.status === 401);

    // 新密码登录成功
    r = await req('POST', '/xiaov/api/auth/login', { phone: '13700137000', password: 'newpass456' });
    check('新密码登录成功', r.body.token && r.body.user.phone === '13700137000');

    // ===== 9d2. 滑块本身：位置错误 / 轨迹过短 / token 一次性 =====
    {
      clearIpSmsRateLimit();
      const c = await req('GET', '/xiaov/api/captcha/slider');
      check('滑块挑战生成', !!c.body.captcha_id && !!c.body.bg_image && !!c.body.slider_image);
      // 位置错误
      r = await req('POST', '/xiaov/api/captcha/verify', { captcha_id: c.body.captcha_id, slider_x: 1, trail: [{x:0,t:Date.now()},{x:1,t:Date.now()+300}] });
      check('滑块位置错误被拒', r.status === 400 && r.body.error === 'captcha_failed');
      // 轨迹过快（3 个点但总时长 < 200ms）
      const tx = captcha.__testGetTarget(c.body.captcha_id);
      const t0 = Date.now();
      r = await req('POST', '/xiaov/api/captcha/verify', { captcha_id: c.body.captcha_id, slider_x: tx, trail: [{x:0,t:t0},{x:Math.round(tx/2),t:t0+30},{x:tx,t:t0+60}] });
      check('滑块轨迹过快被拒', r.status === 400 && r.body.error === 'captcha_failed' && r.body.reason === 'trail_too_fast');
      // 同一挑战已被消费过（位置错时未消费，这里再用错位置仍应失败；正常流程见 getCaptchaToken）
    }
    // token 一次性：同一个 token 不能发两次短信
    {
      const tk = await getCaptchaToken();
      r = await req('POST', '/xiaov/api/auth/sms-code', { phone: '13700999001', purpose: 'reset_password', captcha_token: tk });
      check('一次性 token 首次可用', r.body.ok === true);
      r = await req('POST', '/xiaov/api/auth/sms-code', { phone: '13700999001', purpose: 'reset_password', captcha_token: tk });
      check('一次性 token 重复使用被拒', r.status === 403 && r.body.error === 'captcha_required');
    }

    // ===== 9e. Rate limit：短信验证码 1 次/分钟/手机号 =====
    {
      clearIpSmsRateLimit();
      const tk = await getCaptchaToken();
      r = await req('POST', '/xiaov/api/auth/sms-code', { phone: '13700137001', purpose: 'reset_password', captcha_token: tk });
      check('rate limit: 首次发送成功', r.body.ok === true);
    }
    {
      const tk = await getCaptchaToken();
      r = await req('POST', '/xiaov/api/auth/sms-code', { phone: '13700137001', purpose: 'reset_password', captcha_token: tk });
      check('rate limit: 60秒内第二次被拒', r.status === 429 && r.body.error === 'rate_limited');
    }

    // ===== 9f. 验证码登录 =====
    {
      clearIpSmsRateLimit();
      // 先发登录验证码
      clearSmsRateLimit('13800138000');
      const tk = await getCaptchaToken();
      r = await req('POST', '/xiaov/api/auth/sms-code', { phone: '13800138000', purpose: 'login', captcha_token: tk });
      check('登录验证码发送成功', r.body.ok && !!r.body.dev_code);
      const loginCode = r.body.dev_code;
      // 验证码登录
      r = await req('POST', '/xiaov/api/auth/login-by-code', { phone: '13800138000', code: loginCode });
      check('验证码登录成功', r.body.token && r.body.user.phone === '13800138000');
      // 错误验证码
      r = await req('POST', '/xiaov/api/auth/login-by-code', { phone: '13800138000', code: '000000' });
      check('验证码登录错误码被拒', r.status === 401);
      // 未注册手机号发码被拒
      const tk2 = await getCaptchaToken();
      r = await req('POST', '/xiaov/api/auth/sms-code', { phone: '13900000099', purpose: 'login', captcha_token: tk2 });
      check('未注册手机号登录验证码被拒', r.status === 404);
    }

    // ===== 9g. 修改密码（已登录） =====
    {
      clearIpSmsRateLimit();
      // 旧密码方式
      r = await req('POST', '/xiaov/api/auth/change-password', { old_password: 'test12345', new_password: 'changed123' }, { Authorization: `Bearer ${userToken}` });
      check('旧密码修改密码成功', r.body.ok === true);
      // 用旧密码登录应失败
      r = await req('POST', '/xiaov/api/auth/login', { phone: '13800138000', password: 'test12345' });
      check('旧密码登录失败', r.status === 401);
      // 用新密码登录成功
      r = await req('POST', '/xiaov/api/auth/login', { phone: '13800138000', password: 'changed123' });
      check('新密码登录成功', r.body.token);
      // 旧密码错误
      r = await req('POST', '/xiaov/api/auth/change-password', { old_password: 'wrongpwd', new_password: 'newpwd123' }, { Authorization: `Bearer ${userToken}` });
      check('旧密码错误被拒', r.status === 401 && r.body.error === 'wrong_password');
      // 短信验证码方式
      clearSmsRateLimit('13800138000');
      const tk = await getCaptchaToken();
      r = await req('POST', '/xiaov/api/auth/sms-code', { phone: '13800138000', purpose: 'change_password', captcha_token: tk });
      check('修改密码验证码发送', r.body.ok && !!r.body.dev_code);
      const changeCode = r.body.dev_code;
      r = await req('POST', '/xiaov/api/auth/change-password-by-code', { code: changeCode, new_password: 'changed456' }, { Authorization: `Bearer ${userToken}` });
      check('短信验证码修改密码成功', r.body.ok === true);
      // 错误验证码
      r = await req('POST', '/xiaov/api/auth/change-password-by-code', { code: '000000', new_password: 'changed789' }, { Authorization: `Bearer ${userToken}` });
      check('修改密码错误验证码被拒', r.status === 401);
    }

    // ===== 10. 生成绑定二维码（改动④：只返回 temp_token，不含 SN） =====
    ts = Date.now(); nonce = crypto.randomBytes(8).toString('hex');
    sig = sign(factoryKey, 'qrcode', hwid, ts, nonce);
    r = await req('POST', '/xiaov/api/device/bind/qrcode', {
      hardware_id: hwid, timestamp: ts, nonce, signature: sig,
    });
    check('生成二维码成功', r.body.ok && !!r.body.temp_token);
    check('二维码 URL 不含 SN', !r.body.qr_url.includes('sn='));
    check('二维码 URL 使用 SPA bind 路由', r.body.qr_url.includes('/account/#/bind?t='));
    const tempToken = r.body.temp_token;

    // 已绑定时不再生成
    // 先绑定再说
    r = await req('POST', '/xiaov/api/device/bind/confirm', {
      temp_token: tempToken, nickname: '客厅小V',
    }, { Authorization: `Bearer ${userToken}` });
    check('用户扫码绑定成功', r.body.ok === true);

    // 再次生成二维码应提示已绑定
    ts = Date.now(); nonce = crypto.randomBytes(8).toString('hex');
    sig = sign(factoryKey, 'qrcode', hwid, ts, nonce);
    r = await req('POST', '/xiaov/api/device/bind/qrcode', {
      hardware_id: hwid, timestamp: ts, nonce, signature: sig,
    });
    check('已绑定设备不再生成二维码', r.body.already_bound === true);

    // ===== 11. 设备轮询绑定状态（改动⑥：加 HMAC 认证） =====
    ts = Date.now(); nonce = crypto.randomBytes(8).toString('hex');
    sig = sign(factoryKey, 'poll', hwid, ts, nonce);
    r = await req('POST', '/xiaov/api/device/bind/poll', {
      hardware_id: hwid, temp_token: tempToken,
      timestamp: ts, nonce, signature: sig,
    });
    check('轮询返回 bound', r.body.status === 'bound');
    check('轮询返回 nickname（改动⑤）', r.body.nickname === '客厅小V');

    // 无签名的轮询应失败
    r = await req('POST', '/xiaov/api/device/bind/poll', {
      hardware_id: hwid, temp_token: tempToken,
      timestamp: Date.now(), nonce: crypto.randomBytes(8).toString('hex'),
    });
    check('无签名轮询被拒', r.status === 400);

    // ===== 12. /device/status（新增⑦：设备开火山会话前查询绑定状态） =====
    ts = Date.now(); nonce = crypto.randomBytes(8).toString('hex');
    sig = sign(factoryKey, 'status', hwid, ts, nonce);
    r = await req('POST', '/xiaov/api/device/status', {
      hardware_id: hwid, timestamp: ts, nonce, signature: sig,
    });
    check('status 返回 bound=true', r.body.bound === true);
    check('status 返回 SN', r.body.sn === sn);
    check('status 返回 device_secret_ready', r.body.device_secret_ready === true);
    // v4 ⑩：服务期 + ai_allowed
    check('status 返回 service_status=active', r.body.service_status === 'active');
    check('status 返回 ai_allowed=true', r.body.ai_allowed === true);
    check('status 返回 service_expires_at', !!r.body.service_expires_at);
    const firstExpires = r.body.service_expires_at;

    // ===== 13. 用户解绑后再查 status =====
    r = await req('GET', '/xiaov/api/devices', null, { Authorization: `Bearer ${userToken}` });
    check('用户设备列表非空', Array.isArray(r.body) && r.body.length > 0);
    check('设备列表返回严格派生的局域网主机名', r.body[0].local_hostname === 'xiaov-aca70428c910.local');
    const bindingId = r.body[0].binding_id;

    // 新模型：设备列表 hardware_id 来自绑定表（挂物理设备）；非法值不得进入 local_hostname
    const boundBinding = DB.getBindingByHardware(xiaovId, hwid);
    DB.db.prepare('UPDATE user_device_bindings SET hardware_id = ? WHERE id = ?').run('invalid-hardware-id', boundBinding.id);
    const invalidHostList = await req('GET', '/xiaov/api/devices', null, { Authorization: `Bearer ${userToken}` });
    check('设备列表对非法 HardwareID 返回 local_hostname=null', invalidHostList.body[0].local_hostname === null);
    DB.db.prepare('UPDATE user_device_bindings SET hardware_id = ? WHERE id = ?').run(hwid, boundBinding.id);

    const accountAppSource = fs.readFileSync(path.join(__dirname, 'public', 'account', 'app.js'), 'utf8');
    check('官网入口前端再次严格校验局域网主机名', accountAppSource.includes("const LOCAL_HOSTNAME_RE = /^xiaov-[0-9a-f]{12}\\.local$/;"));
    check('官网入口只做用户点击后的新标签页跳转', accountAppSource.includes("window.open(`http://${hostname}/`, '_blank', 'noopener,noreferrer')"));
    check('官网入口包含同 Wi-Fi 与访客网络隔离帮助', accountAppSource.includes('手机与小V处于同一 Wi-Fi') && accountAppSource.includes('访客网络没有开启设备隔离'));

    r = await req('DELETE', `/xiaov/api/devices/${bindingId}`, null, { Authorization: `Bearer ${userToken}` });
    check('用户解绑成功', r.body.ok === true);

    // 解绑后 status 应返回 bound=false
    ts = Date.now(); nonce = crypto.randomBytes(8).toString('hex');
    sig = sign(factoryKey, 'status', hwid, ts, nonce);
    r = await req('POST', '/xiaov/api/device/status', {
      hardware_id: hwid, timestamp: ts, nonce, signature: sig,
    });
    check('解绑后 status 返回 bound=false', r.body.bound === false);
    check('解绑后 ai_allowed=false（即使服务期还在）', r.body.ai_allowed === false);
    check('解绑后 device_secret 仍可用（火山设备不动）', r.body.device_secret_ready === true);

    // ===== 14. 解绑后可重新绑定（设备身份不变） =====
    ts = Date.now(); nonce = crypto.randomBytes(8).toString('hex');
    sig = sign(factoryKey, 'qrcode', hwid, ts, nonce);
    r = await req('POST', '/xiaov/api/device/bind/qrcode', {
      hardware_id: hwid, timestamp: ts, nonce, signature: sig,
    });
    check('解绑后可重新生成二维码', r.body.ok === true && !!r.body.temp_token);
    const newTemp = r.body.temp_token;

    r = await req('POST', '/xiaov/api/device/bind/confirm', {
      temp_token: newTemp, nickname: '卧室小V',
    }, { Authorization: `Bearer ${userToken}` });
    check('解绑后可重新绑定', r.body.ok === true);

    // ===== 15. SN 不参与激活（用 HardwareID 直接查） =====
    // 不传 sn 字段，仅靠 hardware_id 激活成功
    ts = Date.now(); nonce = crypto.randomBytes(8).toString('hex');
    sig = sign(factoryKey, 'activate', hwid, ts, nonce);
    r = await req('POST', '/xiaov/api/device/activate', {
      hardware_id: hwid, timestamp: ts, nonce, signature: sig,
    });
    check('激活不依赖 SN（仅 HardwareID）', r.body.ok === true && r.body.sn === sn);

    // ===== 16. 管理员查询 =====
    r = await req('GET', '/admin/api/credentials?product=xiaov', null, { Authorization: `Bearer ${ADMIN}` });
    check('管理员凭证列表', r.status === 200 && r.body.length > 0);
    check('凭证不返回 factory_key', !r.body[0].factory_key);
    check('凭证不返回 volcano_device_secret', !r.body[0].volcano_device_secret);

    // ===== 17. 未授权访问 =====
    r = await req('GET', '/admin/api/credentials?product=xiaov');
    check('未授权访问被拒', r.status === 401);

    r = await req('GET', '/xiaov/api/devices', null, { Authorization: 'Bearer invalid' });
    check('无效 token 被拒', r.status === 401);

    // ===== 18. 未录入的 HardwareID 激活应失败 =====
    const unknownHwid = '11:22:33:44:55:66';
    ts = Date.now(); nonce = crypto.randomBytes(8).toString('hex');
    sig = sign(factoryKey, 'activate', unknownHwid, ts, nonce);
    r = await req('POST', '/xiaov/api/device/activate', {
      hardware_id: unknownHwid, timestamp: ts, nonce, signature: sig,
    });
    check('未录入设备激活被拒', r.status === 404 && r.body.error === 'device_not_provisioned');

    // ===== 19. v4 续费流程：创建订单 → 上传凭证 → 管理员确认 → 服务期延长 =====
    r = await req('GET', '/xiaov/api/devices', null, { Authorization: `Bearer ${userToken}` });
    const renewBindingId = r.body[0].binding_id;
    const expiresBefore = r.body[0].service_expires_at;
    check('续费前服务期存在', !!expiresBefore);

    r = await req('POST', `/xiaov/api/devices/${renewBindingId}/renew`, { years: 1 }, { Authorization: `Bearer ${userToken}` });
    check('创建续费订单成功', r.body.ok === true && !!r.body.order_id);
    const orderId = r.body.order_id;
    check('订单金额正确', r.body.amount === 1990);

    // 用户上传转账凭证：订单仍 pending，服务期不延长
    r = await req('POST', `/xiaov/api/orders/${orderId}/voucher`, { voucher: '微信转账 20260811 18:30 张三 流水号WX123456' }, { Authorization: `Bearer ${userToken}` });
    check('上传凭证成功', r.body.ok === true);
    check('上传凭证后订单仍 pending', r.body.status === 'pending');
    check('返回提示等待审核', !!r.body.message);

    // 上传凭证后服务期不应延长
    r = await req('GET', '/xiaov/api/devices', null, { Authorization: `Bearer ${userToken}` });
    check('上传凭证后服务期未延长', r.body[0].service_expires_at === expiresBefore);

    // 空凭证被拒
    r = await req('POST', `/xiaov/api/orders/${orderId}/voucher`, { voucher: '' }, { Authorization: `Bearer ${userToken}` });
    check('空凭证被拒', r.status === 400);

    // 管理员确认收款 → paid + 服务期延长 + 自动预留新 SN
    r = await req('PATCH', `/admin/api/orders/${orderId}/mark-paid`, {}, { Authorization: `Bearer ${ADMIN}` });
    check('管理员确认收款成功', r.body.ok === true && r.body.status === 'paid');
    check('确认收款后旧续期任务标记 superseded（新 SN 激活自带一年）', r.body.provider_renew_status === 'superseded');
    check('确认收款返回自动预留的新 SN（待激活）', !!r.body.reserved_sn && DB.getCredentialBySn(xiaovId, r.body.reserved_sn).status === 'provisioned');
    const reservedSn19 = r.body.reserved_sn;

    // 服务期应延长
    r = await req('GET', '/xiaov/api/devices', null, { Authorization: `Bearer ${userToken}` });
    const expiresAfter = r.body[0].service_expires_at;
    check('确认收款后服务期延长', new Date(expiresAfter).getTime() > new Date(expiresBefore).getTime());

    // 确认收款不影响当前 SN 的火山权益（按激活推算未到期）。
    ts = Date.now(); nonce = crypto.randomBytes(8).toString('hex');
    sig = sign(factoryKey, 'status', hwid, ts, nonce);
    r = await req('POST', '/xiaov/api/device/status', {
      hardware_id: hwid, timestamp: ts, nonce, signature: sig,
    });
    check('续费确认后 service_status=active', r.body.service_status === 'active');
    check('续费确认不停用当前有效 License', r.body.ai_allowed === true);
    check('当前火山 License 未到期仍 available', r.body.provider_available === true);
    check('status 返回火山 License 到期日', !!r.body.provider_expires_at);

    // ===== 20. 我的订单列表（含凭证字段） =====
    r = await req('GET', '/xiaov/api/orders', null, { Authorization: `Bearer ${userToken}` });
    check('订单列表非空', Array.isArray(r.body) && r.body.length > 0);
    check('订单含续期状态', !!r.body[0].provider_renew_status);
    check('订单含凭证字段', 'voucher_text' in r.body[0]);
    check('已确认订单凭证非空', !!r.body[0].voucher_text);

    // ===== 21. 管理员订单/服务期查看 =====
    r = await req('GET', '/admin/api/orders?product=xiaov', null, { Authorization: `Bearer ${ADMIN}` });
    check('管理员订单列表', r.status === 200 && r.body.length > 0);
    check('管理员能看到凭证', !!r.body[0].voucher_text);

    r = await req('GET', '/admin/api/services?product=xiaov', null, { Authorization: `Bearer ${ADMIN}` });
    check('管理员服务期列表', r.status === 200 && r.body.length > 0);
    check('服务期含 SN', !!r.body[0].sn);

    // ===== 22. 重复确认收款 = 幂等重放（订单 ID 幂等）=====
    r = await req('PATCH', `/admin/api/orders/${orderId}/mark-paid`, {}, { Authorization: `Bearer ${ADMIN}` });
    check('重复确认收款幂等返回同一预留 SN', r.status === 200 && r.body.reserved_reused === true && r.body.reserved_sn === reservedSn19);

    // 用户不能对已付款订单再上传凭证
    r = await req('POST', `/xiaov/api/orders/${orderId}/voucher`, { voucher: 'test' }, { Authorization: `Bearer ${userToken}` });
    check('已付款订单上传凭证被拒', r.status === 400);

    // ============================================================
    // 边界测试 ①-⑤（对照 pro 文档上线前清单）
    // ============================================================

    // ① 解绑 → 重绑，不重新赠送首年（ON CONFLICT 保留原 expires_at）
    {
      const d = (await req('GET', '/xiaov/api/devices', null, { Authorization: `Bearer ${userToken}` })).body[0];
      const b = DB.getBindingById(d.binding_id);
      const expBefore = svcOf(d.credential_id).expires_at;
      DB.deleteBinding(d.binding_id);                                    // 解绑（service 不删）
      DB.createBinding(b.user_id, b.product_id, b.hardware_id, '重绑');
      DB.createServiceForDevice(b.user_id, b.product_id, b.hardware_id, 'annual'); // ON CONFLICT 不重置
      const expAfter = svcOf(d.credential_id).expires_at;
      check('① 解绑重绑不重赠首年（expires_at 不变）', expAfter === expBefore);
    }

    // ② 同一支付回调调用2次 → 幂等：只延长1年、只预留一个 SN
    {
      const d = (await req('GET', '/xiaov/api/devices', null, { Authorization: `Bearer ${userToken}` })).body[0];
      const expBefore = svcOf(d.credential_id).expires_at;
      const r1 = await req('POST', `/xiaov/api/devices/${d.binding_id}/renew`, { years: 1 }, { Authorization: `Bearer ${userToken}` });
      await req('POST', `/xiaov/api/orders/${r1.body.order_id}/voucher`, { voucher: '重复回调测试' }, { Authorization: `Bearer ${userToken}` });
      const r2 = await req('PATCH', `/admin/api/orders/${r1.body.order_id}/mark-paid`, {}, { Authorization: `Bearer ${ADMIN}` });
      check('② 第一次确认收款成功', r2.body.ok === true);
      const expAfter1 = svcOf(d.credential_id).expires_at;
      check('② 第一次延长了服务期', new Date(expAfter1).getTime() > new Date(expBefore).getTime());
      // 重复回调
      const r3 = await req('PATCH', `/admin/api/orders/${r1.body.order_id}/mark-paid`, {}, { Authorization: `Bearer ${ADMIN}` });
      check('② 重复确认幂等返回同一 SN（200 + reused）', r3.status === 200 && r3.body.reserved_reused === true && r3.body.reserved_sn === r2.body.reserved_sn);
      const expAfter2 = svcOf(d.credential_id).expires_at;
      check('② 重复确认未再延长服务期', expAfter2 === expAfter1);
    }

    // ③ 两个 worker 同时抢同一续费订单 → 只能一个进入 processing
    {
      const d = (await req('GET', '/xiaov/api/devices', null, { Authorization: `Bearer ${userToken}` })).body[0];
      const b = DB.getBindingById(d.binding_id);
      const order = DB.createOrder({ userId: b.user_id, credentialId: d.credential_id, productId: b.product_id, amount: 1990, plan: 'annual', years: 1 });
      DB.markOrderPaid(order.id);
      DB.setOrderRenewStatus(order.id, 'pending');
      const claim1 = DB.claimOrderForRenew(order.id);
      const claim2 = DB.claimOrderForRenew(order.id);
      check('③ 第一个 worker 抢占成功', claim1 === true);
      check('③ 第二个 worker 抢占失败', claim2 === false);
      const o3 = DB.getOrderById(order.id);
      check('③ 订单状态为 processing', o3.provider_renew_status === 'processing');

      // ④ provider 续期失败 → service 不丢 → failed → 可重试（复用 ③ 的订单）
      const expBeforeFail = svcOf(d.credential_id).expires_at;
      DB.setOrderRenewStatus(order.id, 'failed', { error: 'mock volcano api error' });
      DB.setSnRenewStatus(d.credential_id, 'failed', { error: 'mock volcano api error' });
      const expAfterFail = svcOf(d.credential_id).expires_at;
      check('④ 续期失败后 service 期不丢', expAfterFail === expBeforeFail);
      check('④ order.provider_renew_status=failed', DB.getOrderById(order.id).provider_renew_status === 'failed');
      const retry = DB.retryOrderRenew(order.id);
      check('④ retryOrderRenew 成功', retry === true);
      check('④ 重试后重新进入 pending 队列', DB.listOrdersPendingRenew().some(o => o.id === order.id));
      // 非 failed 状态重试应失败
      check('④ 非 failed 状态重试被拒', DB.retryOrderRenew(order.id) === false);

      // ⑤ provider 成功后崩溃重启不重复（复用 ④ retry 后的订单）
      const claim5 = DB.claimOrderForRenew(order.id);
      check('⑤ retry 后可抢占', claim5 === true);
      DB.setOrderRenewStatus(order.id, 'completed', { licenseId: 'LIC-123' });
      DB.setSnRenewStatus(d.credential_id, 'completed', { licenseId: 'LIC-123' });
      check('⑤ completed 不在 pending 队列', !DB.listOrdersPendingRenew().some(o => o.id === order.id));
      check('⑤ 已 completed 不可再抢占', DB.claimOrderForRenew(order.id) === false);
      check('⑤ 已 completed 重试被拒', DB.retryOrderRenew(order.id) === false);
    }

    // ⑥ 确认收款 → 自动预留新 SN（新模型：新 SN 激活自带一年 License，
    // 旧"给原 SN 购买 License 续期"任务标记 superseded，两套流程不重复执行）
    {
      const d = (await req('GET', '/xiaov/api/devices', null, { Authorization: `Bearer ${userToken}` })).body[0];
      const expBefore = svcOf(d.credential_id).expires_at;
      // 创建订单 + 凭证 + 确认收款（服务期延长 + 自动预留新 SN）
      const r1 = await req('POST', `/xiaov/api/devices/${d.binding_id}/renew`, { years: 1 }, { Authorization: `Bearer ${userToken}` });
      await req('POST', `/xiaov/api/orders/${r1.body.order_id}/voucher`, { voucher: '人工续期测试' }, { Authorization: `Bearer ${userToken}` });
      const rmp = await req('PATCH', `/admin/api/orders/${r1.body.order_id}/mark-paid`, {}, { Authorization: `Bearer ${ADMIN}` });
      check('⑥ mark-paid 成功且返回预留 SN', rmp.body.ok === true && !!rmp.body.reserved_sn);
      check('⑥ 旧"给原 SN 续期"任务标记 superseded（不与新 SN 流程重复执行）', rmp.body.provider_renew_status === 'superseded' && DB.getOrderById(r1.body.order_id).provider_renew_status === 'superseded');
      check('⑥ 预留的新 SN 为待激活（provisioned），未切走当前 SN', DB.getCredentialBySn(xiaovId, rmp.body.reserved_sn).status === 'provisioned' && DB.getCredentialBySn(xiaovId, rmp.body.reserved_sn).id !== d.credential_id);
      check('⑥ 订单已关联预留 SN（reserved_credential_id）', DB.getOrderById(r1.body.order_id).reserved_credential_id === DB.getCredentialBySn(xiaovId, rmp.body.reserved_sn).id);
      const expAfter = svcOf(d.credential_id).expires_at;
      check('⑥ 服务期已延长（mark-paid 时）', new Date(expAfter).getTime() > new Date(expBefore).getTime());

      // superseded 订单不能再走"给原 SN 完成/重试续期"（两套流程互斥）
      const r2 = await req('POST', `/admin/api/orders/${r1.body.order_id}/complete-renew`, { license_id: 'MANUAL-LIC-001' }, { Authorization: `Bearer ${ADMIN}` });
      check('⑥ superseded 订单人工完成续期被拒（400）', r2.status === 400);
      check('⑥ superseded 订单重试续期被拒', await req('POST', `/admin/api/orders/${r1.body.order_id}/retry-renew`, {}, { Authorization: `Bearer ${ADMIN}` }).then(x => x.status === 400));

      // 重复确认收款 = 幂等重放：返回同一预留 SN，服务期不再延长
      const rmp2 = await req('PATCH', `/admin/api/orders/${r1.body.order_id}/mark-paid`, {}, { Authorization: `Bearer ${ADMIN}` });
      check('⑥ 重复确认幂等：返回同一预留 SN', rmp2.status === 200 && rmp2.body.reserved_reused === true && rmp2.body.reserved_sn === rmp.body.reserved_sn);
      check('⑥ 重复确认不重复延长服务期', svcOf(d.credential_id).expires_at === expAfter);
      // 幂等重放也不重复生成 SN：凭证表中该 SN 只有一条
      check('⑥ 幂等重放未新增 SN', DB.getCredentialsByHardwareId(xiaovId, hwid).filter(c => c.sn === rmp.body.reserved_sn).length === 1);

      // 设备当前仍可用（权益按激活推算，未到期；续费 superseded 不影响当前 License）
      ts = Date.now(); nonce = crypto.randomBytes(8).toString('hex');
      sig = sign(factoryKey, 'status', hwid, ts, nonce);
      r = await req('POST', '/xiaov/api/device/status', {
        hardware_id: hwid, timestamp: ts, nonce, signature: sig,
      });
      check('⑥ 确认收款后 ai_allowed=true', r.body.ai_allowed === true);
      check('⑥ 确认收款后 provider_available=true', r.body.provider_available === true);
    }

    // ===== 21. 套餐按设备：/me 返回 devices[]，admin 按设备改套餐 =====
    console.log('\n--- 21. 套餐按设备 ---');

    // /me 应返回 devices 数组 + 每台 service 信息；不应再有 plan / plan_expires_at
    r = await req('GET', '/xiaov/api/me', null, { Authorization: `Bearer ${userToken}` });
    check('21.1 /me 返回 devices 数组', Array.isArray(r.body.devices));
    check('21.2 /me 不再返回 plan（已迁设备）', r.body.plan === undefined);
    check('21.3 /me 不再返回 plan_expires_at', r.body.plan_expires_at === undefined);
    check('21.4 devices 至少 1 台（续费测试里已绑）', r.body.devices.length >= 1);

    const dev0 = r.body.devices[0];
    check('21.5 device 含 credential_id / sn', typeof dev0.credential_id === 'number' && !!dev0.sn);
    check('21.6 device 含 plan / service_expires_at / service_status', 'plan' in dev0 && 'service_expires_at' in dev0 && 'service_status' in dev0);
    check('21.7 service_status 在有效枚举内', ['none', 'active', 'expired'].includes(dev0.service_status));

    // /admin/api/users 含 device_count（拿当前用户 id 来自 /me）
    const meForId = r.body;
    r = await req('GET', '/admin/api/users?product=xiaov', null, { Authorization: `Bearer ${ADMIN}` });
    const adminUser = r.body.find(u => u.id === meForId.id);
    check('21.8 /admin/api/users 含 device_count', adminUser && typeof adminUser.device_count === 'number' && adminUser.device_count >= 1);

    // admin PATCH 改设备套餐 / 到期日
    const targetCred = dev0.credential_id;
    const newExp = '2030-12-31T00:00:00.000Z';
    r = await req('PATCH', `/admin/api/credentials/${targetCred}/service`, {
      plan: 'annual', expires_at: newExp,
    }, { Authorization: `Bearer ${ADMIN}` });
    check('21.9 admin 改设备套餐成功', r.body.ok === true && r.body.service.expires_at === newExp && r.body.service.plan === 'annual');

    // 改完后再 /me 验证
    r = await req('GET', '/xiaov/api/me', null, { Authorization: `Bearer ${userToken}` });
    const dev0After = r.body.devices.find(d => d.credential_id === targetCred);
    check('21.10 改完 /me 看到新套餐到期日', dev0After && dev0After.service_expires_at === newExp && dev0After.service_status === 'active');

    // 旧接口应已删除：PATCH /admin/api/users/:id/plan 返回 404
    r = await req('PATCH', `/admin/api/users/${meForId.id}/plan`, {
      plan: 'annual', plan_expires_at: newExp,
    }, { Authorization: `Bearer ${ADMIN}` });
    check('21.11 旧的「按用户改套餐」接口已下线（404）', r.status === 404);

    // 边界：改一个不存在的 credential_id
    r = await req('PATCH', '/admin/api/credentials/999999/service', {
      plan: 'annual', expires_at: newExp,
    }, { Authorization: `Bearer ${ADMIN}` });
    check('21.12 改不存在设备的套餐应失败', r.status >= 400);

    // ===== 22. 产品管理：创建 + 删除 =====
    console.log('\n--- 22. 产品管理 ---');

    // 创建新产品（必填 code + name + sn_prefix；火山配置可后补）
    r = await req('POST', '/admin/api/products', {
      code: 'test_prod', name: '测试产品', sn_prefix: 'TP',
    }, { Authorization: `Bearer ${ADMIN}` });
    check('22.1 创建新产品成功（必填 3 项）', r.body.ok && r.body.product.code === 'test_prod');

    // 重复 code 应被拒
    r = await req('POST', '/admin/api/products', {
      code: 'test_prod', name: '重复', sn_prefix: 'TP',
    }, { Authorization: `Bearer ${ADMIN}` });
    check('22.2 重复 code 被拒', r.status === 409);

    // 缺少 sn_prefix 被拒
    r = await req('POST', '/admin/api/products', {
      code: 'test_prod2', name: 'no prefix',
    }, { Authorization: `Bearer ${ADMIN}` });
    check('22.3 缺少 sn_prefix 被拒', r.status === 400);

    // 缺少 name 被拒
    r = await req('POST', '/admin/api/products', {
      code: 'test_prod3', sn_prefix: 'TP3',
    }, { Authorization: `Bearer ${ADMIN}` });
    check('22.4 缺少 name 被拒', r.status === 400);

    // code 格式非法被拒
    r = await req('POST', '/admin/api/products', {
      code: 'Test-Prod', name: 'bad code', sn_prefix: 'BP',
    }, { Authorization: `Bearer ${ADMIN}` });
    check('22.5 code 含大写被拒', r.status === 400);

    // list 中能看到新产品
    r = await req('GET', '/admin/api/products', null, { Authorization: `Bearer ${ADMIN}` });
    const newProd = r.body.find(p => p.code === 'test_prod');
    check('22.6 新产品出现在列表', !!newProd && newProd.id > 0);

    // 删除新产品（无设备/订单引用时应允许）
    if (newProd) {
      r = await req('DELETE', `/admin/api/products/${newProd.id}`, null, { Authorization: `Bearer ${ADMIN}` });
      check('22.7 删除空产品成功', r.body.ok === true);
    }

    // 删除有设备引用的产品应被拒（xiaov 已被本测试绑定设备）
    r = await req('DELETE', `/admin/api/products/1`, null, { Authorization: `Bearer ${ADMIN}` });
    check('22.8 有引用的产品删除被拒', r.status >= 400);

    // ===== 23. 多产品用户身份隔离 =====
    r = await req('POST', '/admin/api/products', {
      code: 'product_b', name: '产品B', sn_prefix: 'PB',
    }, { Authorization: `Bearer ${ADMIN}` });
    check('23.1 创建隔离测试产品', r.status === 200 && r.body.ok);

    let pbToken = await getCaptchaToken();
    clearIpSmsRateLimit();
    r = await req('POST', '/product_b/api/auth/sms-code', { phone: '13600136000', purpose: 'register', captcha_token: pbToken });
    check('23.2a 产品B注册验证码发送', r.status === 200);
    r = await req('POST', '/product_b/api/auth/register', {
      phone: '13600136000', password: 'password123', code: r.body.dev_code,
    });
    check('23.2 产品B用户注册成功', r.status === 200 && !!r.body.token);
    const productBToken = r.body.token;

    r = await req('GET', '/xiaov/api/me', null, { Authorization: `Bearer ${productBToken}` });
    check('23.3 产品B JWT 不可访问 xiaov', r.status === 403 && r.body.error === 'product_mismatch');

    r = await req('GET', '/product_b/api/me', null, { Authorization: `Bearer ${userToken}` });
    check('23.4 xiaov JWT 不可访问产品B', r.status === 403 && r.body.error === 'product_mismatch');

    // ===== 20. 两阶段 provision：fail + delete =====
    // 新设备 provision → fail → delete
    r = await req('POST', '/admin/api/provision', {
      product: 'xiaov', hardware_id: 'AA:BB:CC:DD:EE:FF',
    }, { Authorization: `Bearer ${PROV}` });
    check('fail测试: provision 成功', r.body.ok && !!r.body.sn && !!r.body.challenge);
    const failSn = r.body.sn;
    const failCredId = r.body.sn; // 临时用 SN，后面列表查 id

    // 标记失败
    r = await req('POST', '/admin/api/provision/fail', {
      product: 'xiaov', hardware_id: 'AA:BB:CC:DD:EE:FF', reason: 'efuse_write_error',
    }, { Authorization: `Bearer ${PROV}` });
    check('fail测试: 标记失败成功', r.body.ok && r.body.status === 'provisioning_failed');

    // 列表里找到 id
    r = await req('GET', '/admin/api/credentials?product=xiaov', null, { Authorization: `Bearer ${ADMIN}` });
    const failedCred = r.body.find(c => c.sn === failSn);
    check('fail测试: 列表显示失败状态', !!failedCred && failedCred.status === 'provisioning_failed' && failedCred.failure_reason === 'efuse_write_error');

    // 删除失败设备
    r = await req('DELETE', `/admin/api/credentials/${failedCred.id}`, null, { Authorization: `Bearer ${ADMIN}` });
    check('fail测试: 删除失败设备成功', r.body.ok === true);

    // 删除已激活设备应被拒
    r = await req('GET', '/admin/api/credentials?product=xiaov', null, { Authorization: `Bearer ${ADMIN}` });
    const activeCred = r.body.find(c => c.volcano_activated);
    if (activeCred) {
      r = await req('DELETE', `/admin/api/credentials/${activeCred.id}`, null, { Authorization: `Bearer ${ADMIN}` });
      check('删除已激活设备被拒', r.status === 409);
    }

    // ===== 24. 订单删除保护：pending 可删，已付款且续期未完成不可删 =====
    console.log('\n--- 24. 订单删除保护 ---');
    {
      const d = (await req('GET', '/xiaov/api/devices', null, { Authorization: `Bearer ${userToken}` })).body[0];

      // 24.1 用户删除 pending（未付款）订单
      const ro = await req('POST', `/xiaov/api/devices/${d.binding_id}/renew`, { years: 1 }, { Authorization: `Bearer ${userToken}` });
      let dr = await req('DELETE', `/xiaov/api/orders/${ro.body.order_id}`, null, { Authorization: `Bearer ${userToken}` });
      check('24.1 用户删除 pending 订单成功', dr.body.ok === true);

      // 24.2 用户删除已付款订单被拒
      const ro2 = await req('POST', `/xiaov/api/devices/${d.binding_id}/renew`, { years: 1 }, { Authorization: `Bearer ${userToken}` });
      await req('POST', `/xiaov/api/orders/${ro2.body.order_id}/voucher`, { voucher: '删除保护测试' }, { Authorization: `Bearer ${userToken}` });
      await req('PATCH', `/admin/api/orders/${ro2.body.order_id}/mark-paid`, {}, { Authorization: `Bearer ${ADMIN}` });
      dr = await req('DELETE', `/xiaov/api/orders/${ro2.body.order_id}`, null, { Authorization: `Bearer ${userToken}` });
      check('24.2 用户删除已付款订单被拒', dr.status === 400 && dr.body.error === 'order_not_deletable');

      // 24.3 superseded 订单不能再人工完成续期（新 SN 激活自带一年，两套流程互斥）
      dr = await req('POST', `/admin/api/orders/${ro2.body.order_id}/complete-renew`, { license_id: 'DEL-LIC-1' }, { Authorization: `Bearer ${ADMIN}` });
      check('24.3 superseded 订单人工完成续期被拒', dr.status === 400);

      // 24.4 已付款且无未完成续期任务（superseded）的订单管理员可删
      dr = await req('DELETE', `/admin/api/orders/${ro2.body.order_id}`, null, { Authorization: `Bearer ${ADMIN}` });
      check('24.4 续期已 superseded 的已付款订单管理员可删', dr.body.ok === true);
    }

    // ===== 25. 多 SN（1 MAC 多证书）：显式 new_sn + verify/fail 定位 + v2 签名 =====
    console.log('\n--- 25. 多 SN 证书 ---');
    {
      // 25.1 已出厂设备重复调用 /provision（不带参数）保持旧语义
      // 24.2 的 mark-paid 已为该 MAC 自动预留新 SN（成为"最近一条记录"）。
      // 重复 provision 保持旧语义：不新建会话、不返回 FactoryKey，
      // 但按"最近一条记录"解析，SN 指向自动预留的新 SN。
      let pr = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hwid }, { Authorization: `Bearer ${PROV}` });
      check('25.1 重复 provision 返回 already_provisioned（旧语义）', pr.body.already_provisioned === true && !!pr.body.sn && !pr.body.factory_key);

      // 25.2 new_sn=true 显式新增 SN：返回新 SN + 同一个 FactoryKey（必须带 request_id）
      pr = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hwid, new_sn: true, request_id: 'req-sn2-001' }, { Authorization: `Bearer ${PROV}` });
      check('25.2 new_sn 生成新 SN', pr.body.ok === true && !!pr.body.sn && pr.body.sn !== sn);
      check('25.2 新 SN 复用同一 FactoryKey（eFuse 相同）', pr.body.factory_key === factoryKey);
      const sn2 = pr.body.sn;
      const challenge2 = pr.body.challenge;
      check('25.2 返回新 challenge', !!challenge2);

      // 25.3 verify 不传 sn 时定位本次烧录的新 SN，不会误判到已出厂的旧 SN
      const vr = await req('POST', '/admin/api/provision/verify', {
        product: 'xiaov', hardware_id: hwid, challenge: challenge2,
        response: signVerify(factoryKey, hwid, challenge2),
      }, { Authorization: `Bearer ${PROV}` });
      check('25.3 verify 定位本次烧录的 SN', vr.status === 200 && vr.body.ok && vr.body.sn === sn2 && vr.body.status === 'provisioned');

      // 25.4 fail 带本次 challenge：只作用于本次烧录，不会把已出厂凭证标成失败
      pr = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hwid, new_sn: true, request_id: 'req-sn3-001' }, { Authorization: `Bearer ${PROV}` });
      const sn3 = pr.body.sn;
      const fr = await req('POST', '/admin/api/provision/fail', { product: 'xiaov', hardware_id: hwid, reason: 'test_fail', challenge: pr.body.challenge }, { Authorization: `Bearer ${PROV}` });
      check('25.4 fail 按本次 challenge 定位 SN', fr.body.ok === true && fr.body.sn === sn3);
      const cl = await req('GET', '/admin/api/credentials?product=xiaov', null, { Authorization: `Bearer ${ADMIN}` });
      const oldCred1 = cl.body.find(c => c.sn === sn);
      const oldCred2 = cl.body.find(c => c.sn === sn2);
      check('25.4 已出厂凭证未被误标失败', oldCred1.status !== 'provisioning_failed' && oldCred2.status !== 'provisioning_failed');
      check('25.4 新 SN 标记为 provisioning_failed', cl.body.find(c => c.sn === sn3).status === 'provisioning_failed');

      // 25.5 带 sn 的请求必须使用 v2 签名（sn 参与签名）
      ts = Date.now(); nonce = crypto.randomBytes(8).toString('hex');
      const v1Sig = sign(factoryKey, 'activate', hwid, ts, nonce); // v1 签名
      r = await req('POST', '/xiaov/api/device/activate', { hardware_id: hwid, sn: sn2, timestamp: ts, nonce, signature: v1Sig });
      check('25.5 v1 签名 + sn 被拒（必须 v2）', r.status === 401);
      ts = Date.now(); nonce = crypto.randomBytes(8).toString('hex');
      const v2Sig = crypto.createHmac('sha256', Buffer.from(factoryKey, 'hex'))
        .update(buildSignString('activate', hwid, ts, nonce, sn2)).digest('base64');
      r = await req('POST', '/xiaov/api/device/activate', { hardware_id: hwid, sn: sn2, timestamp: ts, nonce, signature: v2Sig });
      check('25.5 v2 签名激活指定 SN 成功', r.body.ok === true && r.body.sn === sn2);
      check('25.5 新 SN 有独立 device_secret', !!r.body.device_secret);
      check('25.5 新 SN 火山设备名带 SN 后缀', r.body.volcano_device_name === 'xiaov-aca70428c910-' + sn2);

      // 25.6 不带 sn 的旧固件请求仍走 v1（向后兼容）；解析到最近激活的 SN（25.5 激活了 sn2）
      ts = Date.now(); nonce = crypto.randomBytes(8).toString('hex');
      const compatSig = sign(factoryKey, 'activate', hwid, ts, nonce);
      r = await req('POST', '/xiaov/api/device/activate', { hardware_id: hwid, timestamp: ts, nonce, signature: compatSig });
      check('25.6 旧固件 v1 请求仍可用（返回最近激活的 SN）', r.body.ok === true && r.body.sn === sn2);

      // 25.7 device/sns 列出同一 MAC 的所有 SN
      ts = Date.now(); nonce = crypto.randomBytes(8).toString('hex');
      const snsSig = sign(factoryKey, 'sns', hwid, ts, nonce);
      r = await req('POST', '/xiaov/api/device/sns', { hardware_id: hwid, timestamp: ts, nonce, signature: snsSig });
      // 前面多个小节（21/24 等 mark-paid 自动预留）会在同一 MAC 上累积多个 SN，
      // 精确计数脆弱；断言"全部列出"：数量 ≥ 3 且包含三个烧录 SN（下一断言）
      check('25.7 sns 列出全部 SN', r.body.ok === true && r.body.sns.length >= 3);
      check('25.7 sns 含各 SN 状态', r.body.sns.some(s => s.sn === sn) && r.body.sns.some(s => s.sn === sn2) && r.body.sns.some(s => s.sn === sn3));

      // 25.8 status 带 sn + v2 签名查询指定证书
      ts = Date.now(); nonce = crypto.randomBytes(8).toString('hex');
      const stSig = crypto.createHmac('sha256', Buffer.from(factoryKey, 'hex'))
        .update(buildSignString('status', hwid, ts, nonce, sn2)).digest('base64');
      r = await req('POST', '/xiaov/api/device/status', { hardware_id: hwid, sn: sn2, timestamp: ts, nonce, signature: stSig });
      check('25.8 status 指定 SN 返回该 SN 状态', r.body.ok === true && r.body.sn === sn2);
    }

    // ===== 26. new_sn 请求幂等与参数校验 =====
    console.log('\n--- 26. new_sn 幂等与参数校验 ---');
    {
      // 清理 25 遗留的 provisioning_failed 记录（sn3），保证 hwid 计数干净
      let cl = await req('GET', '/admin/api/credentials?product=xiaov', null, { Authorization: `Bearer ${ADMIN}` });
      const stale = cl.body.find(c => c.hardware_id === hwid && c.status === 'provisioning_failed');
      if (stale) await req('DELETE', `/admin/api/credentials/${stale.id}`, null, { Authorization: `Bearer ${ADMIN}` });

      const countHwid = async () => (await req('GET', '/admin/api/credentials?product=xiaov', null, { Authorization: `Bearer ${ADMIN}` }))
        .body.filter(c => c.hardware_id === hwid).length;

      // 26.1 new_sn 必须携带 request_id
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hwid, new_sn: true }, { Authorization: `Bearer ${PROV}` });
      check('26.1 new_sn 缺 request_id 被拒', r.status === 400 && r.body.error === 'missing_request_id');

      // 26.2 同一 request_id 重复请求：同一 SN + 同一 challenge（不轮换）+ 同一 FactoryKey
      const c1 = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hwid, new_sn: true, request_id: 'req-op-100' }, { Authorization: `Bearer ${PROV}` });
      check('26.2 首次 new_sn 成功', c1.body.ok === true && !!c1.body.sn);
      const snX = c1.body.sn;
      const chX1 = c1.body.challenge;
      const c2 = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hwid, new_sn: true, request_id: 'req-op-100' }, { Authorization: `Bearer ${PROV}` });
      check('26.2 重试返回同一 SN', c2.body.ok === true && c2.body.sn === snX);
      check('26.2 重试不轮换 challenge（会话仍有效）', c2.body.challenge === chX1);
      check('26.2 重试复用同一 FactoryKey', c2.body.factory_key === factoryKey);

      // 26.3 响应乱序安全：工具用第一次响应的 challenge 验证仍成功（重试未使会话失效）
      r = await req('POST', '/admin/api/provision/verify', {
        product: 'xiaov', hardware_id: hwid, challenge: chX1,
        response: signVerify(factoryKey, hwid, chX1),
      }, { Authorization: `Bearer ${PROV}` });
      check('26.3 用首次响应的 challenge 验证成功（乱序安全）', r.status === 200 && r.body.sn === snX);

      // 26.4 验证成功后重放同一 request_id：already_provisioned，不新建 SN
      const beforeCount = await countHwid();
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hwid, new_sn: true, request_id: 'req-op-100' }, { Authorization: `Bearer ${PROV}` });
      check('26.4 完成后重放返回 already_provisioned', r.body.already_provisioned === true && r.body.sn === snX && !r.body.factory_key);
      check('26.4 重放不产生新 SN', await countHwid() === beforeCount);

      // 26.5 新 request_id 才创建下一份 SN
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hwid, new_sn: true, request_id: 'req-op-101' }, { Authorization: `Bearer ${PROV}` });
      check('26.5 新 request_id 创建新 SN', r.body.ok === true && !!r.body.sn && r.body.sn !== snX);
      check('26.5 新 SN 复用同一 FactoryKey', r.body.factory_key === factoryKey);
      // 清理这条进行中的记录，不影响后续
      cl = await req('GET', '/admin/api/credentials?product=xiaov', null, { Authorization: `Bearer ${ADMIN}` });
      const extra = cl.body.find(c => c.hardware_id === hwid && c.status === 'provisioning');
      if (extra) await req('DELETE', `/admin/api/credentials/${extra.id}`, null, { Authorization: `Bearer ${ADMIN}` });

      // 26.6 参数校验
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hwid, new_sn: 'false' }, { Authorization: `Bearer ${PROV}` });
      check('26.6 new_sn="false" 被拒', r.status === 400 && r.body.error === 'invalid_new_sn');
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hwid, new_sn: true, request_id: 123 }, { Authorization: `Bearer ${PROV}` });
      check('26.6 request_id 非字符串被拒', r.status === 400 && r.body.error === 'invalid_request_id');
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hwid, sn: snX, new_sn: true, request_id: 'req-op-102' }, { Authorization: `Bearer ${PROV}` });
      check('26.6 sn + new_sn 同时传被拒', r.status === 400 && r.body.error === 'conflicting_params');

      // 26.7 retired 语义：全部证书退役 = 设备停用；部分退役不影响新增
      const retireHwid = 'AA:11:22:33:44:55';
      const rp = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: retireHwid }, { Authorization: `Bearer ${PROV}` });
      await req('POST', '/admin/api/provision/verify', {
        product: 'xiaov', hardware_id: retireHwid, challenge: rp.body.challenge,
        response: signVerify(rp.body.factory_key, retireHwid, rp.body.challenge),
      }, { Authorization: `Bearer ${PROV}` });
      const retireCred = DB.getCredentialByHardwareId(xiaovId, retireHwid);
      DB.setCredentialStatus(retireCred.id, 'retired');
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: retireHwid, new_sn: true, request_id: 'req-retire-1' }, { Authorization: `Bearer ${PROV}` });
      check('26.7 全部 retired 拒绝 new_sn', r.status === 403 && r.body.error === 'device_retired');
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: retireHwid }, { Authorization: `Bearer ${PROV}` });
      check('26.7 全部 retired 拒绝普通 provision', r.status === 403 && r.body.error === 'device_retired');

      // 部分 retired（仅退役 snX）：设备仍可用，新 request_id 的 new_sn 正常新增
      DB.setCredentialStatus(DB.getCredentialBySn(xiaovId, snX).id, 'retired');
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hwid, new_sn: true, request_id: 'req-op-103' }, { Authorization: `Bearer ${PROV}` });
      check('26.7 部分 retired 不影响 new_sn', r.body.ok === true && !!r.body.sn);
      DB.setCredentialStatus(DB.getCredentialBySn(xiaovId, snX).id, 'provisioned');
      // 清理 req-op-103 的记录
      cl = await req('GET', '/admin/api/credentials?product=xiaov', null, { Authorization: `Bearer ${ADMIN}` });
      const extra2 = cl.body.find(c => c.hardware_id === hwid && c.status === 'provisioning');
      if (extra2) await req('DELETE', `/admin/api/credentials/${extra2.id}`, null, { Authorization: `Bearer ${ADMIN}` });

      // 26.8 幂等映射独立保存：恢复烧录不覆盖旧映射，原请求延迟重放仍指向同一 SN
      const hMap = 'AA:44:55:66:77:88';
      const m1 = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hMap, new_sn: true, request_id: 'req-map-1' }, { Authorization: `Bearer ${PROV}` });
      const snMap = m1.body.sn, fkMap = m1.body.factory_key;
      // 用 R2 恢复烧录（轮换 challenge）
      const m2 = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hMap, sn: snMap, request_id: 'req-map-2' }, { Authorization: `Bearer ${PROV}` });
      check('26.8 R2 恢复返回同一 SN', m2.body.ok === true && m2.body.sn === snMap && m2.body.challenge !== m1.body.challenge);
      // 原请求 R1 延迟重放：仍指向同一 SN，不新增凭证，返回当前会话（不轮换）
      const credCountBefore = (await req('GET', '/admin/api/credentials?product=xiaov', null, { Authorization: `Bearer ${ADMIN}` })).body.filter(c => c.hardware_id === hMap).length;
      const m1r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hMap, new_sn: true, request_id: 'req-map-1' }, { Authorization: `Bearer ${PROV}` });
      check('26.8 R1 重放仍指向同一 SN（映射未被覆盖）', m1r.body.ok === true && m1r.body.sn === snMap);
      check('26.8 R1 重放返回 R2 会话（未再轮换）', m1r.body.challenge === m2.body.challenge);
      check('26.8 R1 重放不新增凭证', (await req('GET', '/admin/api/credentials?product=xiaov', null, { Authorization: `Bearer ${ADMIN}` })).body.filter(c => c.hardware_id === hMap).length === credCountBefore);
      // R2 重放同样指向同一 SN
      const m2r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hMap, sn: snMap, request_id: 'req-map-2' }, { Authorization: `Bearer ${PROV}` });
      check('26.8 R2 重放返回同一 SN 和会话', m2r.body.ok === true && m2r.body.sn === snMap && m2r.body.challenge === m2.body.challenge);

      // 26.9 同一 request_id 携带不同操作参数 → 409 拒绝
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hMap, sn: snMap, request_id: 'req-map-1' }, { Authorization: `Bearer ${PROV}` });
      check('26.9 R1 换成 sn 模式被拒', r.status === 409 && r.body.error === 'request_id_conflict');
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hMap, new_sn: true, request_id: 'req-map-2' }, { Authorization: `Bearer ${PROV}` });
      check('26.9 R2 换成 new_sn 模式被拒（不新增 SN）', r.status === 409 && r.body.error === 'request_id_conflict');
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: 'AA:99:88:77:66:55', new_sn: true, request_id: 'req-map-1' }, { Authorization: `Bearer ${PROV}` });
      check('26.9 R1 换设备重放被拒', r.status === 409 && r.body.error === 'request_id_conflict');
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hMap, sn: 'XV999999', request_id: 'req-map-2' }, { Authorization: `Bearer ${PROV}` });
      check('26.9 R2 换目标 SN 被拒', r.status === 409 && r.body.error === 'request_id_conflict');

      // 26.10 失败后重试原请求：返回明确失败状态（不返回看似可验证的会话）；显式恢复后才能验证
      const m3 = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hMap, new_sn: true, request_id: 'req-map-3' }, { Authorization: `Bearer ${PROV}` });
      const snMap3 = m3.body.sn, chMap3 = m3.body.challenge;
      check('26.10 新 request_id 创建新 SN', m3.body.ok === true && snMap3 !== snMap);
      await req('POST', '/admin/api/provision/fail', { product: 'xiaov', hardware_id: hMap, reason: 'efuse_error', challenge: chMap3 }, { Authorization: `Bearer ${PROV}` });
      // challenge 仍在有效期内重试 R3：必须得到明确失败状态，无 factory_key/challenge
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hMap, new_sn: true, request_id: 'req-map-3' }, { Authorization: `Bearer ${PROV}` });
      check('26.10 失败后重试返回 session_failed', r.body.ok === true && r.body.session_failed === true && r.body.sn === snMap3 && r.body.status === 'provisioning_failed');
      check('26.10 失败后重试不返回可验证会话', !r.body.challenge && !r.body.factory_key);
      // 该失败状态下直接 verify 会被拒
      r = await req('POST', '/admin/api/provision/verify', { product: 'xiaov', hardware_id: hMap, challenge: chMap3, response: signVerify(fkMap, hMap, chMap3) }, { Authorization: `Bearer ${PROV}` });
      check('26.10 失败状态直接验证被拒', r.status === 409 && r.body.error === 'not_in_provisioning_state');
      // 显式恢复（sn 模式，新 request_id）→ 新会话可验证成功
      const m4 = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hMap, sn: snMap3, request_id: 'req-map-4' }, { Authorization: `Bearer ${PROV}` });
      check('26.10 显式恢复返回新 challenge', m4.body.ok === true && m4.body.sn === snMap3 && m4.body.challenge !== chMap3);
      r = await req('POST', '/admin/api/provision/verify', { product: 'xiaov', hardware_id: hMap, challenge: m4.body.challenge, response: signVerify(fkMap, hMap, m4.body.challenge) }, { Authorization: `Bearer ${PROV}` });
      check('26.10 显式恢复后验证成功', r.status === 200 && r.body.sn === snMap3);
      // 旧失败会话的延迟上报不影响已完成状态（challenge 已清除）
      r = await req('POST', '/admin/api/provision/fail', { product: 'xiaov', hardware_id: hMap, reason: 'late_fail', challenge: chMap3 }, { Authorization: `Bearer ${PROV}` });
      check('26.10 旧会话延迟失败上报被拒', r.status === 410 && r.body.error === 'challenge_mismatch');
      // 清理 hMap 下进行中/失败记录
      cl = await req('GET', '/admin/api/credentials?product=xiaov', null, { Authorization: `Bearer ${ADMIN}` });
      for (const c of cl.body.filter(x => x.hardware_id === hMap && x.status !== 'provisioned')) {
        await req('DELETE', `/admin/api/credentials/${c.id}`, null, { Authorization: `Bearer ${ADMIN}` });
      }

      // 26.11 凭证删除后映射保留（墓碑）：旧 ID 重放拒绝且不新建，新 ID 才能重新创建
      const hTomb = 'AA:66:77:88:99:00';
      const t1 = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hTomb, new_sn: true, request_id: 'req-tomb-1' }, { Authorization: `Bearer ${PROV}` });
      const snTomb = t1.body.sn;
      check('26.11 墓碑测试准备：创建凭证', t1.body.ok === true && !!snTomb);
      const countTomb = async () => (await req('GET', '/admin/api/credentials?product=xiaov', null, { Authorization: `Bearer ${ADMIN}` })).body.filter(c => c.hardware_id === hTomb).length;
      const n0 = await countTomb();
      // 删除该凭证（provisioning 状态可删）；幂等映射保留为墓碑
      cl = await req('GET', '/admin/api/credentials?product=xiaov', null, { Authorization: `Bearer ${ADMIN}` });
      const tombCred = cl.body.find(c => c.sn === snTomb);
      r = await req('DELETE', `/admin/api/credentials/${tombCred.id}`, null, { Authorization: `Bearer ${ADMIN}` });
      check('26.11 删除凭证成功', r.body.ok === true);
      check('26.11 删除后该 MAC 无凭证', await countTomb() === 0);
      // 旧 request_id 重放：被拒（request_target_deleted），凭证数量不增加
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hTomb, new_sn: true, request_id: 'req-tomb-1' }, { Authorization: `Bearer ${PROV}` });
      check('26.11 删除后旧 ID 重放被拒', r.status === 404 && r.body.error === 'request_target_deleted');
      check('26.11 旧 ID 重放不新建凭证', await countTomb() === 0);
      // 同 ID 换成 sn 模式重放：参数冲突在目标查找前拦截 → 409（同样拒绝）
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hTomb, sn: snTomb, request_id: 'req-tomb-1' }, { Authorization: `Bearer ${PROV}` });
      check('26.11 旧 ID 换 sn 模式重放被拒（参数冲突）', r.status === 409 && r.body.error === 'request_id_conflict');
      // 换新 request_id 才允许重新创建；FactoryKey 从墓碑恢复（eFuse 只烧一次）
      const t2 = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hTomb, new_sn: true, request_id: 'req-tomb-2' }, { Authorization: `Bearer ${PROV}` });
      check('26.11 新 ID 重新创建成功', t2.body.ok === true && !!t2.body.sn && t2.body.sn !== snTomb);
      check('26.11 新 ID 创建后凭证数为 1', await countTomb() === 1);
      check('26.11 新凭证从墓碑恢复同一 FactoryKey（eFuse 兼容）', t2.body.factory_key === t1.body.factory_key);
      // 清理
      cl = await req('GET', '/admin/api/credentials?product=xiaov', null, { Authorization: `Bearer ${ADMIN}` });
      const tombCred2 = cl.body.find(c => c.hardware_id === hTomb);
      if (tombCred2) await req('DELETE', `/admin/api/credentials/${tombCred2.id}`, null, { Authorization: `Bearer ${ADMIN}` });
    }

    // 26.12 删除全部凭证后，普通录入（不带 new_sn）仍返回原 FactoryKey
    {
      const hPlain = 'AA:77:88:99:AA:BB';
      const t1 = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hPlain, new_sn: true, request_id: 'req-plain-1' }, { Authorization: `Bearer ${PROV}` });
      check('26.12 创建凭证成功', t1.body.ok === true && !!t1.body.factory_key);
      const fk1 = t1.body.factory_key;
      // 删除凭证
      let cl = await req('GET', '/admin/api/credentials?product=xiaov', null, { Authorization: `Bearer ${ADMIN}` });
      let cred = cl.body.find(c => c.hardware_id === hPlain);
      if (cred) await req('DELETE', `/admin/api/credentials/${cred.id}`, null, { Authorization: `Bearer ${ADMIN}` });
      // 普通录入（不带 new_sn / request_id）：应从存档恢复原 FactoryKey
      const t2 = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hPlain }, { Authorization: `Bearer ${PROV}` });
      check('26.12 普通录入返回原 FactoryKey', t2.body.ok === true && t2.body.factory_key === fk1);
      // 清理
      cl = await req('GET', '/admin/api/credentials?product=xiaov', null, { Authorization: `Bearer ${ADMIN}` });
      cred = cl.body.find(c => c.hardware_id === hPlain);
      if (cred) await req('DELETE', `/admin/api/credentials/${cred.id}`, null, { Authorization: `Bearer ${ADMIN}` });
    }

    // 26.13 无 request_id 录入 → 删除 → 重新录入，密钥不变
    {
      const hNoReq = 'AA:88:99:AA:BB:CC';
      const t1 = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hNoReq }, { Authorization: `Bearer ${PROV}` });
      check('26.13 无 request_id 创建成功', t1.body.ok === true && !!t1.body.factory_key);
      const fk1 = t1.body.factory_key;
      // 删除凭证
      let cl = await req('GET', '/admin/api/credentials?product=xiaov', null, { Authorization: `Bearer ${ADMIN}` });
      let cred = cl.body.find(c => c.hardware_id === hNoReq);
      if (cred) await req('DELETE', `/admin/api/credentials/${cred.id}`, null, { Authorization: `Bearer ${ADMIN}` });
      // 重新录入：密钥应从存档恢复
      const t2 = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hNoReq, new_sn: true, request_id: 'req-noreq-2' }, { Authorization: `Bearer ${PROV}` });
      check('26.13 删除后重新录入密钥不变', t2.body.ok === true && t2.body.factory_key === fk1);
      // 清理
      cl = await req('GET', '/admin/api/credentials?product=xiaov', null, { Authorization: `Bearer ${ADMIN}` });
      cred = cl.body.find(c => c.hardware_id === hNoReq);
      if (cred) await req('DELETE', `/admin/api/credentials/${cred.id}`, null, { Authorization: `Bearer ${ADMIN}` });
    }

    // 26.14 有历史记录但密钥存档缺失时，明确拒绝（不生成新密钥）
    {
      const hMissing = 'AA:99:AA:BB:CC:DD';
      // 直接往 provision_requests 插一条无 factory_key 的映射（模拟旧版迁移后无存档）
      DB.db.prepare(`INSERT OR IGNORE INTO provision_requests (request_id, product_id, hardware_id, sn, mode) VALUES (?, ?, ?, ?, ?)`).run('req-missing-old', DB.getProductIdByCode('xiaov'), hMissing, 'XV999999', null);
      // 凭证不存在，存档也不存在，但 provision_requests 有历史 → 应拒绝
      const t1 = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hMissing, new_sn: true, request_id: 'req-missing-new' }, { Authorization: `Bearer ${PROV}` });
      check('26.14 有历史无存档时拒绝创建', t1.status === 409 && t1.body.error === 'factory_key_archive_missing');
      // 清理
      DB.db.prepare('DELETE FROM provision_requests WHERE request_id = ?').run('req-missing-old');
    }

    // 26.15 删除凭证失败时事务回滚：订单 FK 阻止删除，存档一起回滚
    {
      const hRollback = 'BB:11:22:33:44:01';
      const t1 = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hRollback, new_sn: true, request_id: 'req-rb-1' }, { Authorization: `Bearer ${PROV}` });
      check('26.15 创建凭证成功', t1.body.ok === true && !!t1.body.factory_key);
      // 获取凭证 ID
      let cl = await req('GET', '/admin/api/credentials?product=xiaov', null, { Authorization: `Bearer ${ADMIN}` });
      const cred = cl.body.find(c => c.hardware_id === hRollback);
      // 绑定/服务期挂物理设备（hardware_id），与凭证无 FK；用订单（credential_id FK）阻止删除
      const userId = DB.db.prepare('SELECT id FROM users WHERE phone = ?').get('13800138000');
      const uid = userId ? userId.id : 1;
      DB.createBinding(uid, DB.getProductIdByCode('xiaov'), hRollback, 'rollback测试');
      const rbOrder = DB.createOrder({ userId: uid, credentialId: cred.id, productId: DB.getProductIdByCode('xiaov'), amount: 1, plan: 'annual', years: 1 });
      // 记录存档前的状态（应该已有存档——创建时 archiveFactoryKey 已调用）
      const archBefore = DB.db.prepare('SELECT factory_key FROM factory_key_archive WHERE product_id = ? AND hardware_id = ?').get(DB.getProductIdByCode('xiaov'), hRollback);
      // 尝试删除凭证：应因 orders FK 约束失败
      let deleteFailed = false;
      try {
        DB.deleteCredential(cred.id);
      } catch (e) {
        deleteFailed = true;
      }
      check('26.15 删除凭证因订单 FK 约束失败', deleteFailed === true);
      // 验证凭证仍存在（事务回滚）
      const credAfter = DB.db.prepare('SELECT * FROM device_credentials WHERE id = ?').get(cred.id);
      check('26.15 凭证事务回滚后仍存在', !!credAfter);
      // 验证存档未变（事务回滚）
      const archAfter = DB.db.prepare('SELECT factory_key FROM factory_key_archive WHERE product_id = ? AND hardware_id = ?').get(DB.getProductIdByCode('xiaov'), hRollback);
      check('26.15 存档事务回滚后未变', !!archAfter && archAfter.factory_key.toString() === archBefore.factory_key.toString());
      // 清理：删订单、凭证；绑定/服务期挂 MAC，删除凭证后不受影响
      DB.db.prepare('DELETE FROM orders WHERE id = ?').run(rbOrder.id);
      DB.deleteCredential(cred.id);
      check('26.15 删除凭证后绑定仍存在（挂 MAC，不随凭证删除）', !!DB.getBindingByHardware(DB.getProductIdByCode('xiaov'), hRollback));
      DB.db.prepare('DELETE FROM device_services WHERE product_id = ? AND hardware_id = ?').run(DB.getProductIdByCode('xiaov'), hRollback);
      DB.db.prepare('DELETE FROM user_device_bindings WHERE product_id = ? AND hardware_id = ?').run(DB.getProductIdByCode('xiaov'), hRollback);
    }

    // 26.16 删除产品被拒绝时幂等映射和密钥存档仍保留
    {
      // 创建一个临时产品
      const tmpProduct = DB.createProduct({ code: 'tmpdel', name: '临时删除测试', sn_prefix: 'TD', sn_seq: 0 });
      const pid = tmpProduct.id;
      const hProd = 'BB:22:33:44:55:02';
      // 在该产品下创建凭证（使 cred > 0，阻止产品删除）
      const t1 = await req('POST', '/admin/api/provision', { product: 'tmpdel', hardware_id: hProd, new_sn: true, request_id: 'req-prod-del-1' }, { Authorization: `Bearer ${PROV}` });
      check('26.16 临时产品下创建凭证成功', t1.body.ok === true);
      // 验证映射和存档存在
      const mapBefore = DB.db.prepare('SELECT COUNT(*) as n FROM provision_requests WHERE product_id = ?').get(pid);
      const archBefore = DB.db.prepare('SELECT COUNT(*) as n FROM factory_key_archive WHERE product_id = ?').get(pid);
      check('26.16 映射已存在', mapBefore.n >= 1);
      check('26.16 存档已存在', archBefore.n >= 1);
      // 尝试删除产品：应被拒绝（cred > 0）
      const result = DB.deleteProduct(pid);
      check('26.16 删除产品被拒绝', result === false);
      // 验证映射和存档仍保留
      const mapAfter = DB.db.prepare('SELECT COUNT(*) as n FROM provision_requests WHERE product_id = ?').get(pid);
      const archAfter = DB.db.prepare('SELECT COUNT(*) as n FROM factory_key_archive WHERE product_id = ?').get(pid);
      check('26.16 拒绝删除后映射仍保留', mapAfter.n === mapBefore.n);
      check('26.16 拒绝删除后存档仍保留', archAfter.n === archBefore.n);
      // 清理：删除凭证后再删产品
      let cl = await req('GET', '/admin/api/credentials?product=tmpdel', null, { Authorization: `Bearer ${ADMIN}` });
      for (const c of cl.body) {
        await req('DELETE', `/admin/api/credentials/${c.id}`, null, { Authorization: `Bearer ${ADMIN}` });
      }
      DB.deleteProduct(pid);
    }

    // 26.17 删除产品事务中外键失败时存档和映射回滚
    // 产品有用户引用但无凭证/订单 → deleteProduct 检查通过 → 事务中删产品时 FK 失败 → 回滚
    {
      const tmpProduct = DB.createProduct({ code: 'tmpfk', name: 'FK失败测试', sn_prefix: 'TF', sn_seq: 0 });
      const pid = tmpProduct.id;
      const hFk = 'BB:33:44:55:66:03';
      // 创建凭证 → 删除凭证（留下映射和存档），使 cred=0
      const t1 = await req('POST', '/admin/api/provision', { product: 'tmpfk', hardware_id: hFk, new_sn: true, request_id: 'req-fk-1' }, { Authorization: `Bearer ${PROV}` });
      check('26.17 创建凭证成功', t1.body.ok === true);
      let cl = await req('GET', '/admin/api/credentials?product=tmpfk', null, { Authorization: `Bearer ${ADMIN}` });
      for (const c of cl.body) {
        await req('DELETE', `/admin/api/credentials/${c.id}`, null, { Authorization: `Bearer ${ADMIN}` });
      }
      // 此时 cred=0, ord=0，但 provision_requests 和 factory_key_archive 有数据
      const mapBefore = DB.db.prepare('SELECT COUNT(*) as n FROM provision_requests WHERE product_id = ?').get(pid);
      const archBefore = DB.db.prepare('SELECT COUNT(*) as n FROM factory_key_archive WHERE product_id = ?').get(pid);
      check('26.17 删凭证后映射仍存在', mapBefore.n >= 1);
      check('26.17 删凭证后存档仍存在', archBefore.n >= 1);
      // 创建用户（users 表有 FK → products，阻止删除）
      DB.createUser(pid, '13900000001', 'hash_test_placeholder');
      check('26.17 用户已创建', !!DB.db.prepare('SELECT id FROM users WHERE product_id = ? AND phone = ?').get(pid, '13900000001'));
      // deleteProduct 检查 cred=0, ord=0 → 进入事务 → 删映射/存档 → 删产品时 FK 失败 → 回滚
      let deleteFailed = false;
      try {
        DB.deleteProduct(pid);
      } catch (e) {
        deleteFailed = true;
      }
      check('26.17 删除产品因用户 FK 失败', deleteFailed === true);
      // 验证映射和存档仍保留（事务回滚）
      const mapAfter = DB.db.prepare('SELECT COUNT(*) as n FROM provision_requests WHERE product_id = ?').get(pid);
      const archAfter = DB.db.prepare('SELECT COUNT(*) as n FROM factory_key_archive WHERE product_id = ?').get(pid);
      check('26.17 FK 失败后映射仍保留', mapAfter.n === mapBefore.n);
      check('26.17 FK 失败后存档仍保留', archAfter.n === archBefore.n);
      // 清理：删用户 → 删产品
      DB.db.prepare('DELETE FROM users WHERE product_id = ?').run(pid);
      DB.db.prepare('DELETE FROM provision_requests WHERE product_id = ?').run(pid);
      DB.db.prepare('DELETE FROM factory_key_archive WHERE product_id = ?').run(pid);
      DB.deleteProduct(pid);
    }

    // ===== 26.18~26.23 SN 预留 / 指定 / 切回（数据归属新模型） =====
    // 归属：绑定/服务期挂物理设备（MAC），火山权益按 SN 记录（device_sn_rights）。
    // 管理员指定"下次上线 SN"是纯选择：不搬绑定、不清权益、不受订单影响。
    // 平台预留 SN 不依赖火山：复用 FactoryKey，不重新烧 eFuse、不创建烧录 challenge。
    console.log('\n--- 26.18~26.23 SN 预留 / 指定 / 切回 ---');
    {
      const h28 = '11:22:33:44:55:66';
      // 每次请求用新的 timestamp+nonce（防重放）
      const v1body = (action) => {
        const ts = Date.now(); const nonce = crypto.randomBytes(8).toString('hex');
        return { hardware_id: h28, timestamp: ts, nonce, signature: sign(fk28, action, h28, ts, nonce) };
      };
      // 任意 MAC/密钥的 v1 签名请求体（26.23 第二台设备用）
      const v1body2 = (fk, hwid) => (action) => {
        const ts = Date.now(); const nonce = crypto.randomBytes(8).toString('hex');
        return { hardware_id: hwid, timestamp: ts, nonce, signature: sign(fk, action, hwid, ts, nonce) };
      };

      // 26.18 A：首次烧录 → verify → activate（test 模式，激活后 volcano_registered）
      let r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: h28, request_id: 'p28-1' }, { Authorization: `Bearer ${PROV}` });
      check('26.18 A 首次烧录成功', r.body.ok && !!r.body.factory_key);
      const fk28 = r.body.factory_key, snA28 = r.body.sn, chA28 = r.body.challenge;
      r = await req('POST', '/admin/api/provision/verify', { product: 'xiaov', hardware_id: h28, challenge: chA28, response: signVerify(fk28, h28, chA28) }, { Authorization: `Bearer ${PROV}` });
      check('26.18 A 验证成功', r.body.ok && r.body.status === 'provisioned');
      r = await req('POST', '/xiaov/api/device/activate', v1body('activate'));
      check('26.18 A 激活成功（volcano_registered）', r.body.ok === true && r.body.sn === snA28 && !!r.body.device_secret);
      const credA28 = DB.getCredentialBySn(xiaovId, snA28);
      const secretA28 = r.body.device_secret;
      // 新模型：激活即获得一年权益（激活推算到期，无需人工确认关卡）
      check('26.18 A 激活即记录一年权益（激活推算）', DB.getSnRights(credA28.id).provider_renew_status === 'completed' && !!DB.getSnRights(credA28.id).provider_expires_at);

      // 业务现状：绑定 + 服务期 + 已支付订单（绑定/服务期挂 MAC；订单记录针对的 SN）
      const salt28 = crypto.randomBytes(16).toString('hex');
      const ph28 = crypto.pbkdf2Sync('test12345', salt28, 100000, 64, 'sha512').toString('hex');
      const u28 = DB.createUser(xiaovId, '13900000099', `pbkdf2$${salt28}$${ph28}`);
      r = await req('POST', '/xiaov/api/auth/login', { phone: '13900000099', password: 'test12345' });
      const userToken28 = r.body.token;
      check('26.18 切换测试用户登录成功', !!userToken28);
      DB.createBinding(u28.id, xiaovId, h28, '测试切换');
      const svcA28 = DB.createServiceForDevice(u28.id, xiaovId, h28, 'annual', 1);
      const ord28 = DB.createOrder({ userId: u28.id, credentialId: credA28.id, productId: xiaovId, amount: 299, plan: 'annual', years: 1 });
      DB.db.prepare("UPDATE orders SET status = 'paid', paid_at = datetime('now') WHERE order_no = ?").run(ord28.order_no);

      // 26.19 非法状态不可选：烧录中（provisioning）/ 已退役（retired）
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: h28, new_sn: true, request_id: 'p28-3' }, { Authorization: `Bearer ${PROV}` });
      const credP28 = DB.getCredentialBySn(xiaovId, r.body.sn); // 保持 provisioning 状态
      let threw28 = false;
      try { DB.setPrimaryCredential(xiaovId, h28, credP28.id); } catch (e) { threw28 = e.message === 'device_not_switchable'; }
      check('26.19 provisioning 凭证指定被拒', threw28);
      DB.setCredentialStatus(credP28.id, 'retired');
      threw28 = false;
      try { DB.setPrimaryCredential(xiaovId, h28, credP28.id); } catch (e) { threw28 = e.message === 'device_not_switchable'; }
      check('26.19 retired 凭证指定被拒', threw28);
      check('26.19 拒绝后仍解析到 A（最近激活）', DB.getCredentialByHardwareId(xiaovId, h28).id === credA28.id);
      // 基准：26.19 已新增一份烧录映射（p28-3），此后预留不应再新增
      const mapCount28 = DB.db.prepare('SELECT COUNT(*) AS n FROM provision_requests WHERE hardware_id = ?').get(h28).n;

      // 26.20 预留 B：平台行为，不请求火山、不重新烧录
      r = await req('POST', '/admin/api/devices/reserve-sn', { product: 'xiaov', hardware_id: h28 }, { Authorization: `Bearer ${ADMIN}` });
      check('26.20 预留新 SN 成功', r.body.ok === true && !!r.body.sn);
      const snB28 = r.body.sn;
      const credB28 = DB.getCredentialBySn(xiaovId, snB28);
      check('26.20 预留 SN 初始为待火山激活（provisioned）', credB28.status === 'provisioned' && !credB28.volcano_device_secret && !credB28.volcano_activated_at);
      check('26.20 预留不创建烧录 challenge（不重新烧 eFuse）', !credB28.provision_challenge);
      check('26.20 预留不新增烧录请求映射', DB.db.prepare('SELECT COUNT(*) AS n FROM provision_requests WHERE hardware_id = ?').get(h28).n === mapCount28);
      check('26.20 预留复用物理设备共享 FactoryKey', DB.getDecryptedFactoryKey(credB28) === fk28);
      // 全新 MAC（无任何出厂记录）不能预留
      r = await req('POST', '/admin/api/devices/reserve-sn', { product: 'xiaov', hardware_id: '99:88:77:66:55:44' }, { Authorization: `Bearer ${ADMIN}` });
      check('26.20 全新 MAC 预留被拒（需先走出厂烧录）', r.status === 404 && r.body.error === 'device_not_found');

      // 26.20b 预留幂等：同 request_id 重试返回同一 SN，不重复生成
      r = await req('POST', '/admin/api/devices/reserve-sn', { product: 'xiaov', hardware_id: h28, request_id: 'reserve-28-idem' }, { Authorization: `Bearer ${ADMIN}` });
      check('26.20b 带请求 ID 首次预留成功', r.body.ok === true && r.body.reused === false);
      const snIdem28 = r.body.sn;
      const seqAfterFirst28 = DB.getProductRow(xiaovId).sn_seq;
      r = await req('POST', '/admin/api/devices/reserve-sn', { product: 'xiaov', hardware_id: h28, request_id: 'reserve-28-idem' }, { Authorization: `Bearer ${ADMIN}` });
      check('26.20b 重试返回同一 SN（幂等重放）', r.body.ok === true && r.body.reused === true && r.body.sn === snIdem28);
      check('26.20b 重试不新增 SN 序列', DB.getProductRow(xiaovId).sn_seq === seqAfterFirst28);
      r = await req('POST', '/admin/api/devices/reserve-sn', { product: 'xiaov', hardware_id: 'AA:BB:CC:00:09:99', request_id: 'reserve-28-idem' }, { Authorization: `Bearer ${ADMIN}` });
      check('26.20b request_id 挪用到其他 MAC 被拒', r.status === 409 && r.body.error === 'request_id_conflict');
      // 仅烧录未完成出厂验证的 MAC 不能预留（不能仅凭 provisioning 记录预留可激活凭证）
      await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: 'AA:BB:CC:00:09:98', request_id: 'p-unverified-98' }, { Authorization: `Bearer ${PROV}` });
      r = await req('POST', '/admin/api/devices/reserve-sn', { product: 'xiaov', hardware_id: 'AA:BB:CC:00:09:98' }, { Authorization: `Bearer ${ADMIN}` });
      check('26.20b 未完成出厂验证的 MAC 预留被拒', r.status === 409 && r.body.error === 'factory_verify_incomplete');
      // 清理 26.20b 辅助 MAC
      DB.db.prepare("DELETE FROM device_credentials WHERE product_id = ? AND hardware_id = ?").run(xiaovId, 'AA:BB:CC:00:09:98');
      DB.db.prepare("DELETE FROM provision_requests WHERE hardware_id = ?").run('AA:BB:CC:00:09:98');
      DB.db.prepare("DELETE FROM factory_key_archive WHERE hardware_id = ?").run('AA:BB:CC:00:09:98');

      // 26.20d 出厂验证事实持久化（factory_verified_devices，物理设备层）：
      //   ① 删除烧录中/失败的记录绕不过验证检查——密钥存档只说明烧过密钥，不等于验证成功；
      //   ② 未经验证的记录直接退役也不算验证成功（退役≠验证）；
      //   ③ 已验证设备的凭证全部删除后，事实仍保留，预留照常允许。
      const hUnv97 = 'AA:BB:CC:00:09:97';
      await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hUnv97, request_id: 'p-unverified-97' }, { Authorization: `Bearer ${PROV}` });
      const credUnv97 = DB.getCredentialByHardwareId(xiaovId, hUnv97);
      DB.setCredentialStatus(credUnv97.id, 'retired');
      DB.deleteCredential(credUnv97.id);
      r = await req('POST', '/admin/api/devices/reserve-sn', { product: 'xiaov', hardware_id: hUnv97 }, { Authorization: `Bearer ${ADMIN}` });
      check('26.20d 未经验证的记录退役+删除后预留仍被拒（退役≠验证成功）', r.status === 409 && r.body.error === 'factory_verify_incomplete');
      DB.db.prepare("DELETE FROM provision_requests WHERE hardware_id = ?").run(hUnv97);
      DB.db.prepare("DELETE FROM factory_key_archive WHERE hardware_id = ?").run(hUnv97);

      const hVer96 = 'AA:BB:CC:00:09:96';
      await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hVer96, request_id: 'p-verified-96' }, { Authorization: `Bearer ${PROV}` });
      const credVer96 = DB.getCredentialByHardwareId(xiaovId, hVer96);
      DB.setCredentialStatus(credVer96.id, 'provisioned');   // 验证通过 → 固化事实
      check('26.20d 验证通过固化物理设备层事实标记', !!DB.db.prepare('SELECT 1 FROM factory_verified_devices WHERE product_id = ? AND hardware_id = ?').get(xiaovId, hVer96));
      DB.setCredentialStatus(credVer96.id, 'retired');
      DB.deleteCredential(credVer96.id);                      // 已验证设备：退役后可删除
      check('26.20d 已验证设备的凭证删除后事实仍保留', !!DB.db.prepare('SELECT 1 FROM factory_verified_devices WHERE product_id = ? AND hardware_id = ?').get(xiaovId, hVer96));
      r = await req('POST', '/admin/api/devices/reserve-sn', { product: 'xiaov', hardware_id: hVer96 }, { Authorization: `Bearer ${ADMIN}` });
      check('26.20d 删除已验证设备的全部凭证后预留仍成功（事实不受删除影响）', r.status === 200 && r.body.ok === true && !!r.body.sn);
      // 清理 26.20d 辅助 MAC
      DB.db.prepare("DELETE FROM device_credentials WHERE product_id = ? AND hardware_id = ?").run(xiaovId, hVer96);
      DB.db.prepare("DELETE FROM provision_requests WHERE hardware_id = ?").run(hVer96);
      DB.db.prepare("DELETE FROM factory_key_archive WHERE hardware_id = ?").run(hVer96);
      DB.db.prepare("DELETE FROM factory_verified_devices WHERE hardware_id = ?").run(hVer96);

      // 26.20e 重启漏洞回归：从未验证的记录退役后，重启服务（启动回填）不得当成验证成功。
      // 完整时序：创建未验证记录 → 退役 → 重启服务 → 删除记录 → 预留 SN，仍必须拒绝。
      const hRestart95 = 'AA:BB:CC:00:09:95';
      const hasMarker95 = () => !!DB.db.prepare('SELECT 1 FROM factory_verified_devices WHERE product_id = ? AND hardware_id = ?').get(xiaovId, hRestart95);
      await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hRestart95, request_id: 'p-restart-95' }, { Authorization: `Bearer ${PROV}` });
      const credRestart95 = DB.getCredentialByHardwareId(xiaovId, hRestart95);
      DB.setCredentialStatus(credRestart95.id, 'retired');  // 未验证直接退役
      check('26.20e 未验证记录退役不产生事实标记', !hasMarker95());
      // 模拟服务重启：子进程在同一数据目录重新加载 db.js（启动回填执行）
      const { spawnSync } = require('child_process');
      const restart = spawnSync(process.execPath, ['-e', "require('./db.js')"], { cwd: __dirname, env: process.env, stdio: 'ignore' });
      check('26.20e 重启进程正常退出', restart.status === 0);
      check('26.20e 重启回填不把 retired（未验证）当作验证成功', !hasMarker95());
      DB.deleteCredential(credRestart95.id);                 // 删除记录（retired 可删）
      r = await req('POST', '/admin/api/devices/reserve-sn', { product: 'xiaov', hardware_id: hRestart95 }, { Authorization: `Bearer ${ADMIN}` });
      check('26.20e 重启 → 删除记录 → 预留仍被拒（存档不算验证成功）', r.status === 409 && r.body.error === 'factory_verify_incomplete');
      // 清理 26.20e 辅助 MAC
      DB.db.prepare("DELETE FROM provision_requests WHERE hardware_id = ?").run(hRestart95);
      DB.db.prepare("DELETE FROM factory_key_archive WHERE hardware_id = ?").run(hRestart95);
      DB.db.prepare("DELETE FROM factory_verified_devices WHERE hardware_id = ?").run(hRestart95);

      // deleteProduct 必须清理 factory_verified_devices，否则外键阻塞产品删除
      const delProd = DB.createProduct({ code: 'deltest' + crypto.randomBytes(3).toString('hex'), name: '删除测试', sn_prefix: 'DT' });
      DB.db.prepare("INSERT OR IGNORE INTO factory_verified_devices (product_id, hardware_id) VALUES (?, 'AA:BB:CC:00:09:94')").run(delProd.id);
      check('26.20e deleteProduct 清理出厂验证标记（不被外键阻塞）', DB.deleteProduct(delProd.id) === true);

      // 26.20c 指定"待激活"的 B 为下次上线 SN（选择不依赖火山先注册）
      r = await req('PATCH', `/admin/api/credentials/${credB28.id}/primary`, {}, { Authorization: `Bearer ${ADMIN}` });
      check('26.20 待激活（provisioned）的 SN 可直接指定', r.body.ok === true && r.body.selected === true && r.body.sn === snB28);
      check('26.20 指定后 B 为后台选定', !!DB.getCredentialById(credB28.id).pending_primary);
      check('26.20 指定后 A 仍是最近激活凭证', !!DB.getCredentialById(credA28.id).is_primary);
      // 指定是纯选择：绑定/服务期/订单原样
      check('26.20 指定不动绑定', DB.getBindingByHardware(xiaovId, h28).user_id === u28.id);
      check('26.20 指定不动服务期', DB.getServiceByHardware(xiaovId, h28).expires_at === svcA28.expires_at);
      check('26.20 指定不改写历史订单', DB.getOrderByNo(ord28.order_no).credential_id === credA28.id);
      // 不带 SN 的 status 仍指向最近激活的 A（与设备缓存一致）
      r = await req('POST', '/xiaov/api/device/status', v1body('status'));
      check('26.20 指定后未激活前 status 仍指向 A（与设备缓存一致）', r.body.ok && r.body.sn === snA28 && r.body.bound === true && r.body.service_status === 'active' && r.body.ai_allowed === true);

      // 26.20d 设备上线激活 B：不带 SN activate → 解析到后台选定的 B，走首次火山注册
      const rightsA28Before = rightsOf(credA28.id);
      r = await req('POST', '/xiaov/api/device/activate', v1body('activate'));
      check('26.20 指定后 activate 返回 B（首次注册，非 recovered）', r.body.ok === true && r.body.sn === snB28 && r.body.recovered === false && !!r.body.device_secret);
      const secretB28 = r.body.device_secret;
      check('26.20 B 成为最近激活凭证（后台选定保持粘性）', !!DB.getCredentialById(credB28.id).is_primary && !!DB.getCredentialById(credB28.id).pending_primary && !DB.getCredentialById(credA28.id).is_primary);
      // 绑定/服务期仍挂物理设备：激活不搬迁任何记录
      check('26.20 绑定不因激活而变化', DB.getBindingByHardware(xiaovId, h28).user_id === u28.id);
      check('26.20 服务期不因激活而变化', DB.getServiceByHardware(xiaovId, h28).expires_at === svcA28.expires_at);
      // B 激活即自动获得一年权益（completed，激活推算到期，无人工确认关卡）；
      // A 的权益原样保留（License 属于各自 SN，ON CONFLICT DO NOTHING 不覆盖）
      const rightsB28 = rightsOf(credB28.id);
      check('26.20 B 激活即获得一年权益（completed）', !!rightsB28 && rightsB28.provider_renew_status === 'completed' && !rightsB28.provider_license_id);
      check('26.20 B 推算到期 = 激活时间 +1 年', Math.abs(new Date(rightsB28.provider_expires_at.replace(' ', 'T') + 'Z').getTime() - (Date.now() + 365 * 86400e3)) < 60e3);
      check('26.20 A 的权益不受影响', JSON.stringify(rightsOf(credA28.id)) === JSON.stringify(rightsA28Before));
      check('26.20 历史订单保留原凭证归属（不迁移）', DB.getOrderByNo(ord28.order_no).credential_id === credA28.id);
      // 激活后：不带 SN 的 status 指向 B（最近激活），绑定/服务期有效
      r = await req('POST', '/xiaov/api/device/status', v1body('status'));
      check('26.20 激活后 status 指向 B 且绑定/服务期有效', r.body.ok && r.body.sn === snB28 && r.body.bound === true && r.body.service_status === 'active');

      // 26.21 二维码/轮询：绑定挂 MAC，任一 SN 已绑定即已绑定
      r = await req('POST', '/xiaov/api/device/bind/qrcode', v1body('qrcode'));
      check('26.21 不带 SN 生成二维码 → 已绑定（挂 MAC）', r.body.ok === true && r.body.already_bound === true);
      const token28 = DB.createBindToken(credA28.id).temp_token;
      {
        const ts = Date.now(); const nonce = crypto.randomBytes(8).toString('hex');
        const sigP = crypto.createHmac('sha256', Buffer.from(fk28, 'hex')).update(`v1|poll|${h28}|${ts}|${nonce}`).digest('base64');
        r = await req('POST', '/xiaov/api/device/bind/poll', { hardware_id: h28, temp_token: token28, timestamp: ts, nonce, signature: sigP });
      }
      check('26.21 未确认的 token 轮询返回 pending', r.body.ok && r.body.status === 'pending');

      // ===== 26.22 激活失败保留 A 完整凭证 → 切回 A → 返回 A 原凭证 =====
      console.log('\n--- 26.22 激活失败 / 切回 A ---');
      {
        // 预留 C 并指定为下次上线（模拟切换到另一个新 SN）
        r = await req('POST', '/admin/api/devices/reserve-sn', { product: 'xiaov', hardware_id: h28 }, { Authorization: `Bearer ${ADMIN}` });
        check('26.22 预留 C 成功', r.body.ok === true && !!r.body.sn);
        const snC28 = r.body.sn;
        const credC28 = DB.getCredentialBySn(xiaovId, snC28);
        r = await req('PATCH', `/admin/api/credentials/${credC28.id}/primary`, {}, { Authorization: `Bearer ${ADMIN}` });
        check('26.22 指定 C 为下次上线', r.body.ok === true);

        // 设备激活失败（未成功上线）：B 仍是最近激活凭证且凭证完整，A 原凭证原样保留
        r = await req('POST', '/xiaov/api/device/status', v1body('status'));
        check('26.22 C 激活失败后 status 仍指向 B（最近激活）', r.body.ok && r.body.sn === snB28 && r.body.device_secret_ready === true);
        check('26.22 A 的 DeviceSecret 原样保留', DB.getDecryptedDeviceSecret(credA28) === secretA28);
        check('26.22 B 的 DeviceSecret 原样保留', DB.getDecryptedDeviceSecret(DB.getCredentialBySn(xiaovId, snB28)) === secretB28);

        // 后台选回 A：任意未停用的旧 SN 随时可指定，不受订单/激活结果影响
        r = await req('PATCH', `/admin/api/credentials/${credA28.id}/primary`, {}, { Authorization: `Bearer ${ADMIN}` });
        check('26.22 切回 A 成功', r.body.ok === true && r.body.selected === true);
        check('26.22 切回后 C 不再是后台选定', !DB.getCredentialById(credC28.id).pending_primary);

        // 设备下次上线：不带 SN activate → 返回 A 的原凭证（recovered，secret 原样）
        r = await req('POST', '/xiaov/api/device/activate', v1body('activate'));
        check('26.22 切回后激活返回 A 的原 device_secret', r.body.ok === true && r.body.sn === snA28 && r.body.recovered === true && r.body.device_secret === secretA28);
        check('26.22 切回后 A 成为最近激活凭证', !!DB.getCredentialById(credA28.id).is_primary && !DB.getCredentialById(credB28.id).is_primary);

        // B 后续带 SN 激活成功也不能自动覆盖后台已经选定的 A
        {
          const ts = Date.now(); const nonce = crypto.randomBytes(8).toString('hex');
          const sigB2 = crypto.createHmac('sha256', Buffer.from(fk28, 'hex')).update(`v2|activate|${h28}|${snB28}|${ts}|${nonce}`).digest('base64');
          r = await req('POST', '/xiaov/api/device/activate', { hardware_id: h28, timestamp: ts, nonce, signature: sigB2, sn: snB28 });
        }
        check('26.22 B 带 SN 激活成功（恢复原密钥）', r.body.ok === true && r.body.sn === snB28 && r.body.recovered === true && r.body.device_secret === secretB28);
        check('26.22 B 激活后后台选定仍是 A（粘性不改写）', !!DB.getCredentialById(credA28.id).pending_primary);
        r = await req('POST', '/xiaov/api/device/activate', v1body('activate'));
        check('26.22 下次不带 SN 上线仍返回后台选定的 A', r.body.ok === true && r.body.sn === snA28 && r.body.device_secret === secretA28);

        // 切换期间下单：订单挂到当时的解析目标（A），选择变化不改写已有订单
        const bind28 = DB.getBindingByHardware(xiaovId, h28);
        r = await req('POST', `/xiaov/api/devices/${bind28.id}/renew`, { years: 1 }, { Authorization: `Bearer ${userToken28}` });
        check('26.22 pending 期间新增订单成功', r.body.ok === true);
        check('26.22 新订单挂到当前解析目标 A（后台选定优先）', DB.getOrderByNo(r.body.order_no).credential_id === credA28.id);
        r = await req('PATCH', `/admin/api/orders/${r.body.order_id}/mark-paid`, {}, { Authorization: `Bearer ${ADMIN}` });
        check('26.22 切换期间订单照常确认收款', r.body.ok === true);
        check('26.22 服务期延长只依赖物理设备（与选择无关）', new Date(DB.getServiceByHardware(xiaovId, h28).expires_at).getTime() > new Date(svcA28.expires_at).getTime());
      }

      // ===== 26.23 切换不受订单/续费任务影响；任务始终绑定各自 SN =====
      console.log('\n--- 26.23 切换不受订单/续费任务影响 ---');
      {
        const h28b = '11:22:33:44:55:77';
        // A2：已激活凭证；B2：平台预留的待激活 SN（复用 FactoryKey，不重新烧录）
        r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: h28b, request_id: 'p28-10' }, { Authorization: `Bearer ${PROV}` });
        const fkA2 = r.body.factory_key, snA2 = r.body.sn, chA2 = r.body.challenge;
        await req('POST', '/admin/api/provision/verify', { product: 'xiaov', hardware_id: h28b, challenge: chA2, response: signVerify(fkA2, h28b, chA2) }, { Authorization: `Bearer ${PROV}` });
        await req('POST', '/xiaov/api/device/activate', v1body2(fkA2, h28b)('activate'));
        r = await req('POST', '/admin/api/devices/reserve-sn', { product: 'xiaov', hardware_id: h28b }, { Authorization: `Bearer ${ADMIN}` });
        check('26.23 预留 B2 成功', r.body.ok === true && !!r.body.sn);
        const snB2 = r.body.sn;
        const credA2 = DB.getCredentialBySn(xiaovId, snA2);
        const credB2 = DB.getCredentialBySn(xiaovId, snB2);

        // B2 上的三类订单任务：待确认 / 处理中 / 已失败（都不应阻止切回 A2）
        const uX = DB.createUser(xiaovId, '13900000097', 'hash-x');
        DB.createBinding(uX.id, xiaovId, h28b, 'X的设备');
        DB.createServiceForDevice(uX.id, xiaovId, h28b, 'annual', 1);
        const ordPend = DB.createOrder({ userId: uX.id, credentialId: credB2.id, productId: xiaovId, amount: 299, plan: 'annual', years: 1 });
        const ordProc = DB.createOrder({ userId: uX.id, credentialId: credB2.id, productId: xiaovId, amount: 299, plan: 'annual', years: 1 });
        DB.db.prepare("UPDATE orders SET status='paid', paid_at=datetime('now'), provider_renew_status='processing' WHERE order_no=?").run(ordProc.order_no);
        const ordFail = DB.createOrder({ userId: uX.id, credentialId: credB2.id, productId: xiaovId, amount: 299, plan: 'annual', years: 1 });
        DB.db.prepare("UPDATE orders SET status='paid', paid_at=datetime('now'), provider_renew_status='failed', provider_renew_error='mock' WHERE order_no=?").run(ordFail.order_no);
        // A2 的历史已支付订单
        const ordPaid = DB.createOrder({ userId: uX.id, credentialId: credA2.id, productId: xiaovId, amount: 299, plan: 'annual', years: 1 });
        DB.db.prepare("UPDATE orders SET status='paid', paid_at=datetime('now') WHERE order_no=?").run(ordPaid.order_no);

        // 三类订单都不拦截指定：B 激活/续期失败仍可随时切回 A
        r = await req('PATCH', `/admin/api/credentials/${credA2.id}/primary`, {}, { Authorization: `Bearer ${ADMIN}` });
        check('26.23 待确认/处理中/失败订单均不拦截切回 A2', r.body.ok === true && r.body.selected === true);
        check('26.23 切回后 B2 的任务仍绑定 B2（不迁移不改写）', [
          [ordPend, 'none', 'pending'], [ordProc, 'processing', 'paid'], [ordFail, 'failed', 'paid'],
        ].every(([o, renew, st]) => {
          const row = DB.getOrderByNo(o.order_no);
          return row.credential_id === credB2.id && row.provider_renew_status === renew && row.status === st;
        }));
        check('26.23 A2 历史订单归属不变', DB.getOrderByNo(ordPaid.order_no).credential_id === credA2.id);
        check('26.23 切换不动绑定与服务期（挂 MAC）', DB.getBindingByHardware(xiaovId, h28b).user_id === uX.id && DB.getServiceByHardware(xiaovId, h28b).user_id === uX.id);

        // B2 续期任务完成：结果写入 B2 的权益，不影响 A2，也不改写已选定的 A2
        // （A2 已激活，按"激活即一年"新语义权益为 completed；断言改为续期前后 A2 权益原样不变）
        const rightsA2BeforeRenew = DB.getSnRights(credA2.id);
        check('26.23 B2 续期任务完成成功', DB.completeOrderRenew(DB.getOrderByNo(ordProc.order_no).id, 'LIC-B2-001', 'admin') === true);
        check('26.23 续期结果写入 B2 的 device_sn_rights', DB.getSnRights(credB2.id).provider_renew_status === 'completed' && DB.getSnRights(credB2.id).provider_license_id === 'LIC-B2-001');
        check('26.23 B2 续期不影响 A2 权益', JSON.stringify(DB.getSnRights(credA2.id)) === JSON.stringify(rightsA2BeforeRenew));
        check('26.23 B2 续期完成不改写后台选定的 A2', !!DB.getCredentialById(credA2.id).pending_primary && !DB.getCredentialById(credB2.id).pending_primary);

        // B2 后续带 SN 激活成功（首次火山注册）：返回 B2 凭证，但不覆盖选定的 A2
        {
          const ts = Date.now(); const nonce = crypto.randomBytes(8).toString('hex');
          const sigB2 = crypto.createHmac('sha256', Buffer.from(fkA2, 'hex')).update(`v2|activate|${h28b}|${snB2}|${ts}|${nonce}`).digest('base64');
          r = await req('POST', '/xiaov/api/device/activate', { hardware_id: h28b, timestamp: ts, nonce, signature: sigB2, sn: snB2 });
        }
        check('26.23 B2 带 SN 激活成功（首次注册）', r.body.ok === true && r.body.sn === snB2 && r.body.recovered === false);
        check('26.23 B2 激活成功仍不改写后台选定的 A2', !!DB.getCredentialById(credA2.id).pending_primary && !DB.getCredentialById(credB2.id).pending_primary);

        // 下次不带 SN 上线仍解析到选定的 A2，返回 A2 原凭证
        r = await req('POST', '/xiaov/api/device/activate', v1body2(fkA2, h28b)('activate'));
        check('26.23 下次上线仍返回选定的 A2 原凭证', r.body.ok === true && r.body.sn === snA2 && r.body.recovered === true);

        // 清理 26.23
        DB.db.prepare('DELETE FROM device_sn_rights WHERE credential_id IN (?, ?)').run(credA2.id, credB2.id);
        DB.db.prepare('DELETE FROM orders WHERE credential_id IN (?, ?)').run(credA2.id, credB2.id);
        DB.db.prepare('DELETE FROM device_services WHERE product_id = ? AND hardware_id = ?').run(xiaovId, h28b);
        DB.db.prepare('DELETE FROM user_device_bindings WHERE product_id = ? AND hardware_id = ?').run(xiaovId, h28b);
        DB.db.prepare('DELETE FROM users WHERE id = ?').run(uX.id);
        DB.db.prepare('DELETE FROM device_credentials WHERE product_id = ? AND hardware_id = ?').run(xiaovId, h28b);
        DB.db.prepare('DELETE FROM provision_requests WHERE hardware_id = ?').run(h28b);
        DB.db.prepare('DELETE FROM factory_key_archive WHERE hardware_id = ?').run(h28b);
      }

      // 清理
      DB.db.prepare('DELETE FROM device_bind_tokens WHERE credential_id = ?').run(credA28.id);
      DB.db.prepare('DELETE FROM device_sn_rights WHERE credential_id IN (SELECT id FROM device_credentials WHERE product_id = ? AND hardware_id = ?)').run(xiaovId, h28);
      DB.db.prepare('DELETE FROM orders WHERE credential_id IN (SELECT id FROM device_credentials WHERE product_id = ? AND hardware_id = ?)').run(xiaovId, h28);
      DB.db.prepare('DELETE FROM device_services WHERE product_id = ? AND hardware_id = ?').run(xiaovId, h28);
      DB.db.prepare('DELETE FROM user_device_bindings WHERE product_id = ? AND hardware_id = ?').run(xiaovId, h28);
      DB.db.prepare('DELETE FROM users WHERE id = ?').run(u28.id);
      DB.db.prepare('DELETE FROM device_credentials WHERE product_id = ? AND hardware_id = ?').run(xiaovId, h28);
      DB.db.prepare('DELETE FROM provision_requests WHERE hardware_id = ?').run(h28);
      DB.db.prepare('DELETE FROM factory_key_archive WHERE hardware_id = ?').run(h28);
      DB.db.prepare("DELETE FROM used_nonces WHERE 1").run();
    }

    // ===== 26.24 绑定轮询按 MAC 核对：生成二维码 → 换 SN → 扫码确认 → 轮询成功 =====
    console.log('\n--- 26.24 绑定 token 挂 MAC（换 SN 后轮询仍成功，跨 MAC 拒绝） ---');
    {
      const h29 = '22:33:44:55:66:88';
      // A：烧录 → 验证 → 激活
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: h29, request_id: 'p29-1' }, { Authorization: `Bearer ${PROV}` });
      const fk29 = r.body.factory_key, snA29 = r.body.sn, ch29 = r.body.challenge;
      await req('POST', '/admin/api/provision/verify', { product: 'xiaov', hardware_id: h29, challenge: ch29, response: signVerify(fk29, h29, ch29) }, { Authorization: `Bearer ${PROV}` });
      const v1b29 = (action) => {
        const ts = Date.now(); const nonce = crypto.randomBytes(8).toString('hex');
        return { hardware_id: h29, timestamp: ts, nonce, signature: sign(fk29, action, h29, ts, nonce) };
      };
      await req('POST', '/xiaov/api/device/activate', v1b29('activate'));
      // 生成二维码（token 挂在 A 的凭证上）
      r = await req('POST', '/xiaov/api/device/bind/qrcode', v1b29('qrcode'));
      const token29 = r.body.temp_token;
      check('26.24 生成绑定二维码成功', !!token29);
      // 换 SN：预留 B 并指定，设备激活 B
      r = await req('POST', '/admin/api/devices/reserve-sn', { product: 'xiaov', hardware_id: h29 }, { Authorization: `Bearer ${ADMIN}` });
      const credB29 = DB.getCredentialBySn(xiaovId, r.body.sn);
      await req('PATCH', `/admin/api/credentials/${credB29.id}/primary`, {}, { Authorization: `Bearer ${ADMIN}` });
      r = await req('POST', '/xiaov/api/device/activate', v1b29('activate'));
      check('26.24 设备已切换到新 SN', r.body.ok === true && r.body.sn === credB29.sn);
      // 换 SN 后轮询（未扫码）→ pending：token 按同产品同 MAC 匹配，仍被接受
      {
        const ts = Date.now(); const nonce = crypto.randomBytes(8).toString('hex');
        const sigP = crypto.createHmac('sha256', Buffer.from(fk29, 'hex')).update(`v1|poll|${h29}|${ts}|${nonce}`).digest('base64');
        r = await req('POST', '/xiaov/api/device/bind/poll', { hardware_id: h29, temp_token: token29, timestamp: ts, nonce, signature: sigP });
      }
      check('26.24 换 SN 后旧 token 轮询仍被接受（pending）', r.body.ok === true && r.body.status === 'pending');
      // 扫码确认绑定（挂 MAC）
      r = await req('POST', '/xiaov/api/device/bind/confirm', { temp_token: token29, nickname: 'MAC绑定' }, { Authorization: `Bearer ${userToken}` });
      check('26.24 扫码绑定成功（挂 MAC）', r.body.ok === true && r.body.hardware_id === h29);
      // 轮询（无 SN → 解析到 B）→ bound（旧实现按 credential_id 核对会一直 pending）
      {
        const ts = Date.now(); const nonce = crypto.randomBytes(8).toString('hex');
        const sigP = crypto.createHmac('sha256', Buffer.from(fk29, 'hex')).update(`v1|poll|${h29}|${ts}|${nonce}`).digest('base64');
        r = await req('POST', '/xiaov/api/device/bind/poll', { hardware_id: h29, temp_token: token29, timestamp: ts, nonce, signature: sigP });
      }
      check('26.24 换 SN 后轮询返回 bound（按 MAC 核对）', r.body.ok === true && r.body.status === 'bound' && r.body.nickname === 'MAC绑定');
      // 跨 MAC 必须拒绝：另一台设备使用这个 token 轮询
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: '33:44:55:66:77:99', request_id: 'p29-2' }, { Authorization: `Bearer ${PROV}` });
      const fkX29 = r.body.factory_key;
      await req('POST', '/admin/api/provision/verify', { product: 'xiaov', hardware_id: '33:44:55:66:77:99', challenge: r.body.challenge, response: signVerify(fkX29, '33:44:55:66:77:99', r.body.challenge) }, { Authorization: `Bearer ${PROV}` });
      {
        const ts = Date.now(); const nonce = crypto.randomBytes(8).toString('hex');
        const sigP = crypto.createHmac('sha256', Buffer.from(fkX29, 'hex')).update(`v1|poll|33:44:55:66:77:99|${ts}|${nonce}`).digest('base64');
        r = await req('POST', '/xiaov/api/device/bind/poll', { hardware_id: '33:44:55:66:77:99', temp_token: token29, timestamp: ts, nonce, signature: sigP });
      }
      check('26.24 跨 MAC 使用 token 被拒', r.status === 403 && r.body.error === 'token_device_mismatch');

      // 清理 26.24
      DB.db.prepare('DELETE FROM device_bind_tokens WHERE temp_token = ?').run(token29);
      DB.db.prepare('DELETE FROM device_sn_rights WHERE credential_id IN (SELECT id FROM device_credentials WHERE product_id = ? AND hardware_id = ?)').run(xiaovId, h29);
      DB.db.prepare('DELETE FROM device_services WHERE product_id = ? AND hardware_id = ?').run(xiaovId, h29);
      DB.db.prepare('DELETE FROM user_device_bindings WHERE product_id = ? AND hardware_id = ?').run(xiaovId, h29);
      DB.db.prepare('DELETE FROM device_credentials WHERE product_id = ? AND hardware_id IN (?, ?)').run(xiaovId, h29, '33:44:55:66:77:99');
      DB.db.prepare('DELETE FROM provision_requests WHERE hardware_id IN (?, ?)').run(h29, '33:44:55:66:77:99');
      DB.db.prepare('DELETE FROM factory_key_archive WHERE hardware_id IN (?, ?)').run(h29, '33:44:55:66:77:99');
    }

    // ===== 27. 失败上报会话绑定（延迟/重复上报不误伤） =====
    console.log('\n--- 27. 失败上报会话绑定 ---');
    {
      // 27.1 A 已完成、B 进行中：A 的延迟失败上报不能修改 B
      const hAB = 'AA:22:33:44:55:66';
      const pa = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hAB, new_sn: true, request_id: 'req-ab-a' }, { Authorization: `Bearer ${PROV}` });
      const snA2 = pa.body.sn, chA2 = pa.body.challenge, fkAB = pa.body.factory_key;
      await req('POST', '/admin/api/provision/verify', {
        product: 'xiaov', hardware_id: hAB, challenge: chA2,
        response: signVerify(fkAB, hAB, chA2),
      }, { Authorization: `Bearer ${PROV}` });
      const pb = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hAB, new_sn: true, request_id: 'req-ab-b' }, { Authorization: `Bearer ${PROV}` });
      const snB2 = pb.body.sn, chB2 = pb.body.challenge;
      // A 的延迟上报：不带 challenge（多记录，目标有歧义 → 拒绝）
      r = await req('POST', '/admin/api/provision/fail', { product: 'xiaov', hardware_id: hAB, reason: 'late_from_A' }, { Authorization: `Bearer ${PROV}` });
      check('27.1 A 的无 challenge 延迟上报被拒（歧义）', r.status === 400 && r.body.error === 'ambiguous_provision_target');
      // A 的延迟上报：带 A 的旧 challenge（A 已完成，challenge 已清除 → 不匹配）
      r = await req('POST', '/admin/api/provision/fail', { product: 'xiaov', hardware_id: hAB, reason: 'late_from_A', challenge: chA2 }, { Authorization: `Bearer ${PROV}` });
      check('27.1 A 的旧 challenge 上报被拒', r.status === 410 && r.body.error === 'challenge_mismatch');
      let cl = await req('GET', '/admin/api/credentials?product=xiaov', null, { Authorization: `Bearer ${ADMIN}` });
      check('27.1 B 未被误标失败', cl.body.find(c => c.sn === snB2).status === 'provisioning');
      // B 自己的上报（带本次 challenge）正常
      r = await req('POST', '/admin/api/provision/fail', { product: 'xiaov', hardware_id: hAB, reason: 'real_B_fail', challenge: chB2 }, { Authorization: `Bearer ${PROV}` });
      check('27.1 B 带本次 challenge 上报成功', r.body.ok === true && r.body.sn === snB2);

      // 27.2 同一 SN 会话 C1 → C2（单记录 MAC）：C1 的上报不能修改 C2
      const hC = 'AA:33:44:55:66:77';
      const pc = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hC }, { Authorization: `Bearer ${PROV}` });
      const snC = pc.body.sn, chC1 = pc.body.challenge, fkC = pc.body.factory_key;
      const pc2 = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hC }, { Authorization: `Bearer ${PROV}` });
      const chC2 = pc2.body.challenge;
      check('27.2 恢复烧录轮换 challenge', chC2 !== chC1);
      // C1 的延迟上报：带 C1 challenge → 不匹配当前会话
      r = await req('POST', '/admin/api/provision/fail', { product: 'xiaov', hardware_id: hC, reason: 'late_C1', challenge: chC1 }, { Authorization: `Bearer ${PROV}` });
      check('27.2 C1 的 challenge 上报被拒', r.status === 410 && r.body.error === 'challenge_mismatch');
      // C1 的延迟上报：不带 challenge（会话已轮换，无法归因 → 拒绝）
      r = await req('POST', '/admin/api/provision/fail', { product: 'xiaov', hardware_id: hC, reason: 'late_C1' }, { Authorization: `Bearer ${PROV}` });
      check('27.2 会话轮换后无 challenge 上报被拒', r.status === 400 && r.body.error === 'challenge_required');
      // C1 的延迟上报：仅带 sn 也无法归因到具体会话 → 拒绝
      r = await req('POST', '/admin/api/provision/fail', { product: 'xiaov', hardware_id: hC, reason: 'late_C1', sn: snC }, { Authorization: `Bearer ${PROV}` });
      check('27.2 会话轮换后仅带 sn 上报被拒', r.status === 400 && r.body.error === 'challenge_required');
      cl = await req('GET', '/admin/api/credentials?product=xiaov', null, { Authorization: `Bearer ${ADMIN}` });
      check('27.2 C2 会话未被破坏', cl.body.find(c => c.sn === snC).status === 'provisioning');
      // C2 自己的上报成功
      r = await req('POST', '/admin/api/provision/fail', { product: 'xiaov', hardware_id: hC, reason: 'real_C2_fail', challenge: chC2 }, { Authorization: `Bearer ${PROV}` });
      check('27.2 C2 带 challenge 上报成功', r.body.ok === true && r.body.sn === snC);

      // 27.3 失败后恢复新会话 C3：C2 的重复上报不能影响 C3
      const pc3 = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: hC }, { Authorization: `Bearer ${PROV}` });
      const chC3 = pc3.body.challenge;
      r = await req('POST', '/admin/api/provision/fail', { product: 'xiaov', hardware_id: hC, reason: 'repeat_C2', challenge: chC2 }, { Authorization: `Bearer ${PROV}` });
      check('27.3 C2 的重复上报被拒', r.status === 410 && r.body.error === 'challenge_mismatch');
      r = await req('POST', '/admin/api/provision/fail', { product: 'xiaov', hardware_id: hC, reason: 'repeat_C2' }, { Authorization: `Bearer ${PROV}` });
      check('27.3 无 challenge 的重复上报被拒', r.status === 400 && r.body.error === 'challenge_required');
      cl = await req('GET', '/admin/api/credentials?product=xiaov', null, { Authorization: `Bearer ${ADMIN}` });
      check('27.3 C3 会话未被破坏', cl.body.find(c => c.sn === snC).status === 'provisioning');
      // C3 正常完成验证；完成后再用 C3 challenge 验证返回 already_provisioned
      r = await req('POST', '/admin/api/provision/verify', { product: 'xiaov', hardware_id: hC, challenge: chC3, response: signVerify(fkC, hC, chC3) }, { Authorization: `Bearer ${PROV}` });
      check('27.3 C3 验证成功', r.status === 200 && r.body.sn === snC);
      r = await req('POST', '/admin/api/provision/verify', { product: 'xiaov', hardware_id: hC, challenge: chC3, response: '00' }, { Authorization: `Bearer ${PROV}` });
      check('27.3 已完成后再验证返回 already_provisioned', r.status === 409 && r.body.error === 'already_provisioned');
    }

    // ===== 28. 旧库 v5 迁移：同 MAC 多绑定/多服务（子进程构造真实旧库后触发迁移） =====
    console.log('\n--- 28. 旧库 v5 迁移：冲突检查与同用户合并 ---');
    {
      // 旧库结构：绑定/服务期按 credential_id 关联（v5 迁移前的真实结构）。
      // 注意：同 MAC 多 SN 的旧库必然已运行过去 UNIQUE(product_id, hardware_id)
      // 约束的旧版迁移（多 SN 正是那时引入的），故此处建表不含该约束。
      const fixture = `// 自动生成的迁移测试夹具（merge | conflict）
const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(process.env.USERMGR_DATA_DIR, 'usermgr.db'));
db.pragma('journal_mode = WAL');
db.exec(\`
CREATE TABLE products (id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, instance_id TEXT, product_key TEXT, product_secret BLOB, bot_id TEXT, sn_prefix TEXT, sn_seq INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE users (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, phone TEXT, email TEXT, password_hash TEXT NOT NULL, plan TEXT DEFAULT 'free', plan_expires_at TEXT, email_verified INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), UNIQUE(product_id, phone), UNIQUE(product_id, email));
CREATE TABLE device_credentials (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, sn TEXT NOT NULL, hardware_id TEXT NOT NULL, factory_key BLOB NOT NULL, volcano_device_name TEXT, volcano_device_secret BLOB, volcano_activated_at TEXT, status TEXT DEFAULT 'provisioned', is_primary INTEGER DEFAULT 0, pending_primary INTEGER DEFAULT 0, pending_version INTEGER DEFAULT 0, provision_request_id TEXT, notes TEXT, created_at TEXT DEFAULT (datetime('now')), UNIQUE(product_id, sn));
CREATE TABLE user_device_bindings (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, credential_id INTEGER NOT NULL, nickname TEXT, bound_at TEXT DEFAULT (datetime('now')), last_seen_at TEXT, UNIQUE(credential_id));
CREATE TABLE device_services (id INTEGER PRIMARY KEY, credential_id INTEGER NOT NULL UNIQUE, user_id INTEGER NOT NULL, start_at TEXT NOT NULL, expires_at TEXT NOT NULL, plan TEXT DEFAULT 'annual', provider_expires_at TEXT, provider_renew_status TEXT DEFAULT 'none', provider_renew_at TEXT, provider_renew_error TEXT, provider_license_id TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE orders (id INTEGER PRIMARY KEY, order_no TEXT UNIQUE NOT NULL, user_id INTEGER NOT NULL, credential_id INTEGER NOT NULL, product_id INTEGER NOT NULL, amount INTEGER NOT NULL, plan TEXT DEFAULT 'annual', years INTEGER DEFAULT 1, status TEXT DEFAULT 'pending', voucher_text TEXT, voucher_submitted_at TEXT, paid_at TEXT, provider_renew_status TEXT DEFAULT 'none', provider_renew_at TEXT, provider_renew_completed_at TEXT, provider_renew_operator_id TEXT, provider_license_id TEXT, provider_renew_error TEXT, created_at TEXT DEFAULT (datetime('now')));
\`);
db.prepare("INSERT INTO products (id, code, name, sn_prefix, sn_seq) VALUES (1, 'xiaov', '小V机器人', 'XV', 4)").run();
db.prepare("INSERT INTO users (id, product_id, phone, password_hash) VALUES (1, 1, '13811110001', 'h1')").run();
db.prepare("INSERT INTO users (id, product_id, phone, password_hash) VALUES (2, 1, '13811110002', 'h2')").run();
const insCred = db.prepare("INSERT INTO device_credentials (id, product_id, sn, hardware_id, factory_key, status, volcano_activated_at) VALUES (?, 1, ?, ?, x'00', 'volcano_registered', '2025-01-01 00:00:00')");
insCred.run(11, 'XV000001', 'M1');
insCred.run(12, 'XV000002', 'M1');
insCred.run(13, 'XV000003', 'M2');
insCred.run(14, 'XV000004', 'M2');
const insSvc = db.prepare("INSERT INTO device_services (id, credential_id, user_id, start_at, expires_at, plan, provider_renew_status, provider_expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'none', ?, ?, ?)");
const insBind = db.prepare("INSERT INTO user_device_bindings (id, user_id, credential_id, nickname, bound_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)");
if (process.argv[2] === 'conflict') {
  // M2 的两个 SN 分属不同用户 → v5 迁移必须中止并报告
  insBind.run(21, 1, 13, 'A设备', '2025-01-01', null);
  insBind.run(22, 2, 14, 'B设备', '2025-02-01', null);
  insSvc.run(31, 13, 1, '2025-01-01', '2026-01-01', 'annual', '2026-01-01', '2025-01-01', '2025-01-01');
  insSvc.run(32, 14, 2, '2025-02-01', '2027-02-01', 'annual', '2027-02-01', '2025-02-01', '2025-02-01');
} else if (process.argv[2] === 'cross') {
  // M1：绑定与服务期各只有一条，但分属不同用户（跨表不一致）→ 也必须中止迁移
  insBind.run(21, 1, 11, 'A设备', '2025-01-01', null);
  insSvc.run(31, 12, 2, '2025-02-01', '2027-02-01', 'annual', '2027-02-01', '2025-02-01', '2025-02-01');
} else {
  // M1：同一用户两个 SN 各有绑定与服务 → 按明确规则合并为一条
  insBind.run(21, 1, 11, '旧昵称', '2025-01-01', '2025-03-01');
  insBind.run(22, 1, 12, '新昵称', '2025-02-01', '2025-04-01');
  insSvc.run(31, 11, 1, '2025-01-01', '2026-01-01', 'basic', '2026-01-01', '2025-01-01', '2025-01-01');
  insSvc.run(32, 12, 1, '2025-02-01', '2027-06-01', 'annual', '2027-06-01', '2025-02-01', '2025-02-01');
}
db.close();
try {
  require(path.join(__dirname, 'db.js'));
} catch (e) {
  console.log(JSON.stringify({ aborted: true, message: String(e.message) }));
  process.exit(0);
}
const DB = require(path.join(__dirname, 'db.js'));
console.log(JSON.stringify({
  aborted: false,
  services: DB.db.prepare('SELECT * FROM device_services').all(),
  bindings: DB.db.prepare('SELECT * FROM user_device_bindings').all(),
  rights: DB.db.prepare('SELECT * FROM device_sn_rights').all(),
  creds: DB.db.prepare('SELECT id, sn, hardware_id FROM device_credentials').all(),
}));
`;
      const fixturePath = path.join(__dirname, '.tmp-migration-fixture.js');
      fs.writeFileSync(fixturePath, fixture);
      try {
        const { spawnSync } = require('child_process');
        const runFixture = (mode) => {
          const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usermgr-mig-'));
          try {
            const res = spawnSync(process.execPath, [fixturePath, mode], {
              cwd: __dirname,
              env: { ...process.env, USERMGR_DATA_DIR: dir, KEY_ENCRYPTION_SECRET: 'a'.repeat(64) },
              encoding: 'utf8',
            });
            let payload = null;
            try { payload = JSON.parse(res.stdout.trim().split('\n').pop()); } catch (e) {}
            if (!payload) console.log(`    [fixture ${mode}] stderr: ${(res.stderr || '').slice(0, 500)}`);
            return payload;
          } finally {
            fs.rmSync(dir, { recursive: true, force: true });
          }
        };
        const merged = runFixture('merge');
        check('28 同用户多 SN 绑定/服务合并为一条', !!merged && !merged.aborted && merged.services.length === 1 && merged.bindings.length === 1);
        check('28 服务期合并不丢剩余权益（最早开始/最晚到期）', !!merged && !merged.aborted && merged.services[0].start_at === '2025-01-01' && merged.services[0].expires_at === '2027-06-01');
        check('28 合并后 plan 取到期最晚一条', !!merged && !merged.aborted && merged.services[0].plan === 'annual');
        check('28 绑定合并保留用户与最近非空昵称/最早绑定时间', !!merged && !merged.aborted && merged.bindings[0].user_id === 1 && merged.bindings[0].nickname === '新昵称' && merged.bindings[0].bound_at === '2025-01-01');
        check('28 火山权益按 SN 逐条回填（不丢历史）', !!merged && !merged.aborted && merged.rights.length === 2);
        check('28 凭证行全部保留（含去 UNIQUE 约束重建）', !!merged && !merged.aborted && merged.creds.length === 4);
        const conflict = runFixture('conflict');
        check('28 不同用户的同 MAC 记录中止迁移并报告明细', !!conflict && conflict.aborted === true && conflict.message.includes('数据迁移中止') && conflict.message.includes('M2'));
        const cross = runFixture('cross');
        check('28 跨表归属冲突（绑定与服务期各一条但不同用户）中止迁移', !!cross && cross.aborted === true && cross.message.includes('数据迁移中止') && cross.message.includes('M1'));
      } finally {
        fs.unlinkSync(fixturePath);
      }
    }

    // ===== 29. 订单预留 SN 生命周期：作废＋重新分配、重放只读、缺密钥拒绝启动 =====
    console.log('\n--- 29. 订单预留 SN：作废重新分配 / 旧订单重放只读 / 缺密钥拒绝启动 ---');
    // 任意 MAC/密钥的 v1 签名请求体（每次请求新的 timestamp+nonce，防重放）
    const v1body29 = (fk, hwid) => (action) => {
      const ts = Date.now(); const nonce = crypto.randomBytes(8).toString('hex');
      return { hardware_id: hwid, timestamp: ts, nonce, signature: sign(fk, action, hwid, ts, nonce) };
    };
    {
      // 29.1 缺少 KEY_ENCRYPTION_SECRET 时 db.js 必须在打开数据库前拒绝加载：
      // 对已有数据库文件零改动（字节级一致，不建 WAL/SHM，不跑迁移）
      {
        const { spawnSync } = require('child_process');
        const envNoKey = { ...process.env };
        delete envNoKey.KEY_ENCRYPTION_SECRET;
        const tmpData = fs.mkdtempSync(path.join(os.tmpdir(), 'usermgr-nokey-'));
        // 预置一个有内容的数据库文件（模拟真实旧库）
        const PreDB = require('better-sqlite3');
        const pre = new PreDB(path.join(tmpData, 'usermgr.db'));
        pre.exec('CREATE TABLE IF NOT EXISTS marker (v TEXT)');
        pre.prepare('INSERT INTO marker (v) VALUES (?)').run('untouched');
        pre.close();
        const before = fs.readFileSync(path.join(tmpData, 'usermgr.db'));
        const p = spawnSync(process.execPath, ['-e', 'require("./db")'], {
          cwd: __dirname, env: { ...envNoKey, USERMGR_DATA_DIR: tmpData }, encoding: 'utf8',
        });
        check('29.1 缺少加密密钥时拒绝启动', p.status !== 0 && (p.stderr + p.stdout).includes('KEY_ENCRYPTION_SECRET'),
          p.status === 0 ? '进程竟然成功退出' : '');
        const after = fs.readFileSync(path.join(tmpData, 'usermgr.db'));
        check('29.1 缺密钥时数据库文件完全不变（字节级）', after.equals(before) && !fs.existsSync(path.join(tmpData, 'usermgr.db-wal')) && !fs.existsSync(path.join(tmpData, 'usermgr.db-shm')));
        fs.rmSync(tmpData, { recursive: true, force: true });
      }

      // 29.2 确认收款预留 R1 → 删除被拒 → 作废并重新分配（幂等）→ 重放只读
      const h29 = '11:22:33:44:66:01';
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: h29, request_id: 'p29-1' }, { Authorization: `Bearer ${PROV}` });
      const fk29 = r.body.factory_key, sn29 = r.body.sn, ch29 = r.body.challenge;
      await req('POST', '/admin/api/provision/verify', { product: 'xiaov', hardware_id: h29, challenge: ch29, response: signVerify(fk29, h29, ch29) }, { Authorization: `Bearer ${PROV}` });
      r = await req('POST', '/xiaov/api/device/activate', v1body29(fk29, h29)('activate'));
      check('29.2 设备激活成功', r.body.ok === true && r.body.sn === sn29);
      const u29 = DB.createUser(xiaovId, '13900000098', 'hash-29');
      DB.createBinding(u29.id, xiaovId, h29, '29设备');
      DB.createServiceForDevice(u29.id, xiaovId, h29, 'annual', 1);
      const ord29 = DB.createOrder({ userId: u29.id, credentialId: DB.getCredentialBySn(xiaovId, sn29).id, productId: xiaovId, amount: 299, plan: 'annual', years: 1 });
      r = await req('PATCH', `/admin/api/orders/${DB.getOrderByNo(ord29.order_no).id}/mark-paid`, {}, { Authorization: `Bearer ${ADMIN}` });
      check('29.2 确认收款预留 R1', r.status === 200 && !!r.body.reserved_sn && r.body.reserved_reused !== true);
      const snR1 = r.body.reserved_sn;
      const credR1 = DB.getCredentialBySn(xiaovId, snR1);

      // 预留 SN 不能物理删除（保留订单关联历史，走"作废并重新分配"）
      r = await req('DELETE', `/admin/api/credentials/${credR1.id}`, null, { Authorization: `Bearer ${ADMIN}` });
      check('29.2 删除订单预留 SN 被拒（409）', r.status === 409 && r.body.error === 'order_reserved_sn');
      check('29.2 拒绝原因为具体中文提示', /[\u4e00-\u9fff]/.test(r.body.message || ''), r.body.message || '');

      // 作废并重新分配：R1 → retired，写入 reserved_history，预留替代 SN R2
      r = await req('POST', `/admin/api/orders/${DB.getOrderByNo(ord29.order_no).id}/reallocate-sn`, { request_id: 'r29-a' }, { Authorization: `Bearer ${ADMIN}` });
      check('29.2 作废 R1 并重新分配 R2', r.status === 200 && r.body.voided_sn === snR1 && !!r.body.reserved_sn && r.body.reserved_sn !== snR1);
      const snR2 = r.body.reserved_sn;
      check('29.2 R1 置为 retired（记录保留）', DB.getCredentialBySn(xiaovId, snR1).status === 'retired');
      check('29.2 替代历史写入订单（1 条）', r.body.reserved_history.length === 1 && r.body.reserved_history[0].sn === snR1);
      check('29.2 R2 为待激活', DB.getCredentialBySn(xiaovId, snR2).status === 'provisioned');

      // 同一 request_id 重放：只返回该次操作的原结果（预留了 R2、作废了 R1），不做任何写入
      r = await req('POST', `/admin/api/orders/${DB.getOrderByNo(ord29.order_no).id}/reallocate-sn`, { request_id: 'r29-a' }, { Authorization: `Bearer ${ADMIN}` });
      check('29.2 重放返回该次操作的原结果（幂等）', r.status === 200 && r.body.reserved_reused === true && r.body.reserved_sn === snR2 && r.body.voided_sn === snR1);
      check('29.2 重放不追加历史', r.body.reserved_history.length === 1);
      check('29.2 重放不把 R2 置为 retired', DB.getCredentialBySn(xiaovId, snR2).status === 'provisioned');

      // 再次重新分配（新 request_id）：R2 → retired，历史 2 条，预留 R3
      r = await req('POST', `/admin/api/orders/${DB.getOrderByNo(ord29.order_no).id}/reallocate-sn`, { request_id: 'r29-b' }, { Authorization: `Bearer ${ADMIN}` });
      check('29.2 二次重新分配 R2→R3', r.status === 200 && r.body.voided_sn === snR2 && r.body.reserved_sn !== snR2 && r.body.reserved_history.length === 2);
      const snR3 = r.body.reserved_sn;

      // 延迟重放 R1 的 request_id：只返回原结果 R2，绝不把订单改回已作废的 R2（当前仍是 R3）
      r = await req('POST', `/admin/api/orders/${DB.getOrderByNo(ord29.order_no).id}/reallocate-sn`, { request_id: 'r29-a' }, { Authorization: `Bearer ${ADMIN}` });
      check('29.2 R1→R2→R3 后延迟重放 R1：只返回原结果不回写', r.status === 200 && r.body.reserved_reused === true && r.body.reserved_sn === snR2);
      const credR3 = DB.getCredentialBySn(xiaovId, snR3);
      check('29.2 延迟重放不改当前关联（订单仍指向 R3）', DB.getOrderByNo(ord29.order_no).reserved_credential_id === credR3.id);

      // 跨订单复用 request_id：被其他订单的重新分配占用 → 拒绝
      const h29d = '11:22:33:44:66:04';
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: h29d, request_id: 'p29-4' }, { Authorization: `Bearer ${PROV}` });
      const fk29d = r.body.factory_key, sn29d = r.body.sn, ch29d = r.body.challenge;
      await req('POST', '/admin/api/provision/verify', { product: 'xiaov', hardware_id: h29d, challenge: ch29d, response: signVerify(fk29d, h29d, ch29d) }, { Authorization: `Bearer ${PROV}` });
      await req('POST', '/xiaov/api/device/activate', v1body29(fk29d, h29d)('activate'));
      const ord29d = DB.createOrder({ userId: u29.id, credentialId: DB.getCredentialBySn(xiaovId, sn29d).id, productId: xiaovId, amount: 299, plan: 'annual', years: 1 });
      DB.createServiceForDevice(u29.id, xiaovId, h29d, 'annual', 1);
      await req('PATCH', `/admin/api/orders/${DB.getOrderByNo(ord29d.order_no).id}/mark-paid`, {}, { Authorization: `Bearer ${ADMIN}` });
      const credsBefore29d = DB.getCredentialsByHardwareId(xiaovId, h29d).length;
      r = await req('POST', `/admin/api/orders/${DB.getOrderByNo(ord29d.order_no).id}/reallocate-sn`, { request_id: 'r29-a' }, { Authorization: `Bearer ${ADMIN}` });
      check('29.2 跨订单复用 request_id 被拒（409）', r.status === 409 && r.body.error === 'request_id_mismatch');
      // 复用烧录占用的 request_id（其他设备）→ 拒绝，且订单关联不被指向其他设备的 SN
      r = await req('POST', `/admin/api/orders/${DB.getOrderByNo(ord29d.order_no).id}/reallocate-sn`, { request_id: 'p29-1' }, { Authorization: `Bearer ${ADMIN}` });
      check('29.2 复用烧录/其他设备占用的 request_id 被拒（409）', r.status === 409 && r.body.error === 'request_id_conflict');
      check('29.2 被拒后订单关联不变、不生成额外 SN', DB.getCredentialsByHardwareId(xiaovId, h29d).length === credsBefore29d && DB.getOrderByNo(ord29d.order_no).reserved_credential_id !== credR3.id);

      // 已激活的预留 SN 不能作废：明确拒绝，保留原 SN
      // 当前预留 R3 尚未激活：给它补激活事实后，重新分配必须被拒（R3 不被作废）
      DB.db.prepare("UPDATE device_credentials SET volcano_activated_at = datetime('now') WHERE id = ?").run(credR3.id);
      const histLenBefore = JSON.parse(DB.getOrderByNo(ord29.order_no).reserved_history || '[]').length;
      r = await req('POST', `/admin/api/orders/${DB.getOrderByNo(ord29.order_no).id}/reallocate-sn`, { request_id: 'r29-c' }, { Authorization: `Bearer ${ADMIN}` });
      check('29.2 已激活的预留 SN 重新分配被拒（409）', r.status === 409 && r.body.error === 'reserved_sn_activated');
      check('29.2 被拒后已激活 SN 未被作废', DB.getCredentialBySn(xiaovId, snR3).status !== 'retired');
      check('29.2 被拒后历史与关联不变', JSON.parse(DB.getOrderByNo(ord29.order_no).reserved_history).length === histLenBefore && DB.getOrderByNo(ord29.order_no).reserved_credential_id === credR3.id);

      // 有替代分配历史的订单不能删除（order_realloc_requests 引用，保留审计而非外键报错）
      r = await req('DELETE', `/admin/api/orders/${DB.getOrderByNo(ord29.order_no).id}`, null, { Authorization: `Bearer ${ADMIN}` });
      check('29.2 重新分配过的订单删除被拒（409）', r.status === 409 && r.body.error === 'order_has_realloc_history', (r.body.message || '') + ` (got ${r.status} ${r.body.error})`);
      check('29.2 被拒后订单保留（幂等重放仍可用）', !!DB.getOrderByNo(ord29.order_no));
      check('29.2 订单列表标记替代历史（前端隐藏删除按钮）', DB.listAllOrders(xiaovId).find(o => o.order_no === ord29.order_no).has_realloc_history === 1);

      // 连续重新分配后的历史替代 SN（R1 已被作废且被幂等历史引用）不能删除：
      // 删除会让重放无法返回原结果；服务端给具体错误码而非泛化 delete_failed
      r = await req('DELETE', `/admin/api/credentials/${credR1.id}`, null, { Authorization: `Bearer ${ADMIN}` });
      check('29.2 历史替代 SN 删除被拒（409）', r.status === 409 && r.body.error === 'device_in_realloc_history', (r.body.message || '') + ` (got ${r.status} ${r.body.error})`);
      const delR1 = DB.getSnDeletability(DB.getCredentialBySn(xiaovId, snR1));
      check('29.2 历史替代 SN 不显示删除按钮（can_delete=false + 原因）', delR1.can_delete === false && /分配历史/.test(delR1.delete_block_reason || ''), JSON.stringify(delR1));

      // 已付款订单重复确认：纯只读幂等，不补 SN、不改续期状态、不延服务期
      const credsBefore = DB.getCredentialsByHardwareId(xiaovId, h29).length;
      const svcBefore29 = DB.getServiceByHardware(xiaovId, h29).expires_at;
      const ordRow29 = DB.getOrderByNo(ord29.order_no);
      r = await req('PATCH', `/admin/api/orders/${ordRow29.id}/mark-paid`, {}, { Authorization: `Bearer ${ADMIN}` });
      check('29.2 已付款订单重放只读返回', r.status === 200 && r.body.reserved_reused === true && r.body.reserved_sn === snR3);
      check('29.2 重放不生成额外 SN', DB.getCredentialsByHardwareId(xiaovId, h29).length === credsBefore);
      check('29.2 重放不改续期状态与服务期', DB.getOrderByNo(ord29.order_no).provider_renew_status === ordRow29.provider_renew_status && DB.getServiceByHardware(xiaovId, h29).expires_at === svcBefore29);
      check('29.2 新流程订单标记 renew_mode=new_sn', DB.getOrderByNo(ord29.order_no).renew_mode === 'new_sn');
      r = await req('POST', `/admin/api/orders/${ordRow29.id}/reallocate-sn`, {}, { Authorization: `Bearer ${ADMIN}` });
      check('29.2 重新分配缺 request_id 被拒（400）', r.status === 400 && r.body.error === 'missing_request_id');

      // 29.3 旧已完成订单（已完成 License 续期）重放：不追加权益、不生成 SN
      const h29b = '11:22:33:44:66:02';
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: h29b, request_id: 'p29-2' }, { Authorization: `Bearer ${PROV}` });
      const fk29b = r.body.factory_key, sn29b = r.body.sn, ch29b = r.body.challenge;
      await req('POST', '/admin/api/provision/verify', { product: 'xiaov', hardware_id: h29b, challenge: ch29b, response: signVerify(fk29b, h29b, ch29b) }, { Authorization: `Bearer ${PROV}` });
      await req('POST', '/xiaov/api/device/activate', v1body29(fk29b, h29b)('activate'));
      const cred29b = DB.getCredentialBySn(xiaovId, sn29b);
      const ord29b = DB.createOrder({ userId: u29.id, credentialId: cred29b.id, productId: xiaovId, amount: 299, plan: 'annual', years: 1 });
      // 旧流程：已付款且 License 续期已完成（无预留记录）
      DB.db.prepare("UPDATE orders SET status='paid', paid_at=datetime('now'), provider_renew_status='completed', provider_license_id='LIC-29-OLD' WHERE order_no=?").run(ord29b.order_no);
      const rightsBefore29b = JSON.stringify(DB.getSnRights(cred29b.id));
      const credsBefore29b = DB.getCredentialsByHardwareId(xiaovId, h29b).length;
      r = await req('PATCH', `/admin/api/orders/${DB.getOrderByNo(ord29b.order_no).id}/mark-paid`, {}, { Authorization: `Bearer ${ADMIN}` });
      check('29.3 已完成续期的旧订单重放返回 200', r.status === 200 && r.body.reserved_reused === true && r.body.reserved_sn === null);
      check('29.3 重放不生成额外 SN', DB.getCredentialsByHardwareId(xiaovId, h29b).length === credsBefore29b);
      check('29.3 重放不覆盖续期状态与 License 记录', DB.getOrderByNo(ord29b.order_no).provider_renew_status === 'completed' && DB.getOrderByNo(ord29b.order_no).provider_license_id === 'LIC-29-OLD');
      check('29.3 重放不改写该 SN 权益', JSON.stringify(DB.getSnRights(cred29b.id)) === rightsBefore29b);

      // 29.4 旧续期任务处理中：确认收款被拒（不能改状态假装取消），重放不动任务
      const h29c = '11:22:33:44:66:03';
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: h29c, request_id: 'p29-3' }, { Authorization: `Bearer ${PROV}` });
      const fk29c = r.body.factory_key, sn29c = r.body.sn, ch29c = r.body.challenge;
      await req('POST', '/admin/api/provision/verify', { product: 'xiaov', hardware_id: h29c, challenge: ch29c, response: signVerify(fk29c, h29c, ch29c) }, { Authorization: `Bearer ${PROV}` });
      await req('POST', '/xiaov/api/device/activate', v1body29(fk29c, h29c)('activate'));
      const ord29c = DB.createOrder({ userId: u29.id, credentialId: DB.getCredentialBySn(xiaovId, sn29c).id, productId: xiaovId, amount: 299, plan: 'annual', years: 1 });
      DB.db.prepare("UPDATE orders SET provider_renew_status='processing' WHERE order_no=?").run(ord29c.order_no);
      const credsBefore29c = DB.getCredentialsByHardwareId(xiaovId, h29c).length;
      r = await req('PATCH', `/admin/api/orders/${DB.getOrderByNo(ord29c.order_no).id}/mark-paid`, {}, { Authorization: `Bearer ${ADMIN}` });
      check('29.4 处理中任务确认收款被拒（409）', r.status === 409 && r.body.error === 'renew_task_processing');
      check('29.4 拒绝原因为具体中文提示', /[\u4e00-\u9fff]/.test(r.body.message || ''), r.body.message || '');
      check('29.4 订单保持未付款、未生成 SN、任务未被改写', DB.getOrderByNo(ord29c.order_no).status === 'pending' && DB.getOrderByNo(ord29c.order_no).provider_renew_status === 'processing' && DB.getCredentialsByHardwareId(xiaovId, h29c).length === credsBefore29c);
      // 已付款 + 处理中的旧订单重放：只读返回，不补 SN、不改任务状态
      DB.db.prepare("UPDATE orders SET status='paid', paid_at=datetime('now') WHERE order_no=?").run(ord29c.order_no);
      r = await req('PATCH', `/admin/api/orders/${DB.getOrderByNo(ord29c.order_no).id}/mark-paid`, {}, { Authorization: `Bearer ${ADMIN}` });
      check('29.4 已付款+处理中订单重放只读（不补 SN 不改状态）', r.status === 200 && r.body.reserved_sn === null && DB.getOrderByNo(ord29c.order_no).provider_renew_status === 'processing' && DB.getCredentialsByHardwareId(xiaovId, h29c).length === credsBefore29c);

      // 旧流程订单（renew_mode=NULL，含已完成/处理中）不能借重新分配进入新流程
      r = await req('POST', `/admin/api/orders/${DB.getOrderByNo(ord29b.order_no).id}/reallocate-sn`, { request_id: 'r29-legacy' }, { Authorization: `Bearer ${ADMIN}` });
      check('29.3 旧流程订单重新分配被拒（409）', r.status === 409 && r.body.error === 'order_not_new_sn_flow');
      check('29.3 旧流程订单未被生成 SN', DB.getCredentialsByHardwareId(xiaovId, h29b).length === credsBefore29b);
      r = await req('POST', `/admin/api/orders/${DB.getOrderByNo(ord29c.order_no).id}/reallocate-sn`, { request_id: 'r29-proc' }, { Authorization: `Bearer ${ADMIN}` });
      check('29.4 处理中订单重新分配被拒（409）', r.status === 409 && r.body.error === 'order_not_new_sn_flow' && DB.getCredentialsByHardwareId(xiaovId, h29c).length === credsBefore29c);
    }

    // ===== 30. 作废校验与指针清理：已激活拒绝作废；作废清理 pending_primary，解析/展示不再命中作废 SN =====
    console.log('\n--- 30. 作废校验 / 指针清理 / 解析回落 ---');
    {
      const h30 = '11:22:33:44:66:05';
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: h30, request_id: 'p30-1' }, { Authorization: `Bearer ${PROV}` });
      const fk30 = r.body.factory_key, sn30a = r.body.sn, ch30 = r.body.challenge;
      await req('POST', '/admin/api/provision/verify', { product: 'xiaov', hardware_id: h30, challenge: ch30, response: signVerify(fk30, h30, ch30) }, { Authorization: `Bearer ${PROV}` });
      r = await req('POST', '/xiaov/api/device/activate', v1body29(fk30, h30)('activate'));
      check('30 设备激活成功', r.body.ok === true && r.body.sn === sn30a);
      const credA30 = DB.getCredentialBySn(xiaovId, sn30a);

      // 已激活的 SN 不能通过通用"作废"退役（与"作废并重新分配"同口径）
      r = await req('PATCH', `/admin/api/credentials/${credA30.id}/status`, { status: 'retired' }, { Authorization: `Bearer ${ADMIN}` });
      check('30 已激活 SN 作废被拒（409）', r.status === 409 && r.body.error === 'device_activated_no_void', `got ${r.status} ${r.body.error}`);
      check('30 被拒后状态与 is_primary 不变', DB.getCredentialBySn(xiaovId, sn30a).status !== 'retired' && DB.getCredentialBySn(xiaovId, sn30a).is_primary === 1);

      // 预留新 SN 并选为"下次上线"，随后作废它：pending_primary 必须被清理，解析回落
      r = await req('POST', '/admin/api/devices/reserve-sn', { product: 'xiaov', hardware_id: h30, request_id: 'p30-2' }, { Authorization: `Bearer ${ADMIN}` });
      const sn30b = r.body.sn;
      const credB30 = DB.getCredentialBySn(xiaovId, sn30b);
      r = await req('PATCH', `/admin/api/credentials/${credB30.id}/primary`, {}, { Authorization: `Bearer ${ADMIN}` });
      check('30 新 SN 设为下次上线', r.status === 200 && DB.getCredentialBySn(xiaovId, sn30b).pending_primary === 1);
      check('30 作废前解析指向新 SN', DB.resolveNoSnCredential(xiaovId, h30).id === credB30.id);
      r = await req('PATCH', `/admin/api/credentials/${credB30.id}/status`, { status: 'retired' }, { Authorization: `Bearer ${ADMIN}` });
      check('30 作废未激活的新 SN 成功', r.status === 200 && DB.getCredentialBySn(xiaovId, sn30b).status === 'retired');
      check('30 作废后 pending_primary/is_primary 已清理', DB.getCredentialBySn(xiaovId, sn30b).pending_primary === 0 && DB.getCredentialBySn(xiaovId, sn30b).is_primary === 0);
      check('30 解析回落到已激活 SN（不再命中作废记录）', DB.resolveNoSnCredential(xiaovId, h30).id === credA30.id);

      // 用户端设备列表（与 /:product/api/devices 同一条 SQL）显示回落后的 SN
      const u30 = DB.createUser(xiaovId, '13900000097', 'hash-30');
      DB.createBinding(u30.id, xiaovId, h30, '30设备');
      const view30 = DB.listBindingsByUser(u30.id).find(b => b.hardware_id === h30);
      check('30 用户端列表不再显示已作废 SN', view30.sn === sn30a, `got ${view30.sn}`);
    }

    // ===== 31. 旧库缺列启动 / 重新分配清标记 / 全作废不兜底 =====
    console.log('\n--- 31. 旧库缺列启动 / 重新分配清标记 / 全作废不兜底 ---');
    {
      // 31.1 模拟没有 pending_primary/is_primary 列的旧库：清理语句必须在补列迁移之后执行，
      // 否则启动即 "no such column" 无法升级
      {
        const { spawnSync } = require('child_process');
        const oldData = fs.mkdtempSync(path.join(os.tmpdir(), 'usermgr-olddb-'));
        DB.db.exec(`VACUUM INTO '${path.join(oldData, 'usermgr.db')}'`);
        const Sqlite = require('better-sqlite3');
        const old = new Sqlite(path.join(oldData, 'usermgr.db'));
        old.exec('ALTER TABLE device_credentials DROP COLUMN pending_primary');
        old.exec('ALTER TABLE device_credentials DROP COLUMN is_primary');
        old.close();
        const p = spawnSync(process.execPath, ['-e', 'require("./db")'], {
          cwd: __dirname, env: { ...process.env, USERMGR_DATA_DIR: oldData }, encoding: 'utf8',
        });
        check('31.1 缺列旧库启动成功（清理语句在补列迁移之后）', p.status === 0 && !(p.stderr + p.stdout).includes('no such column'),
          p.status === 0 ? '' : (p.stderr + p.stdout).slice(-300));
        const reopened = new Sqlite(path.join(oldData, 'usermgr.db'));
        const colNames = reopened.prepare("PRAGMA table_info(device_credentials)").all().map(c => c.name);
        check('31.1 启动后两列已补齐', colNames.includes('pending_primary') && colNames.includes('is_primary'));
        reopened.close();
        fs.rmSync(oldData, { recursive: true, force: true });
      }

      // 31.2 选中 B（下次上线）→ 重新分配为 C：作废 B 必须同事务清理 pending_primary，
      // 解析/展示立即回落到已激活 A（不需要重启）
      const h31 = '11:22:33:44:66:06';
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: h31, request_id: 'p31-1' }, { Authorization: `Bearer ${PROV}` });
      const fk31 = r.body.factory_key, sn31a = r.body.sn, ch31 = r.body.challenge;
      await req('POST', '/admin/api/provision/verify', { product: 'xiaov', hardware_id: h31, challenge: ch31, response: signVerify(fk31, h31, ch31) }, { Authorization: `Bearer ${PROV}` });
      r = await req('POST', '/xiaov/api/device/activate', v1body29(fk31, h31)('activate'));
      check('31.2 设备激活成功', r.body.ok === true && r.body.sn === sn31a);
      const salt31 = crypto.randomBytes(16).toString('hex');
      const ph31 = crypto.pbkdf2Sync('test12345', salt31, 100000, 64, 'sha512').toString('hex');
      const u31 = DB.createUser(xiaovId, '13900000096', `pbkdf2$${salt31}$${ph31}`);
      DB.createBinding(u31.id, xiaovId, h31, '31设备');
      DB.createServiceForDevice(u31.id, xiaovId, h31, 'annual', 1);
      const ord31 = DB.createOrder({ userId: u31.id, credentialId: DB.getCredentialBySn(xiaovId, sn31a).id, productId: xiaovId, amount: 299, plan: 'annual', years: 1 });
      r = await req('PATCH', `/admin/api/orders/${DB.getOrderByNo(ord31.order_no).id}/mark-paid`, {}, { Authorization: `Bearer ${ADMIN}` });
      const sn31r1 = r.body.reserved_sn;
      const credR31 = DB.getCredentialBySn(xiaovId, sn31r1);
      r = await req('PATCH', `/admin/api/credentials/${credR31.id}/primary`, {}, { Authorization: `Bearer ${ADMIN}` });
      check('31.2 预留 R1 设为下次上线（解析指向 R1）', r.status === 200 && DB.resolveNoSnCredential(xiaovId, h31).id === credR31.id);
      r = await req('POST', `/admin/api/orders/${DB.getOrderByNo(ord31.order_no).id}/reallocate-sn`, { request_id: 'r31-1' }, { Authorization: `Bearer ${ADMIN}` });
      check('31.2 重新分配 R1→R2 成功', r.status === 200 && r.body.voided_sn === sn31r1);
      check('31.2 作废的 R1 选择标记已清理（同事务）', DB.getCredentialBySn(xiaovId, sn31r1).pending_primary === 0 && DB.getCredentialBySn(xiaovId, sn31r1).status === 'retired');
      check('31.2 解析立即回落到已激活 SN（不命中作废 R1，无需重启）', DB.resolveNoSnCredential(xiaovId, h31).sn === sn31a);
      const view31 = DB.listBindingsByUser(u31.id).find(b => b.hardware_id === h31);
      check('31.2 用户端列表立即不再显示作废 R1', view31.sn === sn31a, `got ${view31.sn}`);

      // 31.3 唯一 SN 已作废：解析返回空、列表按"未配置可用 SN"展示、下单被拒——不拿作废记录兜底
      const h31b = '11:22:33:44:66:07';
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: h31b, request_id: 'p31-2' }, { Authorization: `Bearer ${PROV}` });
      const sn31b = r.body.sn, ch31b = r.body.challenge, fk31b = r.body.factory_key;
      await req('POST', '/admin/api/provision/verify', { product: 'xiaov', hardware_id: h31b, challenge: ch31b, response: signVerify(fk31b, h31b, ch31b) }, { Authorization: `Bearer ${PROV}` });
      const cred31b = DB.getCredentialBySn(xiaovId, sn31b);
      r = await req('PATCH', `/admin/api/credentials/${cred31b.id}/status`, { status: 'retired' }, { Authorization: `Bearer ${ADMIN}` });
      check('31.3 唯一 SN 作废成功', r.status === 200 && DB.getCredentialBySn(xiaovId, sn31b).status === 'retired');
      check('31.3 解析返回空（不用作废记录兜底）', DB.resolveNoSnCredential(xiaovId, h31b) === undefined);
      const salt31b = crypto.randomBytes(16).toString('hex');
      const ph31b = crypto.pbkdf2Sync('test12345', salt31b, 100000, 64, 'sha512').toString('hex');
      const u31b = DB.createUser(xiaovId, '13900000095', `pbkdf2$${salt31b}$${ph31b}`);
      DB.createBinding(u31b.id, xiaovId, h31b, '31b设备');
      const view31b = DB.listBindingsByUser(u31b.id).find(b => b.hardware_id === h31b);
      check('31.3 用户端列表 sn/凭证为空（未配置可用 SN）', view31b.sn === null && view31b.credential_id === null, `got sn=${view31b.sn}`);
      r = await req('POST', '/xiaov/api/auth/login', { phone: '13900000095', password: 'test12345' });
      const userToken31b = r.body.token;
      check('31.3 测试用户登录成功', !!userToken31b);
      r = await req('POST', `/xiaov/api/devices/${view31b.id}/renew`, { years: 1 }, { Authorization: `Bearer ${userToken31b}` });
      check('31.3 无可用 SN 时下单被拒（device_not_provisioned）', r.status === 404 && r.body.error === 'device_not_provisioned', `got ${r.status} ${r.body.error}`);
    }

    // ===== 32. status 接口业务凭证与验签分离 / 用户页无可用 SN =====
    console.log('\n--- 32. status 无可用 SN 禁止 AI / pending 不提前生效 ---');
    {
      // 32.1 仅剩作废 SN（验签可用）+ 绑定 + 服务有效：status 不得返回作废 SN 为可用、不得放行 AI
      const h32 = '11:22:33:44:66:08';
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: h32, request_id: 'p32-1' }, { Authorization: `Bearer ${PROV}` });
      const fk32 = r.body.factory_key, sn32a = r.body.sn, ch32 = r.body.challenge;
      await req('POST', '/admin/api/provision/verify', { product: 'xiaov', hardware_id: h32, challenge: ch32, response: signVerify(fk32, h32, ch32) }, { Authorization: `Bearer ${PROV}` });
      const cred32a = DB.getCredentialBySn(xiaovId, sn32a);
      r = await req('PATCH', `/admin/api/credentials/${cred32a.id}/status`, { status: 'retired' }, { Authorization: `Bearer ${ADMIN}` });
      check('32.1 唯一 SN 作废成功（无激活）', r.status === 200);
      const salt32 = crypto.randomBytes(16).toString('hex');
      const ph32 = crypto.pbkdf2Sync('test12345', salt32, 100000, 64, 'sha512').toString('hex');
      const u32 = DB.createUser(xiaovId, '13900000094', `pbkdf2$${salt32}$${ph32}`);
      DB.createBinding(u32.id, xiaovId, h32, '32设备');
      DB.createServiceForDevice(u32.id, xiaovId, h32, 'annual', 1);
      r = await req('POST', '/xiaov/api/device/status', v1body29(fk32, h32)('status'));
      check('32.1 仅剩作废 SN：status 返回 200 且明确无可用 SN', r.status === 200 && r.body.sn === null && r.body.sn_available === false, `got ${r.status} sn=${r.body.sn}`);
      check('32.1 绑定 + 服务有效仍不得放行 AI', r.body.bound === true && r.body.service_status === 'active' && r.body.ai_allowed === false && r.body.provider_available === false, JSON.stringify(r.body));
      check('32.1 返回中文提示', (r.body.message || '').includes('暂无可用 SN'));

      // 32.3 显式携带已作废的 sn 查询（v2 签名）：同样按"无可用 SN"处理
      {
        const ts = Date.now(); const nonce = crypto.randomBytes(8).toString('hex');
        const sig = crypto.createHmac('sha256', Buffer.from(fk32, 'hex'))
          .update(`v2|status|${h32}|${sn32a}|${ts}|${nonce}`).digest('base64');
        r = await req('POST', '/xiaov/api/device/status', { hardware_id: h32, timestamp: ts, nonce, signature: sig, sn: sn32a });
        check('32.3 显式查询作废 SN：sn_available=false 且禁止 AI', r.status === 200 && r.body.sn === null && r.body.sn_available === false && r.body.ai_allowed === false);
      }

      // 32.2 旧生效 SN（已激活）+ 新 pending SN（设为下次上线、未激活）：
      // status 不带 sn 仍按旧 SN 判断权益，不提前按新 SN 生效
      const h32b = '11:22:33:44:66:09';
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: h32b, request_id: 'p32-2' }, { Authorization: `Bearer ${PROV}` });
      const fk32b = r.body.factory_key, sn32old = r.body.sn, ch32b = r.body.challenge;
      await req('POST', '/admin/api/provision/verify', { product: 'xiaov', hardware_id: h32b, challenge: ch32b, response: signVerify(fk32b, h32b, ch32b) }, { Authorization: `Bearer ${PROV}` });
      r = await req('POST', '/xiaov/api/device/activate', v1body29(fk32b, h32b)('activate'));
      check('32.2 旧 SN 激活成功', r.body.ok === true && r.body.sn === sn32old);
      const u32b = DB.createUser(xiaovId, '13900000093', 'hash-32b');
      DB.createBinding(u32b.id, xiaovId, h32b, '32b设备');
      DB.createServiceForDevice(u32b.id, xiaovId, h32b, 'annual', 1);
      r = await req('POST', '/admin/api/devices/reserve-sn', { product: 'xiaov', hardware_id: h32b, request_id: 'p32-3' }, { Authorization: `Bearer ${ADMIN}` });
      const sn32new = r.body.sn;
      const cred32new = DB.getCredentialBySn(xiaovId, sn32new);
      r = await req('PATCH', `/admin/api/credentials/${cred32new.id}/primary`, {}, { Authorization: `Bearer ${ADMIN}` });
      check('32.2 新 SN 已设为下次上线（pending）', r.status === 200 && DB.getCredentialBySn(xiaovId, sn32new).pending_primary === 1);
      r = await req('POST', '/xiaov/api/device/status', v1body29(fk32b, h32b)('status'));
      check('32.2 status 仍按旧生效 SN 判断（不提前按 pending 新 SN）', r.status === 200 && r.body.sn === sn32old && r.body.sn_available === true, `got sn=${r.body.sn}`);
      check('32.2 权益按旧 SN 判定：绑定 + 服务有效 → AI 放行', r.body.bound === true && r.body.service_status === 'active' && r.body.ai_allowed === true);
    }

    // ===== 33. SN 已配置 ≠ 已激活可用：未激活预留 SN 不得放行 AI =====
    console.log('\n--- 33. 未激活预留 SN 禁止 AI / 激活后放行 / 旧数据兼容 ---');
    {
      // 33.1 只有未激活预留 SN + 绑定 + 有效服务：可返回 SN 与待激活提示，AI 不放行
      const h33 = '11:22:33:44:66:0a';
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: h33, request_id: 'p33-1' }, { Authorization: `Bearer ${PROV}` });
      const fk33 = r.body.factory_key, sn33a = r.body.sn, ch33 = r.body.challenge;
      await req('POST', '/admin/api/provision/verify', { product: 'xiaov', hardware_id: h33, challenge: ch33, response: signVerify(fk33, h33, ch33) }, { Authorization: `Bearer ${PROV}` });
      const salt33 = crypto.randomBytes(16).toString('hex');
      const ph33 = crypto.pbkdf2Sync('test12345', salt33, 100000, 64, 'sha512').toString('hex');
      const u33 = DB.createUser(xiaovId, '13900000092', `pbkdf2$${salt33}$${ph33}`);
      DB.createBinding(u33.id, xiaovId, h33, '33设备');
      DB.createServiceForDevice(u33.id, xiaovId, h33, 'annual', 1);
      r = await req('POST', '/xiaov/api/device/status', v1body29(fk33, h33)('status'));
      check('33.1 未激活预留 SN：返回 SN 本体且标记 activated=false', r.status === 200 && r.body.sn === sn33a && r.body.sn_available === true && r.body.activated === false, JSON.stringify(r.body));
      check('33.1 绑定 + 服务有效仍不放行 AI（无权益记录 ≠ 可用）', r.body.bound === true && r.body.service_status === 'active' && r.body.provider_available === false && r.body.ai_allowed === false, JSON.stringify(r.body));
      check('33.1 返回待激活提示', (r.body.message || '').includes('待激活'));

      // 33.2 旧 SN 已激活 + 新预留 SN（未激活）：显式查新 SN 不放行；无 sn 查询仍按旧 SN 放行
      const h33b = '11:22:33:44:66:0b';
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: h33b, request_id: 'p33-2' }, { Authorization: `Bearer ${PROV}` });
      const fk33b = r.body.factory_key, sn33old = r.body.sn, ch33b = r.body.challenge;
      await req('POST', '/admin/api/provision/verify', { product: 'xiaov', hardware_id: h33b, challenge: ch33b, response: signVerify(fk33b, h33b, ch33b) }, { Authorization: `Bearer ${PROV}` });
      r = await req('POST', '/xiaov/api/device/activate', v1body29(fk33b, h33b)('activate'));
      check('33.2 旧 SN 激活成功', r.body.ok === true && r.body.sn === sn33old);
      const u33b = DB.createUser(xiaovId, '13900000091', 'hash-33b');
      DB.createBinding(u33b.id, xiaovId, h33b, '33b设备');
      DB.createServiceForDevice(u33b.id, xiaovId, h33b, 'annual', 1);
      r = await req('POST', '/admin/api/devices/reserve-sn', { product: 'xiaov', hardware_id: h33b, request_id: 'p33-3' }, { Authorization: `Bearer ${ADMIN}` });
      const sn33new = r.body.sn;
      r = await req('PATCH', `/admin/api/credentials/${DB.getCredentialBySn(xiaovId, sn33new).id}/primary`, {}, { Authorization: `Bearer ${ADMIN}` });
      check('33.2 新预留 SN 设为下次上线', r.status === 200);
      // 显式携带新 SN（v2 签名）→ 未激活，禁止 AI
      {
        const ts = Date.now(); const nonce = crypto.randomBytes(8).toString('hex');
        const sig = crypto.createHmac('sha256', Buffer.from(fk33b, 'hex'))
          .update(`v2|status|${h33b}|${sn33new}|${ts}|${nonce}`).digest('base64');
        r = await req('POST', '/xiaov/api/device/status', { hardware_id: h33b, timestamp: ts, nonce, signature: sig, sn: sn33new });
        check('33.2 显式查询新预留 SN：activated=false 且 AI 不放行', r.status === 200 && r.body.sn === sn33new && r.body.activated === false && r.body.ai_allowed === false && r.body.provider_available === false, JSON.stringify(r.body));
      }
      // 无 sn 查询 → 旧生效 SN 继续可用（兼容不退化）
      r = await req('POST', '/xiaov/api/device/status', v1body29(fk33b, h33b)('status'));
      check('33.2 无 sn 查询仍按旧激活 SN 判定并放行 AI', r.body.sn === sn33old && r.body.activated === true && r.body.ai_allowed === true, JSON.stringify(r.body));

      // 33.3 新 SN 激活成功后 → 正常放行
      r = await req('POST', '/xiaov/api/device/activate', v1body29(fk33b, h33b)('activate'));
      check('33.3 设备无 SN 激活命中下次上线的新 SN', r.body.ok === true && r.body.sn === sn33new, `got ${r.body.sn}`);
      r = await req('POST', '/xiaov/api/device/status', v1body29(fk33b, h33b)('status'));
      check('33.3 激活后按新 SN 正常放行 AI', r.body.sn === sn33new && r.body.activated === true && r.body.sn_available === true && r.body.ai_allowed === true && r.body.provider_available === true, JSON.stringify(r.body));

      // 33.4 旧数据兼容：已激活（有 volcano_activated_at + DeviceSecret）但无权益记录的旧凭证。
      // 不调用 activate（新代码激活会生成权益记录，测不到兼容分支）——直接按旧库形态构造数据：
      // 绑定与服务有效，status 必须判 activated=true 且按兼容口径放行 AI。
      const h33c = '11:22:33:44:66:0c';
      r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: h33c, request_id: 'p33-4' }, { Authorization: `Bearer ${PROV}` });
      const fk33c = r.body.factory_key, sn33c = r.body.sn, ch33c = r.body.challenge;
      await req('POST', '/admin/api/provision/verify', { product: 'xiaov', hardware_id: h33c, challenge: ch33c, response: signVerify(fk33c, h33c, ch33c) }, { Authorization: `Bearer ${PROV}` });
      const cred33c = DB.getCredentialBySn(xiaovId, sn33c);
      // 模拟旧库：正常保存火山凭证时已写入激活时间与 DeviceSecret，但没有 device_sn_rights
      DB.db.prepare("UPDATE device_credentials SET volcano_activated_at = datetime('now'), volcano_device_secret = X'00' WHERE id = ?").run(cred33c.id);
      check('33.4 构造完成：无权益记录的已激活旧凭证', !DB.getSnRights(cred33c.id) && !!DB.getCredentialBySn(xiaovId, sn33c).volcano_activated_at);
      const u33c = DB.createUser(xiaovId, '13900000090', 'hash-33c');
      DB.createBinding(u33c.id, xiaovId, h33c, '33c设备');
      DB.createServiceForDevice(u33c.id, xiaovId, h33c, 'annual', 1);
      r = await req('POST', '/xiaov/api/device/status', v1body29(fk33c, h33c)('status'));
      check('33.4 旧数据兼容：activated=true 且无权益记录按可用放行 AI', r.status === 200 && r.body.sn === sn33c && r.body.activated === true && r.body.provider_available === true && r.body.ai_allowed === true, JSON.stringify(r.body));
    }

    console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===`);
    server.close();
    process.exit(fail > 0 ? 1 : 0);
  });
}

main().catch((e) => {
  console.error('测试异常:', e);
  if (server) server.close();
  process.exit(1);
});
