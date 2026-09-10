// seed-mock.js - 演示数据：多用户、多设备、License切换、多订单状态
// 跑法：node seed-mock.js
// 会清空 usermgr.db 并写入固定数据，便于在管理后台 / 用户端看效果
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// 必须在 require('./db') 之前加载 .env：
// db.js 的加密密钥来自 KEY_ENCRYPTION_SECRET，读不到时用进程内随机密钥，
// 重启后数据将无法解密（FactoryKey / DeviceSecret 全部失效）
require('dotenv').config();

// 清掉旧库，让 seed 可重复跑
const dbFile = path.join(__dirname, 'data', 'usermgr.db');
for (const f of [dbFile, dbFile + '-wal', dbFile + '-shm']) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

const DB = require('./db');

// 用 server.js 同款 pbkdf2 哈希
function hashPwd(pwd) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(pwd, salt, 100000, 64, 'sha512').toString('hex');
  return `pbkdf2$${salt}$${hash}`;
}

// ==================== 产品 ====================
const products = DB.listProducts();
console.log('产品:', products.map(p => `${p.code}(${p.id})`).join(', '));
if (products.length === 0) { console.error('未初始化产品'); process.exit(1); }
const product = products[0];
const pid = product.id;

// ==================== 用户 3 个 ====================
const users = [];
const userDefs = [
  { phone: '13800000001', pwd: 'Test1234!', email: 'user1@test.com' },
  { phone: '13800000002', pwd: 'Test1234!', email: 'user2@test.com' },
  { phone: '13800000003', pwd: 'Test1234!', email: null },
];
for (const u of userDefs) {
  const user = DB.createUser(pid, u.phone, hashPwd(u.pwd), u.email);
  users.push(user);
  console.log(`用户: ${user.phone} id=${user.id}`);
}

// ==================== 辅助：创建设备并标记 volcano_registered ====================
function makeDevice(hardwareId, opts = {}) {
  const p = DB.provisionDevice(pid, hardwareId, opts);
  const cred = DB.getCredentialBySn(pid, p.sn);
  // 模拟已注册火山（saveVolcanoCredentials 会加密存储 device_secret 并标记 volcano_registered）
  const fakeDeviceSecret = crypto.randomBytes(32).toString('hex');
  DB.saveVolcanoCredentials(pid, cred.id, fakeDeviceSecret, product.rtc_app_id || 'mock-rtc-app-id');
  // 标记为最近激活（is_primary）
  DB.markActivated(pid, hardwareId, cred.id);
  return DB.getCredentialById(cred.id);
}

function makeDeviceNoVolcano(hardwareId, opts = {}) {
  const p = DB.provisionDevice(pid, hardwareId, opts);
  const cred = DB.getCredentialBySn(pid, p.sn);
  // 只标记 provisioned（未注册火山）
  DB.db.prepare(`
    UPDATE device_credentials SET status = 'provisioned' WHERE id = ?
  `).run(cred.id);
  return DB.getCredentialById(cred.id);
}

// ==================== 设备 ====================
const now = Date.now();
const day = 24 * 60 * 60 * 1000;

// ---------- 用户 1：3 台设备（不同状态） ----------
// 设备 1：active + 年卡，+200天
const d1 = makeDevice('AA:BB:CC:00:00:01');
DB.createBinding(users[0].id, pid, d1.hardware_id, '客厅小V');
DB.createServiceForDevice(users[0].id, pid, d1.hardware_id, 'annual', 200 / 365);
console.log(`  设备1: ${d1.sn} 年卡 +200天`);

// 设备 2：expired 30天
const d2 = makeDevice('AA:BB:CC:00:00:02');
DB.createBinding(users[0].id, pid, d2.hardware_id, '卧室小V');
DB.db.prepare(`
  INSERT INTO device_services (user_id, product_id, hardware_id, start_at, expires_at, plan)
  VALUES (?, ?, ?, ?, ?, ?)
`).run(users[0].id, pid, d2.hardware_id,
  new Date(now - 400 * day).toISOString(),
  new Date(now - 30 * day).toISOString(),
  'annual');
console.log(`  设备2: ${d2.sn} 年卡 -30天(已过期)`);

