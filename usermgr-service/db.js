// SQLite 数据访问层 v3 - 统一 Device Center
// 关键改动：
//   1. SN 和 FactoryKey 由服务器在 provisioning 时生成（烧录工具只传 HardwareID）
//   2. 设备激活以 HardwareID 为根身份，不依赖 SN
//   3. 增加 nonce 防重放表
//   4. user_device_bindings.device_name 改名 nickname
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'usermgr.db');

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---- 建表 ----
db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  instance_id TEXT,
  product_key TEXT,
  product_secret BLOB,
  bot_id TEXT,
  rtc_app_id TEXT,                -- DynamicRegister 返回的产品级 RTCAppID
  sn_prefix TEXT,                 -- SN 前缀，如 "XV"
  sn_seq INTEGER DEFAULT 0,       -- 当前 SN 序列号
  created_at TEXT DEFAULT (datetime('now'))
);

-- 物理设备凭证（出厂录入，永久）
CREATE TABLE IF NOT EXISTS device_credentials (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL,
  sn TEXT NOT NULL,               -- 服务器生成，如 XV000001
  hardware_id TEXT NOT NULL,      -- 设备硬件ID（如 MAC），是设备根身份
  factory_key BLOB NOT NULL,      -- 服务器生成的 FactoryKey（AES 加密存储）
  volcano_device_name TEXT,       -- = product_code + "-" + hardware_id 去冒号
  volcano_device_secret BLOB,     -- 火山注册返回的 device_secret（AES 加密存储）
  volcano_activated_at TEXT,
  status TEXT DEFAULT 'provisioned',  -- provisioning / provisioned / provisioning_failed / retired
  provision_challenge TEXT,           -- 两阶段烧录验证 challenge（hex）
  challenge_expires_at TEXT,          -- challenge 过期时间
  failure_reason TEXT,                -- 烧录失败原因
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(product_id, sn),
  UNIQUE(product_id, hardware_id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,
  plan TEXT DEFAULT 'free',
  plan_expires_at TEXT,
  email_verified INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(product_id, phone),
  UNIQUE(product_id, email),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- 用户-设备绑定关系（可解绑，不影响 device_credentials）
CREATE TABLE IF NOT EXISTS user_device_bindings (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  credential_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  nickname TEXT,                  -- 用户自定义昵称（原 device_name）
  bound_at TEXT DEFAULT (datetime('now')),
  last_seen_at TEXT,
  UNIQUE(credential_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (credential_id) REFERENCES device_credentials(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS device_bind_tokens (
  id INTEGER PRIMARY KEY,
  credential_id INTEGER NOT NULL,
  temp_token TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  UNIQUE(credential_id),
  FOREIGN KEY (credential_id) REFERENCES device_credentials(id)
);

-- nonce 防重放（5 分钟窗口内不得重复）
CREATE TABLE IF NOT EXISTS used_nonces (
  nonce TEXT PRIMARY KEY,
  used_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_nonces_used ON used_nonces(used_at);

-- 手机验证码（密码找回等场景）
CREATE TABLE IF NOT EXISTS phone_codes (
  id INTEGER PRIMARY KEY,
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL,                 -- reset_password / register / change_phone
  expires_at TEXT NOT NULL,
  used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_phone_codes_lookup ON phone_codes(phone, purpose, used);

-- 设备服务期（一台设备一条；首次绑定创建，续费在 expires_at 上累加）
CREATE TABLE IF NOT EXISTS device_services (
  id INTEGER PRIMARY KEY,
  credential_id INTEGER NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,                  -- 当前服务持有人（最近续费人）
  product_id INTEGER NOT NULL,
  start_at TEXT NOT NULL,                    -- 首次服务开始时间
  expires_at TEXT NOT NULL,                  -- 服务到期时间（续费时累加）
  plan TEXT DEFAULT 'annual',
  provider_renew_status TEXT DEFAULT 'none', -- none/pending/completed/failed（最近一次续费状态）
  provider_renew_at TEXT,
  provider_renew_error TEXT,
  provider_license_id TEXT,                  -- 火山 License ID（如适用）
  provider_expires_at TEXT,                  -- 当前已实际开通的火山 License 到期时间
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (credential_id) REFERENCES device_credentials(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);
CREATE INDEX IF NOT EXISTS idx_services_expires ON device_services(expires_at);
CREATE INDEX IF NOT EXISTS idx_services_user ON device_services(user_id);
CREATE INDEX IF NOT EXISTS idx_services_renew ON device_services(provider_renew_status);

-- 订单（续费付款）
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  order_no TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL,
  credential_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,                   -- 金额（分）
  plan TEXT DEFAULT 'annual',
  years INTEGER DEFAULT 1,                   -- 续几年
  status TEXT DEFAULT 'pending',             -- pending(待付款/待审核) / paid / cancelled
  voucher_text TEXT,                         -- 用户上传的转账凭证（流水号/备注）
  voucher_submitted_at TEXT,                 -- 凭证提交时间
  paid_at TEXT,                              -- 管理员确认收款时间
  provider_renew_status TEXT DEFAULT 'none', -- none/pending/processing/completed/failed
  provider_renew_at TEXT,                    -- 最近一次续期操作时间
  provider_renew_completed_at TEXT,          -- 续期最终完成时间（人工确认时）
  provider_renew_operator_id TEXT,           -- 完成续期的操作员（审计追溯）
  provider_license_id TEXT,                  -- 本次续费购买的火山 License ID（历史记录）
  provider_renew_error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (credential_id) REFERENCES device_credentials(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_renew ON orders(provider_renew_status);

CREATE INDEX IF NOT EXISTS idx_credentials_product ON device_credentials(product_id);
CREATE INDEX IF NOT EXISTS idx_credentials_hwid ON device_credentials(hardware_id);
CREATE INDEX IF NOT EXISTS idx_bindings_user ON user_device_bindings(user_id);
CREATE INDEX IF NOT EXISTS idx_bind_tokens_temp ON device_bind_tokens(temp_token);
`);

// ---- 迁移：旧库补 phone 列（email 改为可选后，老库仍可能没有 phone 字段） ----
// 注：SQLite ALTER TABLE ADD COLUMN 不支持 NOT NULL/UNIQUE 约束，
//     所以老库的 phone 列允许 NULL；fresh DB 由 CREATE TABLE 保证 NOT NULL + UNIQUE。
//     真实生产环境迁移老数据时需另行处理（如要求用户首次登录补全 phone）。
{
  const cols = db.prepare("PRAGMA table_info(users)").all();
  if (cols.length > 0 && !cols.some(c => c.name === 'phone')) {
    db.exec("ALTER TABLE users ADD COLUMN phone TEXT");
  }
}

// 迁移：RTCAppID 属于火山产品，不属于单台设备。
{
  const cols = db.prepare("PRAGMA table_info(products)").all();
  if (cols.length > 0 && !cols.some(c => c.name === 'rtc_app_id')) {
    db.exec("ALTER TABLE products ADD COLUMN rtc_app_id TEXT");
  }
}

// 迁移：供应商当前 License 到期日与平台套餐到期日分开记录。
// 老设备首个火山 License 从 DynamicRegister 成功时间起按一年回填；这不会把
// 尚未在火山确认的续费误算成已生效。
{
  const cols = db.prepare("PRAGMA table_info(device_services)").all();
  if (cols.length > 0 && !cols.some(c => c.name === 'provider_expires_at')) {
    db.exec("ALTER TABLE device_services ADD COLUMN provider_expires_at TEXT");
  }
  db.exec(`
    UPDATE device_services
    SET provider_expires_at = COALESCE(
      (SELECT datetime(c.volcano_activated_at, '+1 year')
       FROM device_credentials c WHERE c.id = device_services.credential_id),
      expires_at
    )
    WHERE provider_expires_at IS NULL
  `);
}

// 迁移：device_credentials 加 provision_challenge / challenge_expires_at / failure_reason
{
  const cols = db.prepare("PRAGMA table_info(device_credentials)").all();
  if (cols.length > 0) {
    if (!cols.some(c => c.name === 'provision_challenge')) {
      db.exec("ALTER TABLE device_credentials ADD COLUMN provision_challenge TEXT");
    }
    if (!cols.some(c => c.name === 'challenge_expires_at')) {
      db.exec("ALTER TABLE device_credentials ADD COLUMN challenge_expires_at TEXT");
    }
    if (!cols.some(c => c.name === 'failure_reason')) {
      db.exec("ALTER TABLE device_credentials ADD COLUMN failure_reason TEXT");
    }
  }
}

// 服务期默认长度（年）
const SERVICE_DEFAULT_YEARS = 1;
// 默认年卡金额（分）—— 真实价格由产品/管理员配置，此处仅为占位
// 1 年 = 19.9 元 = 1990 分
const DEFAULT_ANNUAL_AMOUNT = 1990;

// ---- AES 加密 ----
const ENC_KEY = process.env.KEY_ENCRYPTION_SECRET || crypto.randomBytes(32).toString('hex');
const KEY_BYTES = Buffer.from(ENC_KEY.length === 64 ? ENC_KEY : crypto.createHash('sha256').update(ENC_KEY).digest('hex'), 'hex');

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY_BYTES, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}

function decrypt(blob) {
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY_BYTES, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

// ---- 默认产品 ----
const PRODUCT_XIAOV = db.prepare("SELECT id FROM products WHERE code = ?").get('xiaov');
if (!PRODUCT_XIAOV) {
  db.prepare("INSERT INTO products (code, name, sn_prefix) VALUES (?, ?, ?)").run('xiaov', '小V机器人', 'XV');
}

// ==================== Products ====================
function getProductIdByCode(code) {
  const row = db.prepare("SELECT id FROM products WHERE code = ?").get(code);
  return row ? row.id : null;
}

function listProducts() {
  return db.prepare("SELECT id, code, name, instance_id, product_key, bot_id, rtc_app_id, sn_prefix, created_at FROM products ORDER BY id").all();
}

function getProductRow(productId) {
  return db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
}

function getProductConfig(productId) {
  const row = getProductRow(productId);
  if (!row) return null;
  return {
    ...row,
    product_secret: row.product_secret ? decrypt(row.product_secret) : null,
  };
}

function getProductCode(productId) {
  const row = db.prepare("SELECT code FROM products WHERE id = ?").get(productId);
  return row ? row.code : 'unknown';
}

function updateProductVolcanoConfig(productId, { instance_id, product_key, product_secret, bot_id }) {
  const sets = [];
  const vals = [];
  if (instance_id !== undefined) { sets.push('instance_id = ?'); vals.push(instance_id); }
  if (product_key !== undefined) { sets.push('product_key = ?'); vals.push(product_key); }
  if (product_secret !== undefined) {
    sets.push('product_secret = ?');
    vals.push(product_secret ? encrypt(product_secret) : null);
  }
  if (bot_id !== undefined) { sets.push('bot_id = ?'); vals.push(bot_id); }
  if (sets.length === 0) return;
  vals.push(productId);
  db.prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

// 创建新产品（管理员后台用；首次部署时手动添加产品）
function createProduct({ code, name, sn_prefix = '', instance_id = '', product_key, product_secret, bot_id = '' }) {
  // 唯一性检查
  const dup = db.prepare('SELECT id FROM products WHERE code = ?').get(code);
  if (dup) throw new Error('code_exists');
  db.prepare(`
    INSERT INTO products (code, name, sn_prefix, instance_id, product_key, product_secret, bot_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    code,
    name,
    sn_prefix || '',
    instance_id || '',
    product_key || '',
    product_secret ? encrypt(product_secret) : '',
    bot_id || '',
  );
  return db.prepare("SELECT * FROM products WHERE code = ?").get(code);
}

// 删除产品（危险操作；用于产品代码写错的紧急修正）
function deleteProduct(productId) {
  // 仅在没有设备/订单/用户引用时才允许删除
  const ref = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM device_credentials WHERE product_id = ?) AS cred,
      (SELECT COUNT(*) FROM orders WHERE product_id = ?) AS ord
  `).get(productId, productId);
  if (ref.cred > 0 || ref.ord > 0) return false;
  const r = db.prepare('DELETE FROM products WHERE id = ?').run(productId);
  return r.changes > 0;
}

// ==================== Device Credentials ====================
/**
 * 出厂录入阶段 1：服务器生成 SN + FactoryKey + challenge，status = provisioning
 * SN = sn_prefix + 6位零填充序号
 * FactoryKey = 32 字节随机 hex
 * challenge = 32 字节随机 hex，10 分钟过期
 *
 * 重复录入规则：
 *  - status = provisioning：返回原 SN + 原 FactoryKey + 新 challenge（不重新生成 FactoryKey）
 *  - status = provisioned：返回 { already_provisioned: true, sn }，不返回 FactoryKey
 *  - status = provisioning_failed：重新生成 challenge，保留原 FactoryKey，status 改回 provisioning
 *  - status = retired：拒绝
 */
function provisionDevice(productId, hardwareId) {
  const product = getProductRow(productId);
  if (!product) throw new Error('产品不存在');

  const existing = getCredentialByHardwareId(productId, hardwareId);
  if (existing) {
    if (existing.status === 'retired') {
      throw new Error('device_retired');
    }
    if (existing.status === 'provisioned') {
      return { already_provisioned: true, sn: existing.sn };
    }
    // provisioning 或 provisioning_failed：返回原 FactoryKey + 新 challenge
    const factoryKey = decrypt(existing.factory_key);
    const challenge = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    db.prepare(`
      UPDATE device_credentials
      SET provision_challenge = ?, challenge_expires_at = ?, status = 'provisioning', failure_reason = NULL
      WHERE id = ?
    `).run(challenge, expiresAt, existing.id);
    return { sn: existing.sn, factoryKey, challenge };
  }

  // 新设备
  const tx = db.transaction(() => {
    db.prepare("UPDATE products SET sn_seq = sn_seq + 1 WHERE id = ?").run(productId);
    const updated = getProductRow(productId);
    const sn = `${updated.sn_prefix}${String(updated.sn_seq).padStart(6, '0')}`;
    const factoryKey = crypto.randomBytes(32).toString('hex');
    const challenge = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const hwidClean = hardwareId.replace(/[^0-9A-Fa-f]/g, '').toLowerCase();
    const volcanoDeviceName = `${product.code}-${hwidClean}`;
    db.prepare(`
      INSERT INTO device_credentials (product_id, sn, hardware_id, factory_key, volcano_device_name, status, provision_challenge, challenge_expires_at)
      VALUES (?, ?, ?, ?, ?, 'provisioning', ?, ?)
    `).run(productId, sn, hardwareId, encrypt(factoryKey), volcanoDeviceName, challenge, expiresAt);
    return { sn, factoryKey, challenge };
  });
  return tx();
}

/**
 * 出厂录入阶段 2：验证 eFuse HMAC challenge
 * 签名格式：v1|provision_verify|hardwareId|challenge
 * 验证成功 → status = provisioned，清除 challenge
 * 验证失败 → 抛错（不改 status，允许重试）
 */
function verifyProvision(productId, hardwareId, challenge, responseHex) {
  const cred = getCredentialByHardwareId(productId, hardwareId);
  if (!cred) throw new Error('device_not_found');
  if (cred.status === 'provisioned') throw new Error('already_provisioned');
  if (cred.status !== 'provisioning') throw new Error('not_in_provisioning_state');

  // challenge 必须匹配且未过期
  if (cred.provision_challenge !== challenge) throw new Error('challenge_mismatch');
  const expiresAt = new Date(cred.challenge_expires_at).getTime();
  if (Date.now() > expiresAt) throw new Error('challenge_expired');

  // 验证 HMAC
  const factoryKey = decrypt(cred.factory_key);
  const expected = `v1|provision_verify|${hardwareId}|${challenge}`;
  // FactoryKey is returned to the factory tool as hex, but the eFuse contains
  // the corresponding 32 raw bytes. Verify against those same bytes.
  const expectedSig = crypto.createHmac('sha256', Buffer.from(factoryKey, 'hex')).update(expected).digest();
  let got;
  try {
    got = Buffer.from(responseHex, 'hex');
  } catch (e) {
    throw new Error('bad_response_format');
  }
  if (expectedSig.length !== got.length || !crypto.timingSafeEqual(expectedSig, got)) {
    throw new Error('hmac_mismatch');
  }

  // 验证成功
  db.prepare(`
    UPDATE device_credentials
    SET status = 'provisioned', provision_challenge = NULL, challenge_expires_at = NULL
    WHERE id = ?
  `).run(cred.id);
  return { sn: cred.sn, status: 'provisioned' };
}

/**
 * 标记烧录失败（仅记录，不改 provisioning 状态——网络断线不算失败）
 */
function failProvision(productId, hardwareId, reason) {
  const cred = getCredentialByHardwareId(productId, hardwareId);
  if (!cred) throw new Error('device_not_found');
  db.prepare(`
    UPDATE device_credentials SET status = 'provisioning_failed', failure_reason = ? WHERE id = ?
  `).run(reason, cred.id);
  return { sn: cred.sn, status: 'provisioning_failed' };
}

/**
 * 删除设备凭证（仅允许 provisioning / provisioning_failed 状态，已出厂/已激活/已绑定的不允许）
 */
function deleteCredential(id) {
  const cred = getCredentialById(id);
  if (!cred) throw new Error('device_not_found');
  if (!['provisioning', 'provisioning_failed', 'retired'].includes(cred.status)) {
    throw new Error('device_not_deletable');
  }
  // 同时删除关联的绑定关系
  db.prepare("DELETE FROM user_device_bindings WHERE credential_id = ?").run(id);
  db.prepare("DELETE FROM device_credentials WHERE id = ?").run(id);
  return { ok: true };
}

function getCredentialByHardwareId(productId, hardwareId) {
  return db.prepare("SELECT * FROM device_credentials WHERE product_id = ? AND hardware_id = ?").get(productId, hardwareId);
}

function getCredentialBySn(productId, sn) {
  return db.prepare("SELECT * FROM device_credentials WHERE product_id = ? AND sn = ?").get(productId, sn);
}

function getCredentialById(id) {
  return db.prepare("SELECT * FROM device_credentials WHERE id = ?").get(id);
}

function getDecryptedFactoryKey(cred) {
  return decrypt(cred.factory_key);
}

function getDecryptedDeviceSecret(cred) {
  if (!cred.volcano_device_secret) return null;
  return decrypt(cred.volcano_device_secret);
}

const saveVolcanoCredentials = db.transaction((productId, credId, deviceSecret, rtcAppId) => {
  db.prepare(`
    UPDATE device_credentials
    SET volcano_device_secret = ?,
        volcano_activated_at = COALESCE(volcano_activated_at, datetime('now')),
        status = 'volcano_registered'
    WHERE id = ?
  `).run(encrypt(deviceSecret), credId);
  db.prepare(`
    UPDATE products
    SET rtc_app_id = CASE
      WHEN rtc_app_id IS NULL OR rtc_app_id = '' THEN ? ELSE rtc_app_id END
    WHERE id = ?
  `).run(rtcAppId, productId);
  return db.prepare("SELECT rtc_app_id FROM products WHERE id = ?").get(productId).rtc_app_id;
});

function listCredentials(productId) {
  return db.prepare(`
    SELECT c.*,
      (SELECT u.email IS NOT NULL FROM user_device_bindings b JOIN users u ON b.user_id = u.id WHERE b.credential_id = c.id) as bound_user_has_email,
      (SELECT u.phone FROM user_device_bindings b JOIN users u ON b.user_id = u.id WHERE b.credential_id = c.id) as bound_user_phone,
      (SELECT b.id FROM user_device_bindings b WHERE b.credential_id = c.id) as binding_id
    FROM device_credentials c
    WHERE c.product_id = ?
    ORDER BY c.id DESC
  `).all(productId);
}

function setCredentialStatus(id, status) {
  db.prepare("UPDATE device_credentials SET status = ? WHERE id = ?").run(status, id);
}

// ==================== Users ====================
// phone 为主登录账号，email 备选（可空）

/**
 * 手机号标准化：去分隔/去 +86 前缀，统一存为 11 位裸数字（如 13800138000）
 * 接受输入：138 0013 8000 / 138-0013-8000 / +86 13800138000 / 8613800138000
 * 非法格式返回 null。所有 phone 入库/查询前必须先经过此函数。
 */
function normalizePhone(input) {
  if (typeof input !== 'string') return null;
  let s = input.replace(/[^\d+]/g, '');        // 只留数字和 +
  if (s.startsWith('+86')) s = s.slice(3);
  else if (s.startsWith('86') && s.length === 13) s = s.slice(2);
  if (!/^1[3-9]\d{9}$/.test(s)) return null;
  return s;
}

function createUser(productId, phone, passwordHash, email) {
  db.prepare(`INSERT INTO users (product_id, phone, email, password_hash) VALUES (?, ?, ?, ?)`)
    .run(productId, phone, email || null, passwordHash);
  return db.prepare("SELECT * FROM users WHERE product_id = ? AND phone = ?").get(productId, phone);
}

function getUserById(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

function getUserByPhone(productId, phone) {
  return db.prepare("SELECT * FROM users WHERE product_id = ? AND phone = ?").get(productId, phone);
}

// 备用：email 仍可查询（老数据兼容 / 未来 email 找回密码等场景）
function getUserByEmail(productId, email) {
  return db.prepare("SELECT * FROM users WHERE product_id = ? AND email = ?").get(productId, email);
}

// 修改密码（密码找回 / 用户改密码）
function updateUserPassword(userId, passwordHash) {
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, userId);
}

// ---- 手机验证码 ----
// 写入一条验证码（不删旧的，verifyCode 只认最新未使用的）
function createPhoneCode(phone, code, purpose, ttlMinutes = 5) {
  const expires = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO phone_codes (phone, code, purpose, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(phone, code, purpose, expires);
  return expires;
}

// 校验验证码：未过期 + 未使用 + 匹配 → 标记为已使用，返回 true
function verifyPhoneCode(phone, code, purpose) {
  const row = db.prepare(`
    SELECT * FROM phone_codes
    WHERE phone = ? AND code = ? AND purpose = ? AND used = 0
      AND expires_at > datetime('now')
    ORDER BY id DESC LIMIT 1
  `).get(phone, code, purpose);
  if (!row) return false;
  db.prepare("UPDATE phone_codes SET used = 1 WHERE id = ?").run(row.id);
  return true;
}

function listUsersByProduct(productId) {
  return db.prepare(`
    SELECT u.*, (SELECT COUNT(*) FROM user_device_bindings b WHERE b.user_id = u.id) as device_count
    FROM users u
    WHERE u.product_id = ?
    ORDER BY u.id DESC
  `).all(productId);
}

function deleteUser(id) {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!user) throw new Error('user_not_found');
  // 删除用户的绑定关系 + 订单
  db.prepare("DELETE FROM user_device_bindings WHERE user_id = ?").run(id);
  db.prepare("DELETE FROM orders WHERE user_id = ?").run(id);
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
  return { ok: true };
}

function setUserVerified(id) {
  db.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").run(id);
}

function setUserPlan(id, plan, expiresAt) {
  // 已废弃：套餐不再按用户。保留函数以免旧代码调用报错，但不再写 users.plan
  // 真实写入请走 setCredentialServicePlan(credentialId, plan, expiresAt)
  return { ok: true, deprecated: true };
}

// 设备级套餐：直接设置 device_services.plan 和 expires_at
// 用于管理员手动调整设备服务期 / 套餐（如：补偿、补录、特殊情况授权）
function setCredentialServicePlan(credentialId, plan, expiresAt) {
  const svc = getServiceByCredential(credentialId);
  if (!svc) throw new Error('service_not_found');
  db.prepare(`
    UPDATE device_services
    SET plan = ?, expires_at = ?, updated_at = datetime('now')
    WHERE credential_id = ?
  `).run(plan, expiresAt, credentialId);
  return getServiceByCredential(credentialId);
}

// ==================== User-Device Bindings ====================
function createBinding(userId, credentialId, productId, nickname) {
  db.prepare(`
    INSERT INTO user_device_bindings (user_id, credential_id, product_id, nickname)
    VALUES (?, ?, ?, ?)
  `).run(userId, credentialId, productId, nickname || null);
  return db.prepare("SELECT * FROM user_device_bindings WHERE credential_id = ?").get(credentialId);
}

function getBindingByCredential(credentialId) {
  return db.prepare("SELECT * FROM user_device_bindings WHERE credential_id = ?").get(credentialId);
}

function getBindingById(id) {
  return db.prepare("SELECT * FROM user_device_bindings WHERE id = ?").get(id);
}

function listBindingsByUser(userId) {
  return db.prepare(`
    SELECT
      b.*,
      c.sn, c.hardware_id, c.volcano_device_name, c.status as cred_status,
      s.plan as service_plan,
      s.expires_at as service_expires_at,
      s.provider_renew_status as service_renew_status
    FROM user_device_bindings b
    JOIN device_credentials c ON b.credential_id = c.id
    LEFT JOIN device_services s ON s.credential_id = c.id
    WHERE b.user_id = ?
    ORDER BY b.id DESC
  `).all(userId);
}

function listAllBindings(productId) {
  // 不返回 user_email，避免泄露；只返回手机号 + 是否已填邮箱
  return db.prepare(`
    SELECT b.*, u.phone as user_phone, u.email IS NOT NULL as user_has_email,
      c.sn, c.hardware_id, c.volcano_device_name
    FROM user_device_bindings b
    JOIN users u ON b.user_id = u.id
    JOIN device_credentials c ON b.credential_id = c.id
    WHERE b.product_id = ?
    ORDER BY b.id DESC
  `).all(productId);
}

function touchBindingSeen(id) {
  db.prepare("UPDATE user_device_bindings SET last_seen_at = datetime('now') WHERE id = ?").run(id);
}

function deleteBinding(id) {
  db.prepare("DELETE FROM user_device_bindings WHERE id = ?").run(id);
}

// ==================== 设备绑定临时 token ====================
function createBindToken(credentialId) {
  const tempToken = crypto.randomBytes(8).toString('hex');
  const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO device_bind_tokens (credential_id, temp_token, expires_at)
    VALUES (?, ?, ?)
    ON CONFLICT(credential_id) DO UPDATE SET
      temp_token = excluded.temp_token,
      status = 'pending',
      created_at = datetime('now'),
      expires_at = excluded.expires_at
  `).run(credentialId, tempToken, expires);
  return { temp_token: tempToken, expires_at: expires };
}

function getBindToken(tempToken) {
  return db.prepare(`
    SELECT * FROM device_bind_tokens
    WHERE temp_token = ? AND status = 'pending' AND expires_at > datetime('now')
  `).get(tempToken);
}

// poll 用：不过滤 status，但仍然校验未过期
// 用于设备端轮询绑定状态：pending → 等待扫码，confirmed → 已绑定
function getBindTokenAnyStatus(tempToken) {
  return db.prepare(`
    SELECT * FROM device_bind_tokens
    WHERE temp_token = ? AND expires_at > datetime('now')
  `).get(tempToken);
}

function confirmBindToken(tempToken) {
  const t = getBindToken(tempToken);
  if (!t) return null;
  db.prepare("UPDATE device_bind_tokens SET status = 'confirmed' WHERE id = ?").run(t.id);
  return t;
}

function cleanExpiredBindTokens() {
  db.prepare("DELETE FROM device_bind_tokens WHERE expires_at < datetime('now', '-1 day')").run();
}

// ==================== Device Services（设备服务期） ====================
// 首次绑定时创建第一年服务期；续费在 expires_at 上累加
function createServiceForBinding(userId, credentialId, productId, plan = 'annual', years = SERVICE_DEFAULT_YEARS) {
  const now = new Date();
  const startAt = now.toISOString();
  const exp = new Date(now.getTime() + years * 365 * 24 * 60 * 60 * 1000);
  db.prepare(`
    INSERT INTO device_services (credential_id, user_id, product_id, start_at, expires_at, plan, provider_expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(credential_id) DO UPDATE SET
      user_id = excluded.user_id,
      plan = excluded.plan,
      updated_at = datetime('now')
  `).run(credentialId, userId, productId, startAt, exp.toISOString(), plan, exp.toISOString());
  return getServiceByCredential(credentialId);
}

function getServiceByCredential(credentialId) {
  return db.prepare("SELECT * FROM device_services WHERE credential_id = ?").get(credentialId);
}

// 续费：在当前 expires_at 基础上累加 years 年
// 若已过期，则从 now 开始计算（避免续费叠加过期时间）
function extendService(credentialId, userId, years = 1) {
  const svc = getServiceByCredential(credentialId);
  if (!svc) throw new Error('service_not_found');
  const now = Date.now();
  const currentExp = new Date(svc.expires_at).getTime();
  const base = currentExp > now ? currentExp : now;
  const newExp = new Date(base + years * 365 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    UPDATE device_services
    SET expires_at = ?, user_id = ?, provider_renew_status = 'pending',
        provider_renew_at = datetime('now'), provider_renew_error = NULL,
        updated_at = datetime('now')
    WHERE credential_id = ?
  `).run(newExp, userId, credentialId);
  return getServiceByCredential(credentialId);
}

function setServiceRenewStatus(credentialId, status, { error = null, licenseId = null, providerExpiresAt = null } = {}) {
  db.prepare(`
    UPDATE device_services
    SET provider_renew_status = ?,
        provider_renew_error = ?,
        provider_license_id = COALESCE(?, provider_license_id),
        provider_expires_at = COALESCE(?, provider_expires_at),
        updated_at = datetime('now')
    WHERE credential_id = ?
  `).run(status, error, licenseId, providerExpiresAt, credentialId);
}

function listServicesByProduct(productId) {
  return db.prepare(`
    SELECT s.*, c.sn, c.hardware_id, c.volcano_device_name,
      u.phone as user_phone, u.email IS NOT NULL as user_has_email
    FROM device_services s
    JOIN device_credentials c ON s.credential_id = c.id
    LEFT JOIN users u ON s.user_id = u.id
    WHERE s.product_id = ?
    ORDER BY s.expires_at DESC
  `).all(productId);
}

function listServicesByUser(userId) {
  return db.prepare(`
    SELECT s.*, c.sn, c.hardware_id, c.volcano_device_name, c.status as cred_status
    FROM device_services s
    JOIN device_credentials c ON s.credential_id = c.id
    WHERE s.user_id = ?
    ORDER BY s.expires_at DESC
  `).all(userId);
}

// 列出需要后台处理续期的设备（pending 状态）
function listServicesPendingRenew() {
  return db.prepare(`
    SELECT s.*, c.volcano_device_name, p.code as product_code,
           p.instance_id, p.product_key, p.product_secret
    FROM device_services s
    JOIN device_credentials c ON s.credential_id = c.id
    JOIN products p ON s.product_id = p.id
    WHERE s.provider_renew_status = 'pending'
  `).all().map(s => ({ ...s, product_secret: s.product_secret ? decrypt(s.product_secret) : null }));
}

// ==================== Orders（订单） ====================
function createOrder({ userId, credentialId, productId, amount, plan = 'annual', years = 1 }) {
  const orderNo = 'ORD' + Date.now() + crypto.randomBytes(4).toString('hex');
  db.prepare(`
    INSERT INTO orders (order_no, user_id, credential_id, product_id, amount, plan, years)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(orderNo, userId, credentialId, productId, amount, plan, years);
  return getOrderByNo(orderNo);
}

function getOrderById(id) {
  return db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
}

function getOrderByNo(orderNo) {
  return db.prepare("SELECT * FROM orders WHERE order_no = ?").get(orderNo);
}

// 原子标记已付款：返回 changes（0 表示订单非 pending，已被处理过）
// 用于防止并发重复回调导致服务期被延长多次
function markOrderPaid(id) {
  const info = db.prepare(`
    UPDATE orders SET status = 'paid', paid_at = datetime('now')
    WHERE id = ? AND status = 'pending'
  `).run(id);
  return { changes: info.changes, order: getOrderById(id) };
}

// 原子抢占续期任务：pending → processing，changes=1 才抢占成功
// 防止多个 worker 同时处理同一订单导致重复购买 License
function claimOrderForRenew(orderId) {
  const info = db.prepare(`
    UPDATE orders SET provider_renew_status = 'processing', provider_renew_at = datetime('now')
    WHERE id = ? AND provider_renew_status = 'pending' AND status = 'paid'
  `).run(orderId);
  return info.changes === 1;
}

// 重试续期：failed → pending，让后台 worker 重新处理
function retryOrderRenew(orderId) {
  const info = db.prepare(`
    UPDATE orders SET provider_renew_status = 'pending', provider_renew_error = NULL
    WHERE id = ? AND provider_renew_status = 'failed'
  `).run(orderId);
  return info.changes === 1;
}

// 管理员人工完成续期：pending/processing/failed → completed
// 用于火山无公开 API 时，管理员在控制台手动购买 License + 绑定设备后回平台确认
// 写入：orders.provider_license_id（本次续费的 License，历史记录）
//       orders.provider_renew_completed_at / operator_id（审计追溯）
//       device_services.provider_license_id（当前正在使用的 License）
function completeOrderRenew(orderId, licenseId, operatorId) {
  const order0 = getOrderById(orderId);
  if (!order0 || order0.status !== 'paid') return false;   // 必须已付款
  const info = db.prepare(`
    UPDATE orders SET provider_renew_status = 'completed',
                      provider_renew_at = datetime('now'),
                      provider_renew_completed_at = datetime('now'),
                      provider_renew_operator_id = ?,
                      provider_license_id = ?,
                      provider_renew_error = NULL
    WHERE id = ? AND provider_renew_status IN ('pending', 'processing', 'failed') AND status = 'paid'
  `).run(operatorId || 'admin', licenseId || null, orderId);
  if (info.changes !== 1) return false;
  // device_services.provider_license_id 记录"当前正在使用的 License"
  const service = getServiceByCredential(order0.credential_id);
  const currentProviderExpiry = service && new Date(service.provider_expires_at).getTime();
  const providerBase = Number.isFinite(currentProviderExpiry) && currentProviderExpiry > Date.now()
    ? currentProviderExpiry : Date.now();
  const providerExpiresAt = new Date(
    providerBase + order0.years * 365 * 24 * 60 * 60 * 1000
  ).toISOString();
  setServiceRenewStatus(order0.credential_id, 'completed', {
    licenseId: licenseId || null,
    providerExpiresAt,
  });
  return true;
}

// 用户上传转账凭证：订单仍保持 pending，等管理员审核确认后才 paid
function attachVoucher(id, voucherText) {
  db.prepare(`
    UPDATE orders SET voucher_text = ?, voucher_submitted_at = datetime('now')
    WHERE id = ? AND status = 'pending'
  `).run(voucherText, id);
  return getOrderById(id);
}

function setOrderRenewStatus(orderId, status, { error = null } = {}) {
  db.prepare(`
    UPDATE orders
    SET provider_renew_status = ?,
        provider_renew_at = datetime('now'),
        provider_renew_error = ?
    WHERE id = ?
  `).run(status, error, orderId);
}

function listOrdersByUser(userId) {
  return db.prepare(`
    SELECT o.*, c.sn, c.volcano_device_name
    FROM orders o
    JOIN device_credentials c ON o.credential_id = c.id
    WHERE o.user_id = ?
    ORDER BY o.id DESC
  `).all(userId);
}

function listAllOrders(productId) {
  return db.prepare(`
    SELECT o.*, u.phone as user_phone, c.sn, c.volcano_device_name
    FROM orders o
    JOIN users u ON o.user_id = u.id
    JOIN device_credentials c ON o.credential_id = c.id
    WHERE o.product_id = ?
    ORDER BY o.id DESC
  `).all(productId);
}

// 列出已付款但火山续期未完成的订单（后台任务用）
function listOrdersPendingRenew() {
  return db.prepare(`
    SELECT o.*, c.volcano_device_name, p.code as product_code,
           p.instance_id, p.product_key, p.product_secret
    FROM orders o
    JOIN device_credentials c ON o.credential_id = c.id
    JOIN products p ON o.product_id = p.id
    WHERE o.status = 'paid' AND o.provider_renew_status = 'pending'
  `).all().map(o => ({ ...o, product_secret: o.product_secret ? decrypt(o.product_secret) : null }));
}

// ==================== Nonce 防重放 ====================
function isNonceUsed(nonce) {
  return !!db.prepare("SELECT 1 FROM used_nonces WHERE nonce = ?").get(nonce);
}

function recordNonce(nonce) {
  db.prepare("INSERT OR IGNORE INTO used_nonces (nonce) VALUES (?)").run(nonce);
}

function cleanExpiredNonces() {
  // 清理 10 分钟前的 nonce
  db.prepare("DELETE FROM used_nonces WHERE used_at < datetime('now', '-10 minutes')").run();
}

function cleanExpiredPhoneCodes() {
  db.prepare("DELETE FROM phone_codes WHERE expires_at < datetime('now', '-1 day')").run();
}

module.exports = {
  db,
  // products
  getProductIdByCode,
  listProducts,
  getProductRow,
  getProductConfig,
  getProductCode,
  updateProductVolcanoConfig,
  createProduct,
  deleteProduct,
  // credentials
  provisionDevice,
  verifyProvision,
  failProvision,
  deleteCredential,
  deleteUser,
  getCredentialByHardwareId,
  getCredentialBySn,
  getCredentialById,
  getDecryptedFactoryKey,
  getDecryptedDeviceSecret,
  saveVolcanoCredentials,
  listCredentials,
  setCredentialStatus,
  // users
  normalizePhone,
  createUser,
  getUserById,
  getUserByPhone,
  getUserByEmail,
  updateUserPassword,
  createPhoneCode,
  verifyPhoneCode,
  listUsersByProduct,
  setUserVerified,
  setUserPlan,
  setCredentialServicePlan,
  // bindings
  createBinding,
  getBindingByCredential,
  getBindingById,
  listBindingsByUser,
  listAllBindings,
  touchBindingSeen,
  deleteBinding,
  // bind tokens
  createBindToken,
  getBindToken,
  getBindTokenAnyStatus,
  confirmBindToken,
  cleanExpiredBindTokens,
  // device services
  createServiceForBinding,
  getServiceByCredential,
  extendService,
  setServiceRenewStatus,
  listServicesByProduct,
  listServicesByUser,
  listServicesPendingRenew,
  // orders
  createOrder,
  getOrderById,
  getOrderByNo,
  markOrderPaid,
  attachVoucher,
  setOrderRenewStatus,
  claimOrderForRenew,
  retryOrderRenew,
  completeOrderRenew,
  listOrdersByUser,
  listAllOrders,
  listOrdersPendingRenew,
  // nonce
  isNonceUsed,
  recordNonce,
  cleanExpiredNonces,
  cleanExpiredPhoneCodes,
  // 常量
  SERVICE_DEFAULT_YEARS,
  DEFAULT_ANNUAL_AMOUNT,
};
