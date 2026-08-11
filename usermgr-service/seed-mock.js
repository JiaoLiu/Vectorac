// seed-mock.js - 演示数据：1 用户绑 3 设备，每台不同服务期状态
// 跑法：node seed-mock.js
// 会清空 usermgr.db 并写入固定数据，便于在管理后台 / 用户端看效果
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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
const PWD_HASH = hashPwd('Test1234!');

// ==================== 产品 ====================
// DB 启动时会自动 init products 表，列出全部
const products = DB.listProducts();
console.log('产品:', products.map(p => `${p.code}(${p.id})`).join(', '));
if (products.length === 0) { console.error('未初始化产品'); process.exit(1); }
const product = products[0];
const pid = product.id;

// ==================== 用户 ====================
// 13800000001 / Test1234!
const user = DB.createUser(pid, '13800000001', PWD_HASH, null);  // email 可选
console.log('用户:', user.phone, 'id=' + user.id);

// ==================== 设备 3 台 ====================
const now = Date.now();
const day = 24 * 60 * 60 * 1000;

// 设备 1：active + 年卡，还有 200 天到期
const p1 = DB.provisionDevice(pid, 'AA:BB:CC:00:00:01');
const c1 = DB.getCredentialBySn(pid, p1.sn);
const binding1 = DB.createBinding(user.id, c1.id, pid, '客厅小V');
DB.createServiceForBinding(user.id, c1.id, pid, 'annual', 200 / 365);
console.log(`设备1: ${c1.sn} 昵称=客厅小V  service=年卡 +200天`);

// 设备 2：expired（30 天前到期）
const p2 = DB.provisionDevice(pid, 'AA:BB:CC:00:00:02');
const c2 = DB.getCredentialBySn(pid, p2.sn);
const binding2 = DB.createBinding(user.id, c2.id, pid, '卧室小V');
const pastStart = new Date(now - 400 * day).toISOString();
const pastExp = new Date(now - 30 * day).toISOString();
DB.db.prepare(`
  INSERT INTO device_services (credential_id, user_id, product_id, start_at, expires_at, plan)
  VALUES (?, ?, ?, ?, ?, ?)
`).run(c2.id, user.id, pid, pastStart, pastExp, 'annual');
console.log(`设备2: ${c2.sn} 昵称=卧室小V  service=年卡 -30天(已过期)`);

// 设备 3：active + 基础版，还有 30 天到期（演示即将过期）
const p3 = DB.provisionDevice(pid, 'AA:BB:CC:00:00:03');
const c3 = DB.getCredentialBySn(pid, p3.sn);
const binding3 = DB.createBinding(user.id, c3.id, pid, '书房小V');
const start3 = new Date(now - 335 * day).toISOString();
const exp3 = new Date(now + 30 * day).toISOString();
DB.db.prepare(`
  INSERT INTO device_services (credential_id, user_id, product_id, start_at, expires_at, plan)
  VALUES (?, ?, ?, ?, ?, ?)
`).run(c3.id, user.id, pid, start3, exp3, 'basic');
console.log(`设备3: ${c3.sn} 昵称=书房小V  service=基础版 +30天`);

// ==================== 一张订单（设备 2 续费中） ====================
const order = DB.createOrder({
  userId: user.id,
  credentialId: c2.id,
  productId: pid,
  amount: 1990,           // 19.9 元 / 年
  plan: 'annual',
  years: 1,
});
console.log(`订单: ${order.order_no} 金额=199.00元  年限=1年  status=pending(待付款)`);

// ==================== 总结 ====================
console.log('\n演示账号：');
console.log(`  用户手机号: 13800000001`);
console.log(`  登录密码: Test1234!`);
console.log(`  产品: ${product.code}`);
console.log(`\n管理后台:`);
console.log(`  http://localhost:3031/admin/`);
console.log(`  管理员密码: admin（或 .env 里的 ADMIN_PASSWORD）`);
console.log(`\n可以看到：`);
console.log(`  - 用户列表: 13800000001 已绑 3 台`);
console.log(`  - 设备列表: 3 台 SN 各异，套餐/服务到期列各不相同`);
console.log(`  - 改套餐: 点设备行的「改套餐」按钮即可手动调整 service`);
console.log(`  - 订单: 一张 pending 订单等用户提交凭证`);
console.log(`\n用户端:`);
console.log(`  http://localhost:3031/account/`);
console.log(`  → 登录 → 我的 → 看到 3 台设备状态不一`);