// 设备 3：active + 基础版，+30天
const d3 = makeDevice('AA:BB:CC:00:00:03');
DB.createBinding(users[0].id, pid, d3.hardware_id, '书房小V');
DB.db.prepare(`
  INSERT INTO device_services (user_id, product_id, hardware_id, start_at, expires_at, plan)
  VALUES (?, ?, ?, ?, ?, ?)
`).run(users[0].id, pid, d3.hardware_id,
  new Date(now - 335 * day).toISOString(),
  new Date(now + 30 * day).toISOString(),
  'basic');
console.log(`  设备3: ${d3.sn} 基础版 +30天`);

// ---------- 用户 2：2 台设备（含 License 切换场景） ----------
// 设备 4：active + 年卡，+100天，作为切换源
const d4 = makeDevice('AA:BB:CC:00:00:04');
DB.createBinding(users[1].id, pid, d4.hardware_id, '客厅机器人');
DB.createServiceForDevice(users[1].id, pid, d4.hardware_id, 'annual', 100 / 365);
console.log(`  设备4: ${d4.sn} 年卡 +100天`);

// 设备 5：同一 MAC 的第二个 SN（已注册火山，License 切换目标），设为后台选定
const d5 = makeDevice('AA:BB:CC:00:00:04', { newSn: true });
// 第二个 SN 不标记最近激活（只有源凭证是 is_primary）
DB.db.prepare(`UPDATE device_credentials SET is_primary = 0 WHERE id = ?`).run(d5.id);
d5.is_primary = 0;
console.log(`  设备5: ${d5.sn} 同MAC第二个SN（License切换目标）`);

// 管理员指定 d5 为"下次上线使用的 SN"（纯选择，不影响绑定/服务期/订单）
DB.setPrimaryCredential(pid, 'AA:BB:CC:00:00:04', d5.id);
console.log(`  → 已指定 ${d5.sn} 为后台选定（下次上线使用）`);

// ---------- 用户 3：2 台设备 ----------
// 设备 6：active + 年卡，+365天
const d6 = makeDevice('AA:BB:CC:00:00:06');
DB.createBinding(users[2].id, pid, d6.hardware_id, '我的小V');
DB.createServiceForDevice(users[2].id, pid, d6.hardware_id, 'annual', 1);
console.log(`  设备6: ${d6.sn} 年卡 +365天`);

// 设备 7：已过期 90天，年卡
const d7 = makeDevice('AA:BB:CC:00:00:07');
DB.createBinding(users[2].id, pid, d7.hardware_id, '另一台小V');
DB.db.prepare(`
  INSERT INTO device_services (user_id, product_id, hardware_id, start_at, expires_at, plan)
  VALUES (?, ?, ?, ?, ?, ?)
`).run(users[2].id, pid, d7.hardware_id,
  new Date(now - 455 * day).toISOString(),
  new Date(now - 90 * day).toISOString(),
  'annual');
console.log(`  设备7: ${d7.sn} 年卡 -90天(已过期)`);

// ---------- 未绑定设备（已注册火山，未绑定用户） ----------
const d8 = makeDevice('AA:BB:CC:00:00:08');
console.log(`  设备8: ${d8.sn} 未绑定（已注册火山）`);

// ---------- 未注册火山的设备 ----------
const d9 = makeDeviceNoVolcano('AA:BB:CC:00:00:09');
console.log(`  设备9: ${d9.sn} 已录入未注册火山`);

// ==================== 订单（多种状态） ====================
const orders = [];

// 订单 1：pending（待付款），设备2
const o1 = DB.createOrder({ userId: users[0].id, credentialId: d2.id, productId: pid, amount: 19900, plan: 'annual', years: 1 });
DB.attachVoucher(o1.id, '微信转账 199元 2024-01-15');
orders.push(o1);
console.log(`  订单1: ${o1.order_no} pending ¥199.00 设备${d2.sn}`);

// 订单 2：paid + 续期 pending（待完成续期），设备2
const o2 = DB.createOrder({ userId: users[0].id, credentialId: d2.id, productId: pid, amount: 19900, plan: 'annual', years: 1 });
DB.markOrderPaid(o2.id);
DB.db.prepare(`UPDATE orders SET provider_renew_status = 'pending' WHERE id = ?`).run(o2.id);
DB.db.prepare(`UPDATE device_sn_rights SET provider_renew_status = 'pending' WHERE credential_id = ?`).run(d2.id);
orders.push(o2);
console.log(`  订单2: ${o2.order_no} paid+续期pending ¥199.00 设备${d2.sn}`);

