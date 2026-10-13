#!/usr/bin/env node
// ============================================================================
// SN 预留 / 指定 / 切回流程演示（mock 场景，对应数据归属新模型）：
//   MAC 已使用 A → 续期预留 B（不请求火山、不重新烧录）
//   → 后台选 B → 设备上线激活 B（首次火山注册）
//   → B 出问题时后台随时选回 A → 下次上线返回 A 的原凭证
//
// 全程验证：用户绑定、平台服务期、历史订单不因切换被搬迁或清空。
//
// 隔离性：使用独立临时数据目录 + 独立端口 3099，不触碰项目默认 data/，不影响演示服务。
// 运行：node demo-switch-flow.js
// ============================================================================
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PORT = 3099;
const BASE = `http://localhost:${PORT}`;

// ---- 读取 .env（仅取管理密码，用于调用管理端 API）----
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, '.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const ADMIN = env.ADMIN_PASSWORD;

// ---- 独立临时数据目录（必须先设 env 再加载 db.js）----
// KEY_ENCRYPTION_SECRET 必须与 server 一致（否则演示进程解不开 server 写入的密文）
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'usermgr-switch-demo-'));
process.env.USERMGR_DATA_DIR = DATA_DIR;
process.env.VOLCANO_ENABLED = 'false'; // mock 演示：激活走测试模式（返回假 DeviceSecret）
if (env.KEY_ENCRYPTION_SECRET) process.env.KEY_ENCRYPTION_SECRET = env.KEY_ENCRYPTION_SECRET;
const DB = require('./db.js');

