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

// 清空数据库文件（必须在 require server/db 之前，否则会连到旧文件）
const dbFile = path.join(__dirname, 'data', 'usermgr.db');
if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
for (const ext of ['-wal', '-shm']) {
  const f = dbFile + ext;
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

const { app, buildSignString } = require('./server');
const DB = require('./db');

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
  return crypto.createHmac('sha256', factoryKey).update(s).digest('base64');
}

// provision verify 签名：v1|provision_verify|hardwareId|challenge → HMAC hex
function signVerify(factoryKey, hardwareId, challenge) {
  const s = `v1|provision_verify|${hardwareId}|${challenge}`;
  return crypto.createHmac('sha256', factoryKey).update(s).digest('hex');
}

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}

let server;

async function main() {
  server = app.listen(PORT, async () => {
    console.log('=== Device Center v3 测试 ===\n');

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
    const deviceSecret1 = r.body.device_secret;

    // ===== 5. erase_flash 恢复（同一个 HardwareID 二次激活，应返回原 device_secret） =====
    ts = Date.now(); nonce = crypto.randomBytes(8).toString('hex');
    sig = sign(factoryKey, 'activate', hwid, ts, nonce);
    r = await req('POST', '/xiaov/api/device/activate', {
      hardware_id: hwid, timestamp: ts, nonce, signature: sig,
    });
    check('二次激活返回原 device_secret', r.body.recovered === true && r.body.device_secret === deviceSecret1);

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

    // ===== 9. 用户注册（phone 为主登录账号，email 备选） =====
    r = await req('POST', '/xiaov/api/auth/register', {
      phone: '13800138000', password: 'test12345',
    });
    check('用户注册成功', r.body.token && r.body.user);
    check('注册返回 phone', r.body.user.phone === '13800138000');
    const userToken = r.body.token;

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
      phone: '12345', password: 'test12345',
    });
    check('非法手机号被拒', r.status === 400 && r.body.error === 'invalid_phone');

    r = await req('POST', '/xiaov/api/auth/register', {
      phone: '10999999999', password: 'test12345',
    });
    check('非 1[3-9] 开头手机号被拒', r.status === 400 && r.body.error === 'invalid_phone');

    // 重复 phone 被拒
    r = await req('POST', '/xiaov/api/auth/register', {
      phone: '13800138000', password: 'test12345',
    });
    check('重复 phone 注册被拒', r.status === 409 && r.body.error === 'phone_exists');

    // email 选填：注册一个带 email 的用户
    r = await req('POST', '/xiaov/api/auth/register', {
      phone: '13900139001', password: 'test12345', email: 'alice@example.com',
    });
    check('带 email 注册成功', r.body.token && r.body.user.email === 'alice@example.com');

    // 非法 email 被拒
    r = await req('POST', '/xiaov/api/auth/register', {
      phone: '13900139002', password: 'test12345', email: 'not-an-email',
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
    r = await req('POST', '/xiaov/api/auth/register', { phone: '13700137000', password: 'oldpass123' });
    check('密码找回测试号注册成功', r.body.token);

    // 发送验证码（dev 模式返回 dev_code）
    r = await req('POST', '/xiaov/api/auth/sms-code', { phone: '13700137000', purpose: 'reset_password' });
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

    // ===== 9e. Rate limit：短信验证码 1 次/分钟/手机号 =====
    r = await req('POST', '/xiaov/api/auth/sms-code', { phone: '13700137001' });
    check('rate limit: 首次发送成功', r.body.ok === true);
    r = await req('POST', '/xiaov/api/auth/sms-code', { phone: '13700137001' });
    check('rate limit: 60秒内第二次被拒', r.status === 429 && r.body.error === 'rate_limited');

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
    const bindingId = r.body[0].binding_id;

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

    // 管理员确认收款 → paid + 服务期延长
    r = await req('PATCH', `/admin/api/orders/${orderId}/mark-paid`, {}, { Authorization: `Bearer ${ADMIN}` });
    check('管理员确认收款成功', r.body.ok === true && r.body.status === 'paid');
    check('确认收款后 provider_renew_status=pending', r.body.provider_renew_status === 'pending');

    // 服务期应延长
    r = await req('GET', '/xiaov/api/devices', null, { Authorization: `Bearer ${userToken}` });
    const expiresAfter = r.body[0].service_expires_at;
    check('确认收款后服务期延长', new Date(expiresAfter).getTime() > new Date(expiresBefore).getTime());

    // mark-paid 后 provider_renew_status=pending → ai_allowed=false（服务正在开通，不直接连火山）
    ts = Date.now(); nonce = crypto.randomBytes(8).toString('hex');
    sig = sign(factoryKey, 'status', hwid, ts, nonce);
    r = await req('POST', '/xiaov/api/device/status', {
      hardware_id: hwid, timestamp: ts, nonce, signature: sig,
    });
    check('续费确认后 service_status=active', r.body.service_status === 'active');
    check('续费确认后 ai_allowed=false（provider 待续期）', r.body.ai_allowed === false);
    check('续费确认后 provider_available=false', r.body.provider_available === false);

    // 管理员完成续期后 ai_allowed=true
    await req('POST', `/admin/api/orders/${orderId}/complete-renew`, { license_id: 'LIC-19' }, { Authorization: `Bearer ${ADMIN}` });
    ts = Date.now(); nonce = crypto.randomBytes(8).toString('hex');
    sig = sign(factoryKey, 'status', hwid, ts, nonce);
    r = await req('POST', '/xiaov/api/device/status', {
      hardware_id: hwid, timestamp: ts, nonce, signature: sig,
    });
    check('完成续期后 ai_allowed=true', r.body.ai_allowed === true);
    check('完成续期后 provider_available=true', r.body.provider_available === true);

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

    // ===== 22. 重复确认收款被拒 + 已付款订单不能再确认 =====
    r = await req('PATCH', `/admin/api/orders/${orderId}/mark-paid`, {}, { Authorization: `Bearer ${ADMIN}` });
    check('重复确认收款被拒', r.status === 400);

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
      const expBefore = DB.getServiceByCredential(d.credential_id).expires_at;
      DB.deleteBinding(d.binding_id);                                    // 解绑（service 不删）
      DB.createBinding(b.user_id, b.credential_id, b.product_id, '重绑');
      DB.createServiceForBinding(b.user_id, b.credential_id, b.product_id, 'annual'); // ON CONFLICT 不重置
      const expAfter = DB.getServiceByCredential(d.credential_id).expires_at;
      check('① 解绑重绑不重赠首年（expires_at 不变）', expAfter === expBefore);
    }

    // ② 同一支付回调调用2次 → 只延长1年（markOrderPaid 原子 changes 防并发）
    {
      const d = (await req('GET', '/xiaov/api/devices', null, { Authorization: `Bearer ${userToken}` })).body[0];
      const expBefore = DB.getServiceByCredential(d.credential_id).expires_at;
      const r1 = await req('POST', `/xiaov/api/devices/${d.binding_id}/renew`, { years: 1 }, { Authorization: `Bearer ${userToken}` });
      await req('POST', `/xiaov/api/orders/${r1.body.order_id}/voucher`, { voucher: '重复回调测试' }, { Authorization: `Bearer ${userToken}` });
      const r2 = await req('PATCH', `/admin/api/orders/${r1.body.order_id}/mark-paid`, {}, { Authorization: `Bearer ${ADMIN}` });
      check('② 第一次确认收款成功', r2.body.ok === true);
      const expAfter1 = DB.getServiceByCredential(d.credential_id).expires_at;
      check('② 第一次延长了服务期', new Date(expAfter1).getTime() > new Date(expBefore).getTime());
      // 重复回调
      const r3 = await req('PATCH', `/admin/api/orders/${r1.body.order_id}/mark-paid`, {}, { Authorization: `Bearer ${ADMIN}` });
      check('② 重复确认被拒（400/409）', r3.status === 400 || r3.status === 409);
      const expAfter2 = DB.getServiceByCredential(d.credential_id).expires_at;
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
      const expBeforeFail = DB.getServiceByCredential(d.credential_id).expires_at;
      DB.setOrderRenewStatus(order.id, 'failed', { error: 'mock volcano api error' });
      DB.setServiceRenewStatus(d.credential_id, 'failed', { error: 'mock volcano api error' });
      const expAfterFail = DB.getServiceByCredential(d.credential_id).expires_at;
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
      DB.setServiceRenewStatus(d.credential_id, 'completed', { licenseId: 'LIC-123' });
      check('⑤ completed 不在 pending 队列', !DB.listOrdersPendingRenew().some(o => o.id === order.id));
      check('⑤ 已 completed 不可再抢占', DB.claimOrderForRenew(order.id) === false);
      check('⑤ 已 completed 重试被拒', DB.retryOrderRenew(order.id) === false);
    }

    // ⑥ 管理员人工完成续期（火山无公开 API 时的实际流程）
    // mark-paid 后 provider_renew_status=pending（VOLCANO_ENABLED=false 不自动处理）
    // 管理员在火山控制台手动买 License + 绑定设备后，回平台点"完成续期"
    {
      const d = (await req('GET', '/xiaov/api/devices', null, { Authorization: `Bearer ${userToken}` })).body[0];
      const expBefore = DB.getServiceByCredential(d.credential_id).expires_at;
      // 创建订单 + 凭证 + 确认收款（服务期延长，provider_renew_status=pending）
      const r1 = await req('POST', `/xiaov/api/devices/${d.binding_id}/renew`, { years: 1 }, { Authorization: `Bearer ${userToken}` });
      await req('POST', `/xiaov/api/orders/${r1.body.order_id}/voucher`, { voucher: '人工续期测试' }, { Authorization: `Bearer ${userToken}` });
      await req('PATCH', `/admin/api/orders/${r1.body.order_id}/mark-paid`, {}, { Authorization: `Bearer ${ADMIN}` });
      const svc1 = DB.getServiceByCredential(d.credential_id);
      check('⑥ mark-paid 后 provider_renew_status=pending（未自动续期）', svc1.provider_renew_status === 'pending');
      const expAfter = DB.getServiceByCredential(d.credential_id).expires_at;
      check('⑥ 服务期已延长（mark-paid 时）', new Date(expAfter).getTime() > new Date(expBefore).getTime());

      // 管理员人工完成续期，填入 License ID
      const r2 = await req('POST', `/admin/api/orders/${r1.body.order_id}/complete-renew`, { license_id: 'MANUAL-LIC-001' }, { Authorization: `Bearer ${ADMIN}` });
      check('⑥ 人工完成续期成功', r2.body.ok === true && r2.body.provider_renew_status === 'completed');
      check('⑥ 返回 License ID', r2.body.license_id === 'MANUAL-LIC-001');
      check('⑥ 返回 completed_at（审计）', !!r2.body.completed_at);
      check('⑥ 返回 operator_id=admin（审计）', r2.body.operator_id === 'admin');

      // orders 表审计字段（历史记录：这次续费用了哪个 License）
      const ord2 = DB.getOrderById(r1.body.order_id);
      check('⑥ orders.provider_license_id 已记录', ord2.provider_license_id === 'MANUAL-LIC-001');
      check('⑥ orders.provider_renew_completed_at 已记录', !!ord2.provider_renew_completed_at);
      check('⑥ orders.provider_renew_operator_id=admin', ord2.provider_renew_operator_id === 'admin');

      // device_services 表（当前值：正在使用的 License）
      const svc2 = DB.getServiceByCredential(d.credential_id);
      check('⑥ service.provider_renew_status=completed', svc2.provider_renew_status === 'completed');
      check('⑥ service.provider_license_id 已记录（当前值）', svc2.provider_license_id === 'MANUAL-LIC-001');
      check('⑥ 完成续期后服务期不变（不重复延长）', svc2.expires_at === expAfter);

      // complete-renew 后 ai_allowed 恢复 true
      ts = Date.now(); nonce = crypto.randomBytes(8).toString('hex');
      sig = sign(factoryKey, 'status', hwid, ts, nonce);
      r = await req('POST', '/xiaov/api/device/status', {
        hardware_id: hwid, timestamp: ts, nonce, signature: sig,
      });
      check('⑥ 完成续期后 ai_allowed=true', r.body.ai_allowed === true);

      // 已 completed 不可重复完成
      const r3 = await req('POST', `/admin/api/orders/${r1.body.order_id}/complete-renew`, { license_id: 'X' }, { Authorization: `Bearer ${ADMIN}` });
      check('⑥ 已 completed 不可重复完成', r3.status === 400);
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

    r = await req('POST', '/product_b/api/auth/register', {
      phone: '13600136000', password: 'password123',
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