// 订单 3：paid + 续期 completed，设备3（续费完成）
const o3 = DB.createOrder({ userId: users[0].id, credentialId: d3.id, productId: pid, amount: 9900, plan: 'basic', years: 1 });
DB.markOrderPaid(o3.id);
DB.db.prepare(`UPDATE orders SET provider_renew_status = 'completed', provider_renew_completed_at = datetime('now'), provider_license_id = 'LIC-DEMO-003', provider_renew_operator_id = 'admin' WHERE id = ?`).run(o3.id);
orders.push(o3);
console.log(`  订单3: ${o3.order_no} paid+续期completed ¥99.00 设备${d3.sn}`);

// 订单 4：paid + 续期 failed，设备7
const o4 = DB.createOrder({ userId: users[2].id, credentialId: d7.id, productId: pid, amount: 19900, plan: 'annual', years: 1 });
DB.markOrderPaid(o4.id);
DB.db.prepare(`UPDATE orders SET provider_renew_status = 'failed', provider_renew_error = '火山API超时，License购买失败' WHERE id = ?`).run(o4.id);
orders.push(o4);
console.log(`  订单4: ${o4.order_no} paid+续期failed ¥199.00 设备${d7.sn}`);

// 订单 5：pending（待付款），设备7
const o5 = DB.createOrder({ userId: users[2].id, credentialId: d7.id, productId: pid, amount: 19900, plan: 'annual', years: 1 });
orders.push(o5);
console.log(`  订单5: ${o5.order_no} pending ¥199.00 设备${d7.sn}`);

// 订单 6：paid + 续期 completed，设备1（历史订单）
const o6 = DB.createOrder({ userId: users[0].id, credentialId: d1.id, productId: pid, amount: 19900, plan: 'annual', years: 1 });
DB.markOrderPaid(o6.id);
DB.db.prepare(`UPDATE orders SET provider_renew_status = 'completed', provider_renew_completed_at = datetime('now'), provider_license_id = 'LIC-DEMO-001', provider_renew_operator_id = 'admin' WHERE id = ?`).run(o6.id);
orders.push(o6);
console.log(`  订单6: ${o6.order_no} paid+续期completed ¥199.00 设备${d1.sn}`);

// 订单 7：paid + 续期 completed，设备6
const o7 = DB.createOrder({ userId: users[2].id, credentialId: d6.id, productId: pid, amount: 19900, plan: 'annual', years: 1 });
DB.markOrderPaid(o7.id);
DB.db.prepare(`UPDATE orders SET provider_renew_status = 'completed', provider_renew_completed_at = datetime('now'), provider_license_id = 'LIC-DEMO-006', provider_renew_operator_id = 'admin' WHERE id = ?`).run(o7.id);
orders.push(o7);
console.log(`  订单7: ${o7.order_no} paid+续期completed ¥199.00 设备${d6.sn}`);

// 订单 8：pending（待付款，无凭证），设备3
const o8 = DB.createOrder({ userId: users[0].id, credentialId: d3.id, productId: pid, amount: 9900, plan: 'basic', years: 1 });
orders.push(o8);
console.log(`  订单8: ${o8.order_no} pending ¥99.00 设备${d3.sn}`);

// ==================== 总结 ====================
console.log('\n演示账号：');
for (let i = 0; i < users.length; i++) {
  console.log(`  用户${i + 1}: ${users[i].phone} / ${userDefs[i].pwd}${userDefs[i].email ? ' (' + userDefs[i].email + ')' : ''}`);
}
console.log(`  产品: ${product.code}`);
console.log(`\n管理后台:`);
console.log(`  http://localhost:3031/admin/`);
console.log(`  管理员密码: admin（或 .env 里的 ADMIN_PASSWORD）`);
console.log(`\n数据概览：`);
console.log(`  - 用户: ${users.length} 个`);
console.log(`  - 设备: 9 台（7 台已绑用户，1 台未绑定，1 台未注册火山）`);
console.log(`  - 设备4/5: 同一 MAC 两个 SN，SN-B 已选为"下次上线使用"（可测试 License 切换）`);
console.log(`  - 订单: ${orders.length} 张（2 pending / 2 续期pending / 3 续期completed / 1 续期failed）`);
console.log(`\n用户端:`);
console.log(`  http://localhost:3031/account/`);