// ---- HTTP 与签名工具（与固件 v1/v2 协议一致）----
async function req(method, p, body, token) {
  const res = await fetch(BASE + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let b = null;
  try { b = await res.json(); } catch (_) {}
  return { status: res.status, body: b || {} };
}
const v1sig = (fk, action, hw, ts, nonce) =>
  crypto.createHmac('sha256', Buffer.from(fk, 'hex')).update(`v1|${action}|${hw}|${ts}|${nonce}`).digest('base64');
function v1body(fk, hw, action) {
  const ts = Date.now(); const nonce = crypto.randomBytes(8).toString('hex');
  return { hardware_id: hw, timestamp: ts, nonce, signature: v1sig(fk, action, hw, ts, nonce) };
}
function v2body(fk, hw, sn) {
  const ts = Date.now(); const nonce = crypto.randomBytes(8).toString('hex');
  const signature = crypto.createHmac('sha256', Buffer.from(fk, 'hex'))
    .update(`v2|activate|${hw}|${sn}|${ts}|${nonce}`).digest('base64');
  return { hardware_id: hw, timestamp: ts, nonce, signature, sn };
}

// ---- 输出辅助 ----
const line = () => console.log('─'.repeat(72));
let step = 0;
function say(title, detail) {
  step++;
  console.log(`\n[${step}] ${title}`);
  if (detail) console.log(`    ${detail}`);
}
function show(tag, obj) {
  console.log(`    ${tag}:`);
  for (const [k, v] of Object.entries(obj)) console.log(`      - ${k} = ${v}`);
}
function ok(cond, msg) {
  console.log(`    ${cond ? '✓' : '✗ 但这与预期不符！'} ${msg}`);
}

let srv;

async function main() {
  line();
  console.log('SN 预留/指定/切回 mock 演示：预留 B（不碰火山）→ 选 B → 激活 B → 选回 A → 返回 A 原凭证');
  line();

  // 启动隔离服务
  srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, USERMGR_DATA_DIR: DATA_DIR, PORT: String(PORT), VOLCANO_ENABLED: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  srv.stdout.on('data', () => {});
  srv.stderr.on('data', d => console.error('[server]', String(d)));
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      const h = await fetch(BASE + '/healthz');
      if (h.ok) { ready = true; break; }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 250));
  }
  if (!ready) { console.error('服务启动失败（可能端口被占用，请检查 3099）'); srv.kill('SIGTERM'); process.exit(1); }
  console.log(`服务已启动（端口 ${PORT}，数据目录 ${DATA_DIR}）`);

  const HW = 'DE:MO:AC:01:23:45';

  // [1] 准备：出厂烧录 SN-A 并激活
  say('准备：创建产品 xiaov，烧录 SN-A（request_id=req-A）并激活');
  await req('POST', '/admin/api/products', { code: 'xiaov', name: '小V机器人', sn_prefix: 'XV' }, ADMIN);
  const prod = (await req('GET', '/admin/api/products', null, ADMIN)).body.find(p => p.code === 'xiaov');
  let r = await req('POST', '/admin/api/provision', { product: 'xiaov', hardware_id: HW, request_id: 'req-A' }, ADMIN);
  if (!r.body.factory_key) { console.log('    provision 响应异常: HTTP', r.status, JSON.stringify(r.body)); process.exit(1); }
  const fk = r.body.factory_key, snA = r.body.sn;
  const mapsBefore = () => DB.db.prepare('SELECT COUNT(*) AS n FROM provision_requests WHERE hardware_id = ?').get(HW).n;
  const mapsA = mapsBefore();
  await req('POST', '/admin/api/provision/verify', { product: 'xiaov', hardware_id: HW, challenge: r.body.challenge, response: crypto.createHmac('sha256', Buffer.from(fk, 'hex')).update(`v1|provision_verify|${HW}|${r.body.challenge}`).digest('hex') }, ADMIN);
  r = await req('POST', `/xiaov/api/device/activate`, v1body(fk, HW, 'activate'));
  ok(r.body.ok === true && r.body.sn === snA, `SN-A=${snA} 激活成功（火山已注册）`);
  const secretA = r.body.device_secret;
  const credA = DB.getCredentialBySn(prod.id, snA);

  // [2] 业务现状：用户已绑定（挂 MAC），有服务期和一笔已支付订单（挂 SN-A）
  say('业务现状：用户 13900000000 绑定该 MAC，服务期 1 年，一笔已支付订单（针对 SN-A）');
  const user = DB.createUser(prod.id, '13900000000', 'mock-hash');
  DB.createBinding(user.id, prod.id, HW, '客厅的小V');
  const svc = DB.createServiceForDevice(user.id, prod.id, HW, 'annual', 1);
  const ordOld = DB.createOrder({ userId: user.id, credentialId: credA.id, productId: prod.id, amount: 299, plan: 'annual', years: 1 });
  DB.db.prepare("UPDATE orders SET status = 'paid', paid_at = datetime('now') WHERE order_no = ?").run(ordOld.order_no);
  show('数据库', { 绑定: 'MAC（' + HW + '）', 服务到期: svc.expires_at.slice(0, 10), 已支付订单: ordOld.order_no + '（SN-A）' });

  // [3] 续期预留 SN-B：平台行为，不请求火山、不重新烧录
  say('续期预留 SN-B（管理员操作，平台行为）');
  r = await req('POST', '/admin/api/devices/reserve-sn', { product: 'xiaov', hardware_id: HW }, ADMIN);
  ok(r.body.ok === true && !!r.body.sn, `预留成功：新 SN=${r.body.sn}`);
  const snB = r.body.sn;
  const credB = DB.getCredentialBySn(prod.id, snB);
  ok(credB.status === 'provisioned' && !credB.volcano_device_secret, 'SN-B 初始为"待火山激活"，未请求火山');
  ok(!credB.provision_challenge, '未创建出厂验证 challenge（不重新烧 eFuse）');
  ok(DB.getDecryptedFactoryKey(credB) === fk, '复用物理设备共享 FactoryKey');
  ok(mapsBefore() === mapsA, '不新增烧录请求映射');
  show('数据库', { 'SN-A': 'volcano_registered（原样）', 'SN-B': 'provisioned（待火山激活）' });

  // [4] 后台指定 SN-B 为下次上线 SN（选择不依赖火山先注册成功）
  say('后台指定 SN-B 为下次上线 SN（纯选择，设备端此刻无感知）');
  r = await req('PATCH', `/admin/api/credentials/${credB.id}/primary`, {}, ADMIN);
  ok(r.body.ok === true && r.body.selected === true, `已指定 ${r.body.sn} 为下次上线 SN（粘性，直到改选）`);
  show('数据库', { 最近激活: 'SN-A（is_primary=1）', 后台选定: 'SN-B（pending_primary=1）' });
  r = await req('POST', `/xiaov/api/device/status`, v1body(fk, HW, 'status'));
  ok(r.body.ok && r.body.sn === snA, '指定后未激活前 status 仍指向 SN-A（与设备缓存一致）');

  // [5] 设备上线激活 SN-B：不带 SN activate → 解析到后台选定的 B，走首次火山注册
  say('设备上线激活（不带 SN）→ 返回后台选定的 SN-B，首次火山注册');
  r = await req('POST', `/xiaov/api/device/activate`, v1body(fk, HW, 'activate'));
  ok(r.body.ok === true && r.body.sn === snB && r.body.recovered === false, `激活成功：返回 SN-B 的新 DeviceSecret（首次注册）`);
  show('数据库', {
    最近激活: 'SN-B（is_primary=1）',
    绑定: 'MAC（不变，挂物理设备）',
    服务到期: DB.getServiceByHardware(prod.id, HW).expires_at.slice(0, 10) + '（不变）',
    历史订单: ordOld.order_no + '（仍挂 SN-A，不迁移）',
    火山权益: 'SN-B 独立记录；SN-A 权益原样保留',
  });
  ok(DB.getBindingByHardware(prod.id, HW).user_id === user.id, '用户绑定不因激活而变化');
  ok(DB.getServiceByHardware(prod.id, HW).expires_at === svc.expires_at, '平台服务期不因激活而变化');
  ok(DB.getOrderByNo(ordOld.order_no).credential_id === credA.id, '历史订单保留原凭证归属');

  // [6] B 出问题：预留 C 并选定，但 C 迟迟激活失败 → A 的完整凭证始终保留
  say('B 出问题：预留 C 并选定，但 C 激活失败（设备未成功上线）');
  r = await req('POST', '/admin/api/devices/reserve-sn', { product: 'xiaov', hardware_id: HW }, ADMIN);
  const snC = r.body.sn;
  const credC = DB.getCredentialBySn(prod.id, snC);
  await req('PATCH', `/admin/api/credentials/${credC.id}/primary`, {}, ADMIN);
  ok(DB.getDecryptedDeviceSecret(credA) === secretA, 'A 的 DeviceSecret 原样保留（不因切换被清空）');
  r = await req('POST', `/xiaov/api/device/status`, v1body(fk, HW, 'status'));
  ok(r.body.ok && r.body.sn === snB && r.body.device_secret_ready === true, 'C 未激活成功，status 仍指向最近激活的 SN-B');

  // [7] 后台随时选回 A（不受订单/激活结果影响）
  say('后台选回 SN-A（任意未停用的旧 SN 随时可指定）');
  r = await req('PATCH', `/admin/api/credentials/${credA.id}/primary`, {}, ADMIN);
  ok(r.body.ok === true && r.body.selected === true, `已选回 ${r.body.sn}`);
  ok(!DB.getCredentialById(credC.id).pending_primary, 'C 不再是后台选定');

  // [8] 设备下次上线：不带 SN activate → 返回 A 的原凭证
  say('设备下次上线激活（不带 SN）→ 返回 SN-A 的原凭证');
  r = await req('POST', `/xiaov/api/device/activate`, v1body(fk, HW, 'activate'));
  ok(r.body.ok === true && r.body.sn === snA && r.body.recovered === true && r.body.device_secret === secretA, '返回 SN-A 原 DeviceSecret（recovered，与首次激活一致）');
  show('数据库', {
    最近激活: 'SN-A（is_primary=1）',
    后台选定: 'SN-A（粘性保持）',
    绑定: 'MAC（全程未动）',
    服务到期: DB.getServiceByHardware(prod.id, HW).expires_at.slice(0, 10) + '（全程未动）',
    订单: '历史订单仍挂 SN-A，无任何搬迁',
  });

  // [9] B 后续带 SN 激活成功，也不能自动覆盖后台已选定的 A
  say('SN-B 后续带 SN 激活成功（如火山恢复）→ 不改写后台已选定的 SN-A');
  r = await req('POST', `/xiaov/api/device/activate`, v2body(fk, HW, snB));
  ok(r.body.ok === true && r.body.sn === snB && r.body.recovered === true, 'SN-B 带 SN 激活成功（恢复原密钥）');
  ok(!!DB.getCredentialById(credA.id).pending_primary && !DB.getCredentialById(credB.id).pending_primary, '后台选定仍是 SN-A（粘性不被改写）');
  r = await req('POST', `/xiaov/api/device/activate`, v1body(fk, HW, 'activate'));
  ok(r.body.ok === true && r.body.sn === snA && r.body.device_secret === secretA, '下次不带 SN 上线仍返回选定的 SN-A');

  line();
  console.log('演示完成。要点回顾：');
  console.log('  1. 预留 SN 是平台行为：复用 FactoryKey、不请求火山、不重新烧 eFuse、不建烧录 challenge');
  console.log('  2. 选择"下次上线 SN"不依赖火山先注册成功；待激活与已激活的 SN 都可选');
  console.log('  3. 绑定/服务期挂物理设备（MAC），权益按 SN 记录；切换只改选择，不搬任何数据');
  console.log('  4. 切回不受订单/续费任务影响；B 后续激活成功也不能覆盖后台已选定的 A');
  console.log('  5. 前提核对（固件侧）：设备"硬件上来"必须调用 activate 并采用返回的 SN/DeviceSecret，');
  console.log('     老固件若直接使用本地缓存则拿不到新选择——需查实际发布固件确认');
  line();

  srv.kill('SIGTERM');
  DB.db.close();
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (_) {}
}

main().catch(e => { console.error('演示失败:', e); srv.kill('SIGTERM'); DB.db.close(); process.exit(1); });
