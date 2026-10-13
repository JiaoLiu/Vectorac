// Mock 数据导入脚本 — 用于管理界面功能测试
// 隔离保证：演示数据写入独立目录 data-demo（见 .gitignore），绝不触碰默认 data/。
// 预览服务需用同一目录启动：USERMGR_DATA_DIR=data-demo node server.js
const path = require('path');
process.env.USERMGR_DATA_DIR = path.join(__dirname, 'data-demo');
// 必须在 require('./db.js') 之前加载 .env：加密密钥来自 KEY_ENCRYPTION_SECRET，
// 读不到时 db.js 用进程内随机密钥，之后服务端（有 .env）将无法解密
require('dotenv').config();
const DB = require('./db.js');
const crypto = require('crypto');

const pid = DB.getProductIdByCode('xiaov');

// 清理旧数据
DB.db.prepare('DELETE FROM device_sn_rights').run();
DB.db.prepare('DELETE FROM user_device_bindings').run();
DB.db.prepare('DELETE FROM device_services').run();
DB.db.prepare('DELETE FROM orders').run();
DB.db.prepare('DELETE FROM device_credentials').run();
DB.db.prepare('DELETE FROM users').run();
DB.db.prepare('DELETE FROM provision_requests').run();
DB.db.prepare('DELETE FROM factory_key_archive').run();
DB.db.prepare('UPDATE products SET sn_seq = 0 WHERE code = ?').run('xiaov');

// 密码 hash（123456）
const ph = crypto.createHash('sha256').update('123456').digest('hex');

// 创建 3 个用户
const users = [];
for (let i = 0; i < 3; i++) {
  users.push(DB.createUser(pid, '1380013800' + i, ph));
}

// 创建 5 个已激活的凭证
const macs = [
  'AC:A7:04:28:C9:10',
  'BB:CC:DD:EE:00:01',
  'BB:CC:DD:EE:00:02',
  'BB:CC:DD:EE:00:03',
  'BB:CC:DD:EE:00:04',
];
const creds = [];
macs.forEach((mac, i) => {
  const r = DB.provisionDevice(pid, mac, { requestId: 'seed-' + i });
  const cred = DB.getCredentialBySn(pid, r.sn);
  DB.setCredentialStatus(cred.id, 'volcano_registered');
  creds.push({ credential_id: cred.id, sn: r.sn, mac });
});

// 给第一个 MAC 追加第二个 SN（模拟一台设备多个 License，可测试"设为使用中"切换）
{
  const r = DB.provisionDevice(pid, macs[0], { newSn: true, requestId: 'seed-extra-0' });
  const cred = DB.getCredentialBySn(pid, r.sn);
  DB.setCredentialStatus(cred.id, 'volcano_registered');
  creds.push({ credential_id: cred.id, sn: r.sn, mac: macs[0] });
}

// 绑定前 3 个凭证（绑定/服务期挂物理设备 MAC，与具体 SN 无关）
const bindPairs = [
  [creds[0], users[0].id, '小V客厅'],
  [creds[1], users[0].id, '小V卧室'],
  [creds[2], users[1].id, '小V办公室'],
];
bindPairs.forEach(([cred, uid, nick]) => {
  DB.createBinding(uid, pid, cred.mac, nick);
  DB.createServiceForDevice(uid, pid, cred.mac, 'annual', 1);
});

// 创建订单（未支付，可测试模拟支付；订单记录本次续费针对的 SN）
bindPairs.forEach(([cred, uid], i) => {
  DB.createOrder({ userId: uid, credentialId: cred.credential_id, productId: pid, amount: 299, plan: 'annual', years: 1 });
});

console.log('=== Mock 数据导入完成 ===');
console.log('用户:', users.map(u => u.phone).join(', '));
console.log('凭证:', creds.map(c => c.sn).join(', '), '（全部 volcano_registered）');
console.log('MAC ' + macs[0] + ' 有两个 SN（' + creds[0].sn + ' / ' + creds[5].sn + '），可在管理界面测试 License 切换');
console.log('绑定: 3 个（凭证1→用户0, 凭证2→用户0, 凭证3→用户1）');
console.log('服务期: 3 个（各1年）');
console.log('订单: 3 个（各299元，未支付）');
console.log('未绑定凭证: 2 个（可测试新绑定流程）');
console.log('用户密码: 123456');
