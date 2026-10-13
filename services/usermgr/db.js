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

// ---- AES 加密密钥（必须在打开数据库/建表/迁移之前校验） ----
// 持久化数据库必须使用固定密钥：缺少 KEY_ENCRYPTION_SECRET 时立即拒绝加载，
// 绝不能用进程内随机密钥兜底——随机密钥加密的数据在重启后永远无法解密。
// 校验必须先于任何数据库访问：缺密钥时保证数据库文件一个字节都不被改动。
// 所有入口（server/seed/测试/演示脚本）都必须显式提供密钥（通常经 dotenv 加载 .env）。
const ENC_KEY = process.env.KEY_ENCRYPTION_SECRET;
if (!ENC_KEY) {
  throw new Error(
    '缺少 KEY_ENCRYPTION_SECRET 环境变量：加密密钥必须固定配置（通常在 .env 中，由 dotenv 加载）。' +
    '没有固定密钥时不能用进程随机密钥兜底，否则重启后 FactoryKey/DeviceSecret 等加密数据将无法解密。'
  );
}
const KEY_BYTES = Buffer.from(ENC_KEY.length === 64 ? ENC_KEY : crypto.createHash('sha256').update(ENC_KEY).digest('hex'), 'hex');

// 数据目录可用 USERMGR_DATA_DIR 覆盖（仅供测试在临时目录建库，生产默认 ./data）
const DATA_DIR = process.env.USERMGR_DATA_DIR || path.join(__dirname, 'data');
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
  provision_request_id TEXT,          -- 烧录请求幂等键（同一操作的重复请求返回同一会话）
  provision_resumed INTEGER DEFAULT 0, -- 当前会话是否由恢复/轮换产生（非首次烧录会话）
  is_primary INTEGER DEFAULT 0,        -- 同一 MAC 多个 SN 时，最近一次激活返回给设备的凭证（"最近激活"）
  pending_primary INTEGER DEFAULT 0,   -- 管理员选定的"下次上线 SN"：设备下次不带 SN 激活即返回该 SN 的凭证；保持粘性直到管理员改选
  pending_version INTEGER DEFAULT 0,   -- （已废弃）旧两段式切换的版本号，仅保留列兼容旧库
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(product_id, sn),
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
-- 绑定属于物理设备（product_id + hardware_id），与具体 SN 无关：
-- 后台切换"下次上线 SN"不需要搬迁绑定。
CREATE TABLE IF NOT EXISTS user_device_bindings (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  hardware_id TEXT NOT NULL,      -- 物理设备身份（如 MAC），绑定挂在设备上
  nickname TEXT,                  -- 用户自定义昵称（原 device_name）
  bound_at TEXT DEFAULT (datetime('now')),
  last_seen_at TEXT,
  UNIQUE(product_id, hardware_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
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
-- 平台服务期属于物理设备（product_id + hardware_id），切换 SN 不搬迁、不清空。
-- 火山侧权益（License ID / 有效期 / 处理状态）按 SN 记录在 device_sn_rights。
CREATE TABLE IF NOT EXISTS device_services (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL,
  hardware_id TEXT NOT NULL,                 -- 物理设备身份（如 MAC）
  user_id INTEGER NOT NULL,                  -- 当前服务持有人（最近续费人）
  start_at TEXT NOT NULL,                    -- 首次服务开始时间
  expires_at TEXT NOT NULL,                  -- 服务到期时间（续费时累加）
  plan TEXT DEFAULT 'annual',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(product_id, hardware_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);
CREATE INDEX IF NOT EXISTS idx_services_expires ON device_services(expires_at);
CREATE INDEX IF NOT EXISTS idx_services_user ON device_services(user_id);

-- 火山权益（按 SN 记录）：License 属于具体 SN 的火山设备，不随切换转移。
-- provider_renew_status: none/pending/processing/completed/failed/unconfirmed
--   unconfirmed = 该 SN 的火山权益未经平台确认（不得自动判定为可用）
CREATE TABLE IF NOT EXISTS device_sn_rights (
  id INTEGER PRIMARY KEY,
  credential_id INTEGER NOT NULL UNIQUE,
  provider_renew_status TEXT DEFAULT 'none',
  provider_renew_at TEXT,
  provider_renew_error TEXT,
  provider_license_id TEXT,                  -- 当前使用的火山 License ID
  provider_expires_at TEXT,                  -- 当前已实际开通的火山 License 到期时间
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (credential_id) REFERENCES device_credentials(id)
);

-- 订单（续费付款）
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  order_no TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL,
  credential_id INTEGER NOT NULL,            -- 本次续费针对的 SN（下单时的火山设备）；任务始终绑定该 SN，切换选择不影响
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

-- 烧录请求幂等映射（request_id → 目标记录）。一次操作一条映射，永久保留：
-- 恢复/轮换不会覆盖旧映射，原请求延迟重放仍指向同一条记录；
-- 目标凭证被删除后映射保留为墓碑（重放被拒，不重新创建）。
-- factory_key 同时加密存档：MAC 的全部凭证记录被删除后，凭墓碑恢复共享
-- FactoryKey（eFuse 只烧一次，换新密钥会让已烧 eFuse 的设备永远无法验证）。
-- device_credentials.provision_request_id 是历史遗留列（只记最后一个），已不作为查询依据。
CREATE TABLE IF NOT EXISTS provision_requests (
  request_id TEXT PRIMARY KEY,
  product_id INTEGER NOT NULL,
  hardware_id TEXT NOT NULL,
  sn TEXT NOT NULL,
  mode TEXT,                          -- 'new_sn' / 'sn' / 'plain'（从旧列回填时为 NULL，跳过模式校验）
  factory_key BLOB,                   -- 共享 FactoryKey（AES 加密存档，墓碑恢复用）
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id)
);
CREATE INDEX IF NOT EXISTS idx_provreq_sn ON provision_requests(product_id, sn);

-- 订单"作废并重新分配"的幂等记录：request_id 绑定订单与本次操作参数。
-- 重放只返回该次操作的原结果（预留了哪个 SN、作废了哪个 SN），绝不修改当前关联；
-- request_id 同时要求全局唯一（不得复用烧录/其他订单的映射），防止把订单
-- 关联到其他设备的 SN。延迟重放不能把订单指回已作废的旧 SN。
CREATE TABLE IF NOT EXISTS order_realloc_requests (
  request_id TEXT PRIMARY KEY,
  order_id INTEGER NOT NULL,
  reserved_credential_id INTEGER NOT NULL,   -- 本次操作预留的替代 SN
  voided_credential_id INTEGER,              -- 本次操作作废的 SN（无则为 NULL）
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (reserved_credential_id) REFERENCES device_credentials(id)
);

-- FactoryKey 存档（按 MAC 维度，独立于 request_id 和凭证记录）：
-- 所有录入路径统一存档；凭证全删后仍可恢复共享密钥（eFuse 只烧一次）；
-- 无 request_id 的录入也会存档，确保删除后可恢复。
CREATE TABLE IF NOT EXISTS factory_key_archive (
  product_id INTEGER NOT NULL,
  hardware_id TEXT NOT NULL,
  factory_key BLOB NOT NULL,          -- AES 加密存档
  archived_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (product_id, hardware_id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- 已完成出厂验证的物理设备（product_id + hardware_id 维度的事实标记）：
-- 烧录验证通过或火山激活后写入，永久保留；删除 SN 记录不改变该事实。
-- 预留新 SN 前必须存在该标记——"有密钥存档"只说明烧过密钥，不等于验证成功。
CREATE TABLE IF NOT EXISTS factory_verified_devices (
  product_id INTEGER NOT NULL,
  hardware_id TEXT NOT NULL,
  verified_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (product_id, hardware_id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);
`);

// 回填：旧库/已运行系统中"有可靠验证证据"的设备（幂等，每次启动执行）。
// 证据口径：当前状态为 provisioned / volcano_registered，或存在火山激活历史
// （激活以 FactoryKey 签名验证为前提，volcano_activated_at 是硬证据）。
// retired 不作为证据——退役 ≠ 验证成功：从未验证的记录退役后重启服务，
// 仍保持未知状态，不能因重启回填被当成验证成功。
db.exec(`
  INSERT OR IGNORE INTO factory_verified_devices (product_id, hardware_id)
  SELECT DISTINCT product_id, hardware_id FROM device_credentials
  WHERE status IN ('provisioned', 'volcano_registered')
     OR volcano_activated_at IS NOT NULL
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

// 迁移：账号注销模型（软删除）。
// 删除用户 = 注销：保留订单/服务期的审计关联，绑定随注销解除，
// 设备、FactoryKey、各 SN 及其权益全部保留。phone/email 匿名化释放原手机号。
{
  const cols = db.prepare("PRAGMA table_info(users)").all();
  if (cols.length > 0 && !cols.some(c => c.name === 'deleted_at')) {
    db.exec("ALTER TABLE users ADD COLUMN deleted_at TEXT");
  }
}

// 迁移：确认收款自动预留的新 SN（订单 → 新 SN 关联，审计 + 展示）。
{
  const cols = db.prepare("PRAGMA table_info(orders)").all();
  if (cols.length > 0 && !cols.some(c => c.name === 'reserved_credential_id')) {
    db.exec("ALTER TABLE orders ADD COLUMN reserved_credential_id INTEGER REFERENCES device_credentials(id)");
  }
  // 订单续期流程版本：'new_sn' = 新流程（确认收款即自动预留新 SN，激活自带一年 License）；
  // NULL = 旧流程订单（给原 SN 购买 License 续期）。用于区分重放语义：
  // 已付款订单重放永远只读，不补 SN、不改续期状态。
  if (cols.length > 0 && !cols.some(c => c.name === 'renew_mode')) {
    db.exec("ALTER TABLE orders ADD COLUMN renew_mode TEXT");
  }
  // 预留 SN 替代历史（JSON 数组）：[{credential_id, sn, voided_at}]。
  // "作废并重新分配"时写入；凭证记录本身保留（retired 终态），订单关联历史不丢。
  if (cols.length > 0 && !cols.some(c => c.name === 'reserved_history')) {
    db.exec("ALTER TABLE orders ADD COLUMN reserved_history TEXT");
  }
}

// 迁移：撤掉"手工确认权益"关卡。按业务规则（实际激活后一年、火山控制），
// 实际激活成功即视为获得一年 License，到期时间按首次激活 +1 年推算（展示用）。
// 旧代码写入的 unconfirmed 且无到期时间的权益记录按激活事实回填；
// 已有真实到期时间/续期记录的不动（火山有实际返回时以实际结果为准）。
db.exec(`
  UPDATE device_sn_rights SET
    provider_renew_status = 'completed',
    provider_expires_at = datetime(
      (SELECT c.volcano_activated_at FROM device_credentials c WHERE c.id = device_sn_rights.credential_id),
      '+1 year')
  WHERE provider_renew_status = 'unconfirmed'
    AND provider_expires_at IS NULL
`);

// 迁移：供应商当前 License 到期日与平台套餐到期日分开记录。
// 老设备首个火山 License 从 DynamicRegister 成功时间起按一年回填；这不会把
// 尚未在火山确认的续费误算成已生效。
// （仅对仍带 credential_id 的旧结构执行；新结构由下方 v5 迁移重建）
{
  const cols = db.prepare("PRAGMA table_info(device_services)").all();
  if (cols.length > 0 && cols.some(c => c.name === 'credential_id')) {
    if (!cols.some(c => c.name === 'provider_expires_at')) {
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
}

// 迁移（顺序敏感，必须先于下方的补列/回填执行）：
// 移除 device_credentials 的 UNIQUE(product_id, hardware_id) 约束
// 同一个 MAC 可以对应多个 SN（1对多证书），需要去掉此唯一约束
// SQLite 不支持直接 DROP UNIQUE constraint，需要重建表。
// 重建全程在单个事务内执行（DDL 在 SQLite 中可回滚），中途崩溃/失败自动回滚到旧表。
//
// 顺序说明：若旧版迁移在 DROP 旧表后、RENAME 前被中断，遗留的临时表可能不含
// provision_request_id / provision_resumed 等新列（旧版迁移没有这些列）。
// 必须先用临时表换回主表，再统一补列和回填幂等映射；否则换回的主表会永远
// 缺失新列——补列在前面的旧顺序下只补到了启动时重建的空主表，恢复烧录时
// 写 provision_resumed 会因缺列直接失败。
{
  const hasHwidUniqueOn = (table) => {
    const idxs = db.prepare(`PRAGMA index_list('${table.replace(/'/g, "''")}')`).all();
    return idxs.some(idx => {
      if (idx.origin !== 'u') return false;
      const idxCols = db.prepare(`PRAGMA index_info('${idx.name.replace(/'/g, "''")}')`).all();
      const names = idxCols.map(c => c.name);
      return names.length === 2 && names.includes('product_id') && names.includes('hardware_id');
    });
  };

  const rebuildCredentialsTable = () => {
    const cols = db.prepare("PRAGMA table_info(device_credentials)").all();
    const colDefs = cols.map(c => {
      let def = `"${c.name}" ${c.type}`;
      if (c.pk) def += ' PRIMARY KEY';
      if (c.notnull && !c.pk) def += ' NOT NULL';
      if (c.dflt_value) {
        // datetime('now') 等表达式需要括号包裹
        const dv = c.dflt_value;
        if (dv.includes('(')) def += ` DEFAULT (${dv})`;
        else def += ` DEFAULT ${dv}`;
      }
      return def;
    });
    const colList = cols.map(c => `"${c.name}"`).join(', ');
    // PRAGMA foreign_keys 在事务内是 no-op，必须在事务外切换
    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        const countBefore = db.prepare("SELECT COUNT(*) AS n FROM device_credentials").get().n;
        db.exec(`
          CREATE TABLE device_credentials_new (
            ${colDefs.join(',\n')},
            UNIQUE(product_id, sn),
            FOREIGN KEY (product_id) REFERENCES products(id)
          );
          INSERT INTO device_credentials_new (${colList})
          SELECT ${colList} FROM device_credentials;
          DROP TABLE device_credentials;
          ALTER TABLE device_credentials_new RENAME TO device_credentials;
        `);
        const countAfter = db.prepare("SELECT COUNT(*) AS n FROM device_credentials").get().n;
        if (countAfter !== countBefore) {
          throw new Error(`device_credentials 迁移行数不一致: ${countBefore} -> ${countAfter}`);
        }
      })();
    } finally {
      db.pragma('foreign_keys = ON');
    }
  };

  const tableExists = (name) =>
    !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name);

  if (tableExists('device_credentials')) {
    // 1) 清理/恢复上次中断的迁移残留（仅旧版无事务保护的实现可能产生）
    if (tableExists('device_credentials_new')) {
      if (hasHwidUniqueOn('device_credentials')) {
        // 主表仍是旧结构：残留的临时表只是未完成的复制，丢弃后重新迁移
        db.exec('DROP TABLE device_credentials_new');
      } else {
        const mainCount = db.prepare("SELECT COUNT(*) AS n FROM device_credentials").get().n;
        const tempCount = db.prepare("SELECT COUNT(*) AS n FROM device_credentials_new").get().n;
        if (mainCount === 0 && tempCount > 0) {
          // 主表被开头的 CREATE TABLE IF NOT EXISTS 重建为空表，原数据都在临时表中：
          // 用临时表换回主表（旧版迁移在 DROP 之后、RENAME 之前被中断的场景）。
          // 换回的表可能缺新列，由后续补列迁移统一补齐
          db.pragma('foreign_keys = OFF');
          try {
            db.transaction(() => {
              db.exec('DROP TABLE device_credentials');
              db.exec('ALTER TABLE device_credentials_new RENAME TO device_credentials');
            })();
          } finally {
            db.pragma('foreign_keys = ON');
          }
        } else {
          db.exec('DROP TABLE device_credentials_new');
        }
      }
    }

    // 2) 执行迁移（单事务，失败整体回滚，下次启动重试）
    if (hasHwidUniqueOn('device_credentials')) {
      rebuildCredentialsTable();
    }

    // 3) 迁移后校验引用完整性（其他表引用 credential_id 的行都必须指向存在的凭证）
    const fkViolations = db.pragma('foreign_key_check');
    if (fkViolations && fkViolations.length > 0) {
      throw new Error('device_credentials 迁移后外键校验失败: ' + JSON.stringify(fkViolations));
    }
  }
}

// 迁移：device_credentials 加 provision_challenge / challenge_expires_at / failure_reason
// （在中断恢复/表重建之后执行：保证最终表结构完整，含恢复换入的旧结构临时表）
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
    if (!cols.some(c => c.name === 'provision_request_id')) {
      db.exec("ALTER TABLE device_credentials ADD COLUMN provision_request_id TEXT");
    }
    if (!cols.some(c => c.name === 'provision_resumed')) {
      db.exec("ALTER TABLE device_credentials ADD COLUMN provision_resumed INTEGER DEFAULT 0");
    }
    if (!cols.some(c => c.name === 'is_primary')) {
      db.exec("ALTER TABLE device_credentials ADD COLUMN is_primary INTEGER DEFAULT 0");
    }
    if (!cols.some(c => c.name === 'pending_primary')) {
      db.exec("ALTER TABLE device_credentials ADD COLUMN pending_primary INTEGER DEFAULT 0");
    }
    if (!cols.some(c => c.name === 'pending_version')) {
      db.exec("ALTER TABLE device_credentials ADD COLUMN pending_version INTEGER DEFAULT 0");
    }
  }
}

// 迁移：把历史遗留列 provision_request_id 里的映射回填到 provision_requests 表
// （mode 未知存 NULL，重放时跳过模式校验；后续代码只写映射表，不再写凭证列）
{
  const cols = db.prepare("PRAGMA table_info(device_credentials)").all();
  if (cols.length > 0 && cols.some(c => c.name === 'provision_request_id')) {
    db.exec(`
      INSERT OR IGNORE INTO provision_requests (request_id, product_id, hardware_id, sn, mode)
      SELECT provision_request_id, product_id, hardware_id, sn, NULL
      FROM device_credentials
      WHERE provision_request_id IS NOT NULL AND provision_request_id != ''
    `);
  }
}

// 迁移：provision_requests 补 factory_key 列（afff213 之前建的映射表没有此列；
// 旧映射无密钥存档，墓碑恢复密钥时跳过 NULL，退化为生成新密钥）
{
  const cols = db.prepare("PRAGMA table_info(provision_requests)").all();
  if (cols.length > 0 && !cols.some(c => c.name === 'factory_key')) {
    db.exec("ALTER TABLE provision_requests ADD COLUMN factory_key BLOB");
  }
}

// 迁移：从现存凭证回填 factory_key_archive（旧库升级时凭证存在但存档表为空）；
// 每个 MAC 取最早一条凭证的密钥（首次烧录的密钥即 eFuse 烧入的密钥）
{
  const archCols = db.prepare("PRAGMA table_info(factory_key_archive)").all();
  if (archCols.length > 0) {
    db.exec(`
      INSERT OR IGNORE INTO factory_key_archive (product_id, hardware_id, factory_key)
      SELECT product_id, hardware_id, factory_key
      FROM device_credentials
      WHERE id IN (
        SELECT MIN(id) FROM device_credentials GROUP BY product_id, hardware_id
      )
    `);
    // 同时从 provision_requests 有 factory_key 的映射补填（凭证已删但映射有密钥的情况）
    db.exec(`
      INSERT OR IGNORE INTO factory_key_archive (product_id, hardware_id, factory_key)
      SELECT product_id, hardware_id, factory_key
      FROM provision_requests
      WHERE factory_key IS NOT NULL AND rowid IN (
        SELECT MIN(rowid) FROM provision_requests
        WHERE factory_key IS NOT NULL
        GROUP BY product_id, hardware_id
      )
    `);
  }
}

// 迁移 v5：数据归属模型调整（绑定/服务期挂物理设备，火山权益按 SN 记录）
//   - user_device_bindings: credential_id → hardware_id（UNIQUE(product_id, hardware_id)）
//   - device_services:      credential_id → hardware_id，移除 provider_* 字段
//   - device_sn_rights（新表）: 原 device_services 的火山权益字段按 SN（credential_id）拆分
// 切换"下次上线 SN"从此只改选择，不搬绑定、不清权益。
//
// 同 MAC 冲突处理（旧库允许同 MAC 的不同 SN 各有绑定/服务记录，新模型每个 MAC 只有一条）：
//   - 不同用户（含跨表不一致，如绑定为用户甲、服务期为用户乙）
//     → 停止迁移并报告，绝不静默丢弃或替管理员决定归属；
//   - 同一用户  → 按明确规则合并：
//       服务期：start_at 取最早，expires_at 取最晚（不丢剩余权益），
//               plan 取到期最晚一条的 plan，created/updated 取最早/最晚；
//       绑定：  bound_at 取最早，last_seen_at 取最晚，nickname 取最近一条非空昵称。
{
  const tableCols = (name) => db.prepare(`PRAGMA table_info(${name})`).all().map(c => c.name);

  // 0) 迁移前冲突检查（跨表，位于两表重建之前）：同一物理设备的绑定与服务期必须归属同一用户。
  //    各表内部"同 MAC 不同用户"与跨表不一致（如绑定为用户甲、服务期为用户乙）
  //    都视为归属冲突——新模型每个 MAC 只有一条绑定和一条服务期，无法自动决定
  //    归属，必须停止迁移并报告，绝不静默丢弃或替管理员决定。
  //    注意：只要任一表仍待迁移就执行——上次迁移可能在两表之间中断（服务期已重建、
  //    绑定未重建），此时仍需单独核对绑定表的归属冲突。
  {
    const branches = [];
    if (tableCols('device_services').includes('credential_id')) {
      branches.push("SELECT c.product_id, c.hardware_id, s.user_id FROM device_services s JOIN device_credentials c ON s.credential_id = c.id");
    }
    if (tableCols('user_device_bindings').includes('credential_id')) {
      branches.push("SELECT c.product_id, c.hardware_id, b.user_id FROM user_device_bindings b JOIN device_credentials c ON b.credential_id = c.id");
    }
    if (branches.length > 0) {
      const conflicts = db.prepare(`
        SELECT product_id, hardware_id, GROUP_CONCAT(DISTINCT user_id) AS user_ids
        FROM (${branches.join(' UNION ')})
        GROUP BY product_id, hardware_id
        HAVING COUNT(DISTINCT user_id) > 1
      `).all();
      if (conflicts.length > 0) {
        const detail = conflicts
          .map(x => `产品${x.product_id}/${x.hardware_id} → 用户[${x.user_ids}]`).join('; ');
        throw new Error(
          '数据迁移中止（v5）：以下物理设备的绑定/服务期归属不同用户' +
          '（含跨表不一致，如绑定为用户甲、服务期为用户乙）。' +
          '新模型中绑定/服务期挂物理设备（每个 MAC 一条），无法自动决定归属，' +
          '已停止迁移且未修改任何数据。请先人工合并或删除冲突记录，再重启服务。冲突明细: ' + detail
        );
      }
    }
  }

  // 旧库：device_services 仍带 credential_id → 先回填权益表，再重建
  if (tableCols('device_services').includes('credential_id')) {
    // 1) 火山权益字段按 SN 回填到 device_sn_rights（每条旧服务记录对应一个凭证）
    db.exec(`
      INSERT OR IGNORE INTO device_sn_rights
        (credential_id, provider_renew_status, provider_renew_at, provider_renew_error, provider_license_id, provider_expires_at)
      SELECT credential_id, provider_renew_status, provider_renew_at, provider_renew_error, provider_license_id, provider_expires_at
      FROM device_services
    `);
    // 2) 重建 device_services（归属 hardware_id；同用户多条按上文规则显式合并）
    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        db.exec(`
          CREATE TABLE device_services_v5new (
            id INTEGER PRIMARY KEY,
            product_id INTEGER NOT NULL,
            hardware_id TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            start_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            plan TEXT DEFAULT 'annual',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            UNIQUE(product_id, hardware_id),
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
          );
          INSERT INTO device_services_v5new
            (id, product_id, hardware_id, user_id, start_at, expires_at, plan, created_at, updated_at)
          SELECT MIN(s.id), s.product_id, s.hardware_id, MIN(s.user_id),
                 MIN(s.start_at), MAX(s.expires_at),
                 (SELECT s2.plan FROM device_services s2 JOIN device_credentials c2 ON s2.credential_id = c2.id
                  WHERE c2.product_id = s.product_id AND c2.hardware_id = s.hardware_id
                  ORDER BY s2.expires_at DESC, s2.id ASC LIMIT 1),
                 MIN(s.created_at), MAX(s.updated_at)
          FROM (
            SELECT s.*, c.product_id, c.hardware_id
            FROM device_services s JOIN device_credentials c ON s.credential_id = c.id
          ) s
          GROUP BY s.product_id, s.hardware_id;
          DROP TABLE device_services;
          ALTER TABLE device_services_v5new RENAME TO device_services;
        `);
      })();
    } finally {
      db.pragma('foreign_keys = ON');
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_services_expires ON device_services(expires_at)");
    db.exec("CREATE INDEX IF NOT EXISTS idx_services_user ON device_services(user_id)");
  }

  // 旧库：user_device_bindings 仍带 credential_id → 重建为 hardware_id
  // （跨表/表内归属冲突已在上方合并检查中统一中止，此处直接按同用户规则合并）
  if (tableCols('user_device_bindings').includes('credential_id')) {
    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        db.exec(`
          CREATE TABLE user_device_bindings_v5new (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            hardware_id TEXT NOT NULL,
            nickname TEXT,
            bound_at TEXT DEFAULT (datetime('now')),
            last_seen_at TEXT,
            UNIQUE(product_id, hardware_id),
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
          );
          INSERT INTO user_device_bindings_v5new
            (id, user_id, product_id, hardware_id, nickname, bound_at, last_seen_at)
          SELECT MIN(b.id), MIN(b.user_id), b.product_id, b.hardware_id,
                 (SELECT b2.nickname FROM user_device_bindings b2 JOIN device_credentials c2 ON b2.credential_id = c2.id
                  WHERE c2.product_id = b.product_id AND c2.hardware_id = b.hardware_id
                  ORDER BY (b2.nickname IS NULL), b2.bound_at DESC, b2.id DESC LIMIT 1),
                 MIN(b.bound_at), MAX(b.last_seen_at)
          FROM (
            SELECT b.*, c.product_id, c.hardware_id
            FROM user_device_bindings b JOIN device_credentials c ON b.credential_id = c.id
          ) b
          GROUP BY b.product_id, b.hardware_id;
          DROP TABLE user_device_bindings;
          ALTER TABLE user_device_bindings_v5new RENAME TO user_device_bindings;
        `);
      })();
    } finally {
      db.pragma('foreign_keys = ON');
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_bindings_user ON user_device_bindings(user_id)");
  }
}

// 一致性修复（必须晚于所有补列迁移：较早旧库可能刚在本文件上方补出这些列）：
// 旧版本"作废"不清理指向指针，已作废 SN 若残留 pending_primary/is_primary 会被解析为
// "当前/下次"凭证（用户端展示与无 SN 激活都命中作废记录）。清零后解析回落到正常顺序
// （配合 resolveNoSnCredential / RESOLVED_CRED_JOIN 排除 retired 双保险）。幂等，每次启动执行。
db.exec(`
  UPDATE device_credentials SET pending_primary = 0 WHERE status = 'retired' AND pending_primary = 1;
  UPDATE device_credentials SET is_primary = 0 WHERE status = 'retired' AND is_primary = 1;
`);

// 服务期默认长度（年）
const SERVICE_DEFAULT_YEARS = 1;
// 默认年卡金额（分）—— 真实价格由产品/管理员配置，此处仅为占位
// 1 年 = 19.9 元 = 1990 分
const DEFAULT_ANNUAL_AMOUNT = 1990;

// ---- AES 加解密（ENC_KEY/KEY_BYTES 在文件开头、打开数据库之前已校验定义） ----

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
  // 烧录请求幂等映射 + FactoryKey 存档 + 出厂验证事实标记随产品一并清理：
  // 三表对 products 均有外键约束，不清理会阻塞产品删除
  return db.transaction(() => {
    db.prepare("DELETE FROM provision_requests WHERE product_id = ?").run(productId);
    db.prepare("DELETE FROM factory_key_archive WHERE product_id = ?").run(productId);
    db.prepare("DELETE FROM factory_verified_devices WHERE product_id = ?").run(productId);
    const r = db.prepare('DELETE FROM products WHERE id = ?').run(productId);
    return r.changes > 0;
  })();
}

// ==================== Device Credentials ====================
// 视为"已完成出厂"的凭证状态：重复 provision 返回 already_provisioned，不再发 FactoryKey
const PROVISION_DONE_STATES = ['provisioned', 'volcano_registered'];
// 视为"烧录进行中"的凭证状态：challenge 会话仍可恢复或上报失败
const PROVISION_IN_PROGRESS_STATES = ['provisioning', 'provisioning_failed'];

const findInProgressRecords = (records) =>
  records.filter(r => PROVISION_IN_PROGRESS_STATES.includes(r.status));

// 按产品 + SN 精确定位凭证；SN 存在但属于其他 MAC 时报 sn_hardware_mismatch
function locateBySn(productId, hardwareId, sn) {
  const cred = getCredentialBySn(productId, sn);
  if (!cred) throw new Error('device_not_found');
  if (cred.hardware_id !== hardwareId) throw new Error('sn_hardware_mismatch');
  return cred;
}

// 生成 10 分钟有效的新 challenge（显式恢复烧录会话；provision_resumed=1 标记会话已轮换）
function issueChallenge(credId) {
  const challenge = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  db.prepare(`
    UPDATE device_credentials
    SET provision_challenge = ?, challenge_expires_at = ?, status = 'provisioning', failure_reason = NULL,
        provision_resumed = 1
    WHERE id = ?
  `).run(challenge, expiresAt, credId);
  return challenge;
}

// 返回记录的当前烧录会话；challenge 仍有效时不轮换（同 request_id 重试的安全语义：
// 响应乱序/延迟重试都不会使工具已持有的会话失效），已过期才签发新会话。
// 仅适用于 status='provisioning' 的记录；provisioning_failed 由调用方显式返回失败状态
function currentSession(cred) {
  if (cred.status !== 'provisioning') {
    throw new Error(`currentSession 不适用于状态 ${cred.status}`);
  }
  const factoryKey = decrypt(cred.factory_key);
  if (cred.provision_challenge && cred.challenge_expires_at
      && new Date(cred.challenge_expires_at).getTime() > Date.now()) {
    return { sn: cred.sn, factoryKey, challenge: cred.provision_challenge };
  }
  return { sn: cred.sn, factoryKey, challenge: issueChallenge(cred.id) };
}

// ---- 烧录请求幂等映射（独立于凭证记录，恢复/轮换不会覆盖旧映射） ----
function getProvisionRequest(requestId) {
  return db.prepare("SELECT * FROM provision_requests WHERE request_id = ?").get(requestId);
}

function recordProvisionRequest(requestId, productId, hardwareId, snValue, mode, factoryKeyPlain) {
  if (!requestId) return;
  // 已存在同 ID 映射时保留原映射（查找阶段已做参数冲突校验，这里防并发竞态）；
  // factory_key 随映射存档：MAC 全部凭证被删后凭最新墓碑恢复共享密钥
  db.prepare(`
    INSERT OR IGNORE INTO provision_requests (request_id, product_id, hardware_id, sn, mode, factory_key)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(requestId, productId, hardwareId, snValue, mode, factoryKeyPlain ? encrypt(factoryKeyPlain) : null);
}

// 从该 MAC 的映射墓碑恢复共享 FactoryKey（凭证记录全删后仍能取回 eFuse 密钥）；
// 无任何存档（全新 MAC 或 afff213 之前的旧映射）返回 null
function recoverFactoryKeyFromTombstones(productId, hardwareId) {
  const row = db.prepare(`
    SELECT factory_key FROM provision_requests
    WHERE product_id = ? AND hardware_id = ? AND factory_key IS NOT NULL
    ORDER BY rowid DESC LIMIT 1
  `).get(productId, hardwareId);
  return row ? decrypt(row.factory_key) : null;
}

// ---- FactoryKey 统一存档（按 MAC 维度，独立于 request_id） ----
// 所有录入路径调用：首次烧录、new_sn、显式恢复、无 requestId 的旧版录入
// 删除凭证前确保密钥已存档；凭证全删后凭存档恢复（eFuse 只烧一次）
function archiveFactoryKey(productId, hardwareId, factoryKeyPlain) {
  if (!factoryKeyPlain) return;
  db.prepare(`
    INSERT INTO factory_key_archive (product_id, hardware_id, factory_key)
    VALUES (?, ?, ?)
    ON CONFLICT(product_id, hardware_id) DO UPDATE SET
      factory_key = excluded.factory_key,
      archived_at = datetime('now')
  `).run(productId, hardwareId, encrypt(factoryKeyPlain));
}

// 从存档恢复共享 FactoryKey；无存档返回 null
function recoverFactoryKeyFromArchive(productId, hardwareId) {
  const row = db.prepare(`
    SELECT factory_key FROM factory_key_archive
    WHERE product_id = ? AND hardware_id = ?
  `).get(productId, hardwareId);
  return row ? decrypt(row.factory_key) : null;
}

// 检查该 MAC 是否有历史记录（provision_requests 或凭证曾存在）：
// 有历史但密钥存档缺失时，不能当作全新设备生成随机密钥（会导致 eFuse 不一致）
function hasProvisionHistory(productId, hardwareId) {
  const reqRow = db.prepare(`
    SELECT 1 FROM provision_requests
    WHERE product_id = ? AND hardware_id = ? LIMIT 1
  `).get(productId, hardwareId);
  if (reqRow) return true;
  // factory_key_archive 有记录也算历史（迁移回填的旧库）
  const archRow = db.prepare(`
    SELECT 1 FROM factory_key_archive
    WHERE product_id = ? AND hardware_id = ? LIMIT 1
  `).get(productId, hardwareId);
  return !!archRow;
}

/**
 * 出厂录入阶段 1：服务器生成 SN + FactoryKey + challenge，status = provisioning
 * SN = sn_prefix + 6位零填充序号
 * FactoryKey = 32 字节随机 hex（同一 MAC 的所有 SN 共享同一个 FactoryKey，因为 eFuse 只烧一次）
 * challenge = 32 字节随机 hex，10 分钟过期
 *
 * 调用方式（保持与旧版兼容，新增 SN 必须显式请求并携带幂等键）：
 *  - requestId（可选，new_sn 必传）：请求幂等键。映射独立存于 provision_requests 表
 *    （一次操作一条，永久保留），恢复烧录不会覆盖旧映射——原请求延迟重放仍指向同一条
 *    记录。同一 requestId 携带不同参数（目标 SN / 模式 / 设备）时返回 request_id_conflict。
 *    重放返回记录当前状态：provisioning → 当前会话（challenge 不轮换，乱序安全）；
 *    provisioning_failed → session_failed（需显式恢复，不带该 requestId 重新调用）；
 *    已完成 → already_provisioned，不会重复创建 SN。
 *    challenge 轮换只属于显式恢复会话（不带 requestId 的 sn/普通调用）
 *  - newSn=true（多证书场景）：同一 MAC 新增一个 SN，复用 FactoryKey，每个 SN 在火山侧
 *    是独立设备（volcano_device_name 带 SN 后缀），License 各自独立。重试幂等由 requestId
 *    保证；新 requestId 才创建下一份 SN（进行中的旧记录需先删除再新增）
 *  - sn：只针对该 SN 的记录操作（显式恢复会话，轮换 challenge / already_provisioned）
 *  - 都不传（旧版语义）：按最近一条记录处理；provisioning/provisioning_failed → 恢复烧录；
 *    provisioned/volcano_registered → already_provisioned；retired → 拒绝；无记录 → 首次烧录
 *  - retired 语义：retired 停用单份证书；MAC 下全部证书均 retired 视为设备停用，拒绝新增
 */
function provisionDevice(productId, hardwareId, opts = {}) {
  const { sn, newSn, requestId } = opts;
  const product = getProductRow(productId);
  if (!product) throw new Error('产品不存在');

  const records = getCredentialsByHardwareId(productId, hardwareId);

  // 请求幂等：按映射表定位记录（恢复/轮换不覆盖映射，原请求重放仍指向同一记录）
  if (requestId) {
    const mode = newSn ? 'new_sn' : (sn ? 'sn' : 'plain');
    const mapped = getProvisionRequest(requestId);
    if (mapped) {
      // 同一 ID 携带不同操作参数 → 冲突（目标设备 / 目标 SN / 模式任一不同即拒绝）
      if (mapped.product_id !== productId || mapped.hardware_id !== hardwareId
          || (mapped.mode && mapped.mode !== mode)
          || (sn && sn !== mapped.sn)) {
        throw new Error('request_id_conflict');
      }
      const matched = getCredentialBySn(productId, mapped.sn);
      // 幂等映射永久保留（墓碑）：目标凭证已被删除时拒绝重放，不重新创建；
      // 工具需换新 request_id 重新发起（SN 序列不复用，新 ID 会得到新 SN）
      if (!matched) throw new Error('request_target_deleted');
      if (matched.status === 'retired') throw new Error('device_retired');
      if (PROVISION_DONE_STATES.includes(matched.status)) {
        return { already_provisioned: true, sn: matched.sn };
      }
      // 会话已失败：明确返回失败状态，不返回看似可继续验证的会话；
      // 恢复需显式调用（不带本 requestId），恢复后同 ID 重放才会回到正常会话分支
      if (matched.status === 'provisioning_failed') {
        return { session_failed: true, sn: matched.sn, status: 'provisioning_failed', failure_reason: matched.failure_reason };
      }
      return currentSession(matched);
    }
  }

  // 显式新增 SN（多证书）：幂等由 requestId 保证（重试命中上面的映射分支），新 requestId 才创建
  if (newSn) {
    // MAC 下全部证书 retired = 设备停用，拒绝新增（恢复退役证书由管理员单独操作）
    if (records.length > 0 && records.every(r => r.status === 'retired')) {
      throw new Error('device_retired');
    }
    // 共享 FactoryKey：优先取现存凭证；全部记录已删除时从存档恢复
    // （eFuse 只烧一次——生成新密钥会让已烧 eFuse 的设备永远无法通过验证）
    let factoryKey = null;
    if (records.length > 0) {
      factoryKey = decrypt(records[0].factory_key);
    } else {
      factoryKey = recoverFactoryKeyFromArchive(productId, hardwareId)
        || recoverFactoryKeyFromTombstones(productId, hardwareId);
      if (!factoryKey) {
        // 有历史记录但存档缺失：不能生成新密钥（eFuse 不一致），明确报错
        if (hasProvisionHistory(productId, hardwareId)) {
          throw new Error('factory_key_archive_missing');
        }
        factoryKey = crypto.randomBytes(32).toString('hex');
      }
    }
    const tx = db.transaction(() => {
      db.prepare("UPDATE products SET sn_seq = sn_seq + 1 WHERE id = ?").run(productId);
      const updated = getProductRow(productId);
      const newSnValue = `${updated.sn_prefix}${String(updated.sn_seq).padStart(6, '0')}`;
      const challenge = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const hwidClean = hardwareId.replace(/[^0-9A-Fa-f]/g, '').toLowerCase();
      // 每个 SN 在火山侧必须是独立设备，名字带 SN 后缀避免同名冲突
      const volcanoDeviceName = `${product.code}-${hwidClean}-${newSnValue}`;
      db.prepare(`
        INSERT INTO device_credentials (product_id, sn, hardware_id, factory_key, volcano_device_name, status, provision_challenge, challenge_expires_at)
        VALUES (?, ?, ?, ?, ?, 'provisioning', ?, ?)
      `).run(productId, newSnValue, hardwareId, encrypt(factoryKey), volcanoDeviceName, challenge, expiresAt);
      archiveFactoryKey(productId, hardwareId, factoryKey);
      recordProvisionRequest(requestId, productId, hardwareId, newSnValue, 'new_sn', factoryKey);
      return { sn: newSnValue, factoryKey, challenge };
    });
    return tx();
  }

  // 指定 SN：显式恢复该 SN 的烧录会话（轮换 challenge），映射独立追加，不覆盖旧映射
  if (sn) {
    const existing = locateBySn(productId, hardwareId, sn);
    if (PROVISION_DONE_STATES.includes(existing.status)) {
      return { already_provisioned: true, sn: existing.sn };
    }
    if (existing.status === 'retired') throw new Error('device_retired');
    const factoryKey = decrypt(existing.factory_key);
    const challenge = issueChallenge(existing.id);
    archiveFactoryKey(productId, hardwareId, factoryKey);
    recordProvisionRequest(requestId, productId, hardwareId, existing.sn, 'sn', factoryKey);
    return { sn: existing.sn, factoryKey, challenge };
  }

  // 未指定 SN：保持旧版重复录入语义，按最近一条记录处理（显式恢复，轮换 challenge）
  const latest = records.length > 0 ? records[records.length - 1] : null;
  if (latest) {
    if (PROVISION_DONE_STATES.includes(latest.status)) {
      return { already_provisioned: true, sn: latest.sn };
    }
    if (latest.status === 'retired') throw new Error('device_retired');
    const factoryKey = decrypt(latest.factory_key);
    const challenge = issueChallenge(latest.id);
    archiveFactoryKey(productId, hardwareId, factoryKey);
    recordProvisionRequest(requestId, productId, hardwareId, latest.sn, 'plain', factoryKey);
    return { sn: latest.sn, factoryKey, challenge };
  }

  // 首次烧录：生成 SN + FactoryKey
  // 凭证全删后重新录入（records 空）：从存档恢复共享密钥，不生成新密钥；
  // 有历史但存档缺失时明确报错（不能当作全新设备，eFuse 已烧旧密钥）
  let firstFactoryKey = recoverFactoryKeyFromArchive(productId, hardwareId)
    || recoverFactoryKeyFromTombstones(productId, hardwareId);
  if (!firstFactoryKey) {
    if (hasProvisionHistory(productId, hardwareId)) {
      throw new Error('factory_key_archive_missing');
    }
    firstFactoryKey = crypto.randomBytes(32).toString('hex');
  }
  const tx = db.transaction(() => {
    db.prepare("UPDATE products SET sn_seq = sn_seq + 1 WHERE id = ?").run(productId);
    const updated = getProductRow(productId);
    const firstSn = `${updated.sn_prefix}${String(updated.sn_seq).padStart(6, '0')}`;
    const challenge = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const hwidClean = hardwareId.replace(/[^0-9A-Fa-f]/g, '').toLowerCase();
    const volcanoDeviceName = `${product.code}-${hwidClean}-${firstSn}`;
    db.prepare(`
      INSERT INTO device_credentials (product_id, sn, hardware_id, factory_key, volcano_device_name, status, provision_challenge, challenge_expires_at)
      VALUES (?, ?, ?, ?, ?, 'provisioning', ?, ?)
    `).run(productId, firstSn, hardwareId, encrypt(firstFactoryKey), volcanoDeviceName, challenge, expiresAt);
    archiveFactoryKey(productId, hardwareId, firstFactoryKey);
    recordProvisionRequest(requestId, productId, hardwareId, firstSn, 'plain', firstFactoryKey);
    return { sn: firstSn, factoryKey: firstFactoryKey, challenge };
  });
  return tx();
}

/**
 * 出厂录入阶段 2：验证 eFuse HMAC challenge
 * 签名格式：v1|provision_verify|hardwareId|challenge
 * 验证成功 → status = provisioned，清除 challenge
 * 验证失败 → 抛错（不改 status，允许重试）
 *
 * 会话定位：challenge 是每条烧录记录独有的会话标识。
 *  - 传 sn：按 SN 精确定位
 *  - 不传 sn：按 challenge 精确定位（多个烧录会话并发时，延迟到达的验证
 *    不会误拿其他 SN 的记录比较 challenge）
 */
function verifyProvision(productId, hardwareId, challenge, responseHex, sn) {
  let cred;
  if (sn) {
    cred = locateBySn(productId, hardwareId, sn);
  } else {
    const records = getCredentialsByHardwareId(productId, hardwareId);
    if (records.length === 0) throw new Error('device_not_found');
    cred = records.find(r => r.provision_challenge === challenge) || null;
    if (!cred) {
      // challenge 不属于任何记录：无进行中会话且最近一条已完成 → 该会话早已验证过
      if (findInProgressRecords(records).length === 0) {
        const latest = records[records.length - 1];
        if (PROVISION_DONE_STATES.includes(latest.status)) throw new Error('already_provisioned');
      }
      throw new Error('challenge_mismatch');
    }
  }
  if (PROVISION_DONE_STATES.includes(cred.status)) throw new Error('already_provisioned');
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
  markFactoryVerified(cred.product_id, cred.hardware_id);
  return { sn: cred.sn, status: 'provisioned' };
}

/**
 * 标记烧录失败（仅记录，不改 provisioning 状态——网络断线不算失败）
 * 会话绑定（防止延迟/重复的失败上报误伤其他烧录会话）：
 *  - 带 challenge：按本次烧录会话精确定位，同时核对会话与状态。旧会话（已轮换/
 *    已完成，challenge 已更换或清除）的上报不再匹配，被拒绝
 *  - 带 sn（无 challenge）：按 SN 定位，但必须能安全归因——记录已处于失败态
 *    （重复上报无害）或处于从未轮换的首次烧录会话；轮换过的会话无法区分上报
 *    属于哪一轮，必须带 challenge
 *  - 都不带（旧工具兼容）：仅当该 MAC 只有一条记录且满足上述归因条件；
 *    多记录（多 SN 场景）一律拒绝，不能凭"唯一进行中"猜目标
 */
function failProvision(productId, hardwareId, reason, opts = {}) {
  const { sn, challenge } = opts;
  let cred;
  if (challenge) {
    const records = getCredentialsByHardwareId(productId, hardwareId);
    cred = records.find(r => r.provision_challenge === challenge) || null;
    if (!cred) throw new Error('challenge_mismatch');       // 旧会话/已完成会话的延迟上报
    if (sn && cred.sn !== sn) throw new Error('challenge_mismatch');
  } else {
    const records = getCredentialsByHardwareId(productId, hardwareId);
    if (records.length === 0) throw new Error('device_not_found');
    if (sn) {
      cred = records.find(r => r.sn === sn) || null;
      if (!cred) throw new Error('device_not_found');
    } else {
      if (records.length > 1) throw new Error('ambiguous_provision_target');
      const inProgress = findInProgressRecords(records);
      if (inProgress.length === 0) throw new Error('not_in_provisioning_state');
      cred = inProgress[0];
    }
    // 无 challenge 的归因校验：失败态可重复上报；首次烧录会话（未轮换）可直接归因；
    // 轮换过的进行中会话无法区分上报属于哪一轮，拒绝
    if (cred.status === 'provisioning' && cred.provision_resumed) {
      throw new Error('challenge_required');
    }
  }
  if (!PROVISION_IN_PROGRESS_STATES.includes(cred.status)) {
    throw new Error('not_in_provisioning_state');
  }
  db.prepare(`
    UPDATE device_credentials SET status = 'provisioning_failed', failure_reason = ? WHERE id = ?
  `).run(reason, cred.id);
  return { sn: cred.sn, status: 'provisioning_failed' };
}

/**
 * 删除设备凭证：按"是否曾激活"判断（见 getSnDeletability），服务端强制校验
 */
function deleteCredential(id) {
  const cred = getCredentialById(id);
  if (!cred) throw new Error('device_not_found');
  // 删除规则按"是否曾激活"判断（与后台 getSnDeletability 同口径，服务端强制校验）：
  //   曾激活（volcano_activated_at 非空）→ 记录永久保留（订单/权益历史挂靠），
  //     一律不删除；换回该 SN 走"下次使用"。
  //   未激活但被订单引用 → 不物理删除（保留订单历史），建议走"作废"（retired）。
  if (cred.volcano_activated_at) throw new Error('device_activated_no_delete');
  const orderCount = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE credential_id = ?").get(id).n;
  if (orderCount > 0) throw new Error('device_has_orders_void');
  // 订单的预留 SN 不能物理删除：删除会让订单失去"作废＋重新分配"的关联历史
  // （renew-订单号 的幂等墓碑仍在，重复确认也无法重建）。改走"作废并重新分配"。
  const resvOrder = db.prepare("SELECT id, order_no FROM orders WHERE reserved_credential_id = ?").get(id);
  if (resvOrder) throw new Error('order_reserved_sn');
  // 被"作废并重新分配"幂等历史引用（替代 SN / 被作废旧 SN）也不能删除：
  // 删除后 order_realloc_requests 的重放无法返回原结果（SN 解析为 NULL）
  const inReallocHistory = db.prepare(
    "SELECT 1 FROM order_realloc_requests WHERE reserved_credential_id = ? OR voided_credential_id = ?"
  ).get(id, id);
  if (inReallocHistory) throw new Error('device_in_realloc_history');

  // 绑定/服务期属于物理设备（hardware_id），不随单份凭证删除；
  // 烧录请求幂等映射永久保留（墓碑）：目标凭证删除后，旧 request_id 重放被拒绝
  // （request_target_deleted）而非重新创建。SN 序列单调递增，已删除的 SN 永不复用。
  // 删除前确保 FactoryKey 已存档：凭证全删后仍可从存档恢复共享密钥（eFuse 兼容）
  const factoryKeyPlain = decrypt(cred.factory_key);
  db.transaction(() => {
    archiveFactoryKey(cred.product_id, cred.hardware_id, factoryKeyPlain);
    db.prepare("DELETE FROM device_sn_rights WHERE credential_id = ?").run(id);
    db.prepare("DELETE FROM device_bind_tokens WHERE credential_id = ?").run(id);
    db.prepare("DELETE FROM device_credentials WHERE id = ?").run(id);
  })();
  return { ok: true };
}

// 后台 SN 删除/作废规则（服务端唯一裁决，前端照 can_delete/can_void 显示）：
//   从未激活（volcano_activated_at 为空）：
//     - 无订单引用 → 可物理删除（provisioned 预留后反悔 / 烧录中 / 失败 / 已作废残留）
//     - 有订单引用 → 只能"作废"（保留订单历史），作废后可预留替代 SN
//   曾激活 → 不删除不作废按钮（记录保留）；停用异常凭证放高级操作（退役）；
//     换回旧 SN 用"下次使用"，不需要恢复。
function getSnDeletability(cred) {
  if (cred.volcano_activated_at) {
    return {
      ever_activated: true, can_delete: false, can_void: false,
      delete_block_reason: '已激活的 SN 保留记录（订单/权益历史），不能删除；换回该 SN 请用"下次使用"',
    };
  }
  const orderCount = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE credential_id = ?").get(cred.id).n;
  if (orderCount > 0) {
    return {
      ever_activated: false, can_delete: false, can_void: cred.status !== 'retired',
      delete_block_reason: '该 SN 已关联订单，不能物理删除；建议"作废"以保留订单历史，再预留替代 SN',
    };
  }
  // 被订单作为"自动预留 SN"引用 → 不能物理删除（否则订单失去关联历史且幂等墓碑
  // 使重复确认无法重建）；用订单上的"作废并重新分配"换替代 SN
  const resv = db.prepare("SELECT order_no FROM orders WHERE reserved_credential_id = ?").get(cred.id);
  if (resv) {
    return {
      ever_activated: false, can_delete: false, can_void: cred.status !== 'retired',
      delete_block_reason: '该 SN 是订单「' + resv.order_no + '」预留的替代 SN，不能直接删除；请在订单上使用"作废并重新分配"',
    };
  }
  // 被"作废并重新分配"的幂等历史引用（作为该次分配的替代 SN 或被作废的旧 SN）：
  // 删除会让 order_realloc_requests 失去关联（重放无法返回原结果），保留为"已作废"
  const inHistory = db.prepare(`
    SELECT o.order_no FROM order_realloc_requests rr JOIN orders o ON o.id = rr.order_id
    WHERE rr.reserved_credential_id = ? OR rr.voided_credential_id = ? LIMIT 1
  `).get(cred.id, cred.id);
  if (inHistory) {
    return {
      ever_activated: false, can_delete: false, can_void: cred.status !== 'retired',
      delete_block_reason: '该 SN 是订单「' + inHistory.order_no + '」替代分配历史的关联记录，不能删除（保留后重放才能返回原结果）；状态已为"已作废"',
    };
  }
  return { ever_activated: false, can_delete: true, can_void: false, delete_block_reason: null };
}

function getCredentialByHardwareId(productId, hardwareId) {
  // 不带 SN 的身份解析：优先取"最近一次激活返回"的凭证（is_primary），
  // 未标记时回落到最早一条（与历史行为一致）
  return db.prepare("SELECT * FROM device_credentials WHERE product_id = ? AND hardware_id = ? ORDER BY is_primary DESC, id ASC LIMIT 1").get(productId, hardwareId);
}

function getCredentialsByHardwareId(productId, hardwareId) {
  return db.prepare("SELECT * FROM device_credentials WHERE product_id = ? AND hardware_id = ? ORDER BY id ASC").all(productId, hardwareId);
}

function getCredentialByHardwareIdAndSn(productId, hardwareId, sn) {
  return db.prepare("SELECT * FROM device_credentials WHERE product_id = ? AND hardware_id = ? AND sn = ?").get(productId, hardwareId, sn);
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
  // 火山 DynamicRegister 只返回 DeviceSecret / RTCAppID，不返回任何 License 信息
  // （见 volcano.js）。按业务规则"实际激活后一年、火山控制"：实际激活成功即视为
  // 获得一年 License，平台记录首次有效激活时间，到期按激活 +1 年推算（仅展示，
  // 标注来源为"激活推算"；火山将来有实际返回状态/到期数据时以实际结果为准）。
  // ON CONFLICT DO NOTHING：不覆盖已有权益（真实续期记录 / 切回旧 SN 均不重算一年）。
  db.prepare(`
    INSERT INTO device_sn_rights (credential_id, provider_renew_status, provider_expires_at)
    VALUES (?, 'completed', datetime('now', '+1 year'))
    ON CONFLICT(credential_id) DO NOTHING
  `).run(credId);
  // 火山注册成功同样证明该物理设备完成过出厂验证（激活以 FactoryKey 签名为前提）
  const hw = db.prepare("SELECT hardware_id FROM device_credentials WHERE id = ?").get(credId);
  if (hw) markFactoryVerified(productId, hw.hardware_id);
  return db.prepare("SELECT rtc_app_id FROM products WHERE id = ?").get(productId).rtc_app_id;
});

// 物理设备层"已完成出厂验证"的事实标记（product_id + hardware_id 维度，独立于任何 SN 记录）：
// 一旦写入即永久保留，删除 SN 记录不改变；预留新 SN 时以此为准，
// 密钥存档（factory_key_archive）只保管密钥，不等于验证成功。
function markFactoryVerified(productId, hardwareId) {
  db.prepare(`
    INSERT OR IGNORE INTO factory_verified_devices (product_id, hardware_id)
    VALUES (?, ?)
  `).run(productId, hardwareId);
}

// 列出某产品全部凭证（含绑定用户/服务期/权益汇总，供后台列表）
function listCredentials(productId) {
  // 绑定与服务期属于物理设备：按 product_id + hardware_id 关联（同一 MAC 各一条）
  return db.prepare(`
    SELECT c.*,
      (SELECT u.email IS NOT NULL FROM user_device_bindings b JOIN users u ON b.user_id = u.id
        WHERE b.product_id = c.product_id AND b.hardware_id = c.hardware_id) as bound_user_has_email,
      (SELECT u.phone FROM user_device_bindings b JOIN users u ON b.user_id = u.id
        WHERE b.product_id = c.product_id AND b.hardware_id = c.hardware_id) as bound_user_phone,
      (SELECT b.id FROM user_device_bindings b
        WHERE b.product_id = c.product_id AND b.hardware_id = c.hardware_id) as binding_id,
      (SELECT s.expires_at FROM device_services s
        WHERE s.product_id = c.product_id AND s.hardware_id = c.hardware_id) as service_expires_at,
      (SELECT s.plan FROM device_services s
        WHERE s.product_id = c.product_id AND s.hardware_id = c.hardware_id) as service_plan,
      r.provider_renew_status, r.provider_license_id, r.provider_expires_at
    FROM device_credentials c
    LEFT JOIN device_sn_rights r ON r.credential_id = c.id
    WHERE c.product_id = ?
    ORDER BY c.id DESC
  `).all(productId);
}

function setCredentialStatus(id, status) {
  const cred = getCredentialById(id);
  if (!cred) throw new Error('device_not_found');
  if (status === 'retired' && cred.status !== 'retired') {
    // 已激活的 SN 不能作废：正在使用的设备会激活失败且无法选回；
    // 需要替代 SN 时走"预留新 SN"（保留旧 SN），流程切换走"作废并重新分配"
    if (cred.volcano_activated_at) throw new Error('device_activated_no_void');
    // 清理指向指针：已作废的 SN 不能继续作为"下次上线（pending_primary）"的解析目标，
    // 否则用户端展示和设备无 SN 激活仍会解析到这份作废凭证
    db.prepare("UPDATE device_credentials SET pending_primary = 0, is_primary = 0 WHERE id = ?").run(id);
  }
  db.prepare("UPDATE device_credentials SET status = ? WHERE id = ?").run(status, id);
  // 达到验证完成状态（含从已验证状态退役/恢复）固化事实标记；
  // 从未验证过的记录直接退役不产生标记（退役 ≠ 验证成功，重启回填同口径）
  if (['provisioned', 'volcano_registered', 'retired'].includes(status)) {
    if (status !== 'retired' || ['provisioned', 'volcano_registered'].includes(cred.status)) {
      markFactoryVerified(cred.product_id, cred.hardware_id);
    }
  }
}

// ==================== SN 选择（物理设备多 SN） ====================
//
// 归属模型：
//   - MAC、FactoryKey、后台选定的 SN        → 物理设备
//   - 用户绑定、平台服务期                   → 物理设备（hardware_id）
//   - SN、火山设备名、DeviceSecret、注册状态 → 每份 SN 凭证（device_credentials）
//   - 火山 License ID、有效期、处理状态      → 对应 SN 的权益记录（device_sn_rights）
//   - 续费订单                               → 记录下单时针对的 SN（历史，不迁移）
//
// 管理员指定"下次上线使用的 SN"是纯选择操作：不搬绑定、不清权益、不受订单影响。
// 设备下次 activate（不带 SN）时返回所选 SN 的凭证：
//   - 已激活的 SN → 直接下发已保存的 DeviceSecret（recovered）；
//   - 待激活（provisioned）的 SN → 走首次火山注册后下发。
// 选择保持粘性，直到管理员改选；B 的续费任务始终绑定 B，切回 A 不影响它。

// 管理员指定下次上线使用的 SN：
//   - 目标必须是"待火山激活（provisioned）"或"已激活（volcano_registered）"，
//     烧录中/失败/已退役的不可选；
//   - 不做订单拦截、不做用户归属校验（绑定与服务期挂物理设备，切换不影响任何记录）。
function setPrimaryCredential(productId, hardwareId, credentialId) {
  const target = db.prepare(
    "SELECT * FROM device_credentials WHERE id = ? AND product_id = ? AND hardware_id = ?"
  ).get(credentialId, productId, hardwareId);
  if (!target) throw new Error('device_not_found');
  if (!['provisioned', 'volcano_registered'].includes(target.status)) {
    throw new Error('device_not_switchable');
  }
  db.transaction(() => {
    db.prepare("UPDATE device_credentials SET pending_primary = 0 WHERE product_id = ? AND hardware_id = ?").run(productId, hardwareId);
    db.prepare("UPDATE device_credentials SET pending_primary = 1 WHERE id = ?").run(credentialId);
  })();
  return db.prepare("SELECT * FROM device_credentials WHERE id = ?").get(credentialId);
}

// 不带 SN 的 activate 解析：后台选定的 SN 优先，否则最近激活返回的凭证（最早一条兜底）
function resolveNoSnCredential(productId, hardwareId) {
  // 排除已作废（retired）：没有任何可用 SN 时返回 undefined（激活/下单按
  // "未配置可用 SN" 拒绝），绝不拿作废记录兜底
  return db.prepare(`
    SELECT * FROM device_credentials
    WHERE product_id = ? AND hardware_id = ? AND status != 'retired'
    ORDER BY pending_primary DESC, is_primary DESC, id ASC
    LIMIT 1
  `).get(productId, hardwareId);
}

// 业务"当前生效凭证"（设备 status 接口用）：与验签用的凭证分离。
// 排除已作废（retired），按最近激活优先（is_primary）；刻意不按 pending_primary 优先——
// 管理员刚指定"下次上线"的新 SN 在设备激活前，status 仍按旧 SN 判断权益。
// 全部作废/不存在时返回 undefined（调用方按"暂无可用 SN"处理：禁止 AI、明确状态）。
function resolveActiveCredential(productId, hardwareId) {
  return db.prepare(`
    SELECT * FROM device_credentials
    WHERE product_id = ? AND hardware_id = ? AND status != 'retired'
    ORDER BY is_primary DESC, id ASC
    LIMIT 1
  `).get(productId, hardwareId);
}

// 设备激活成功后调用：记录"最近一次激活返回的 SN"（is_primary）。
// 后台选定（pending_primary）保持不变——管理员改选前，设备一直解析到选定的 SN。
function markActivated(productId, hardwareId, credId) {
  db.prepare(`
    UPDATE device_credentials
    SET is_primary = CASE WHEN id = ? THEN 1 ELSE 0 END
    WHERE product_id = ? AND hardware_id = ?
  `).run(credId, productId, hardwareId);
}

// 为已出厂设备预留新 SN（管理员操作，平台行为，不依赖火山、不重新烧录 eFuse）：
//   - 复用物理设备身份与共享 FactoryKey，不创建烧录 challenge（不是出厂烧录，不重烧 eFuse）；
//   - SN 初始状态 provisioned（待火山激活）；设备下次激活时走首次火山注册；
//   - 全新 MAC（无任何出厂记录）不支持预留，需先走出厂烧录。
// requestId 可选：同一次预留的重试（响应丢失后重放）返回同一个 SN，不重复生成。
//   - 命中已有映射：校验产品/MAC 一致后返回原 SN（reused=true）；
//     目标凭证已被删除则拒绝（墓碑语义，不重新创建）；
//   - 首次执行：写入 provision_requests（mode='reserve'）作为幂等映射。
function reserveSnForDevice(productId, hardwareId, requestId = null) {
  const product = getProductRow(productId);
  if (!product) throw new Error('产品不存在');
  // 幂等重放检查
  if (requestId) {
    const existing = db.prepare("SELECT * FROM provision_requests WHERE request_id = ?").get(requestId);
    if (existing) {
      if (existing.mode !== 'reserve' || existing.product_id !== productId || existing.hardware_id !== hardwareId) {
        throw new Error('request_id_conflict');
      }
      const cred = db.prepare("SELECT sn FROM device_credentials WHERE product_id = ? AND sn = ?").get(productId, existing.sn);
      if (!cred) throw new Error('request_target_deleted');
      return { sn: cred.sn, reused: true };
    }
  }
  const records = getCredentialsByHardwareId(productId, hardwareId);
  // MAC 下全部证书 retired = 设备停用，拒绝预留
  if (records.length > 0 && records.every(r => r.status === 'retired')) {
    throw new Error('device_retired');
  }
  // 必须完成过出厂验证：以物理设备层持久化的事实标记为准（factory_verified_devices）。
  // 删除 SN 记录不影响该事实；密钥存档只说明烧过密钥（录入即存档），不等于验证成功，
  // 所以"删掉烧录中/失败的记录再预留"绕不过该检查。
  // 从未有过任何记录的 MAC 仍按"设备不存在"报错，保持语义不变。
  if (!db.prepare("SELECT 1 FROM factory_verified_devices WHERE product_id = ? AND hardware_id = ?").get(productId, hardwareId)) {
    if (records.length === 0 && !hasProvisionHistory(productId, hardwareId)) {
      throw new Error('device_not_found');
    }
    throw new Error('factory_verify_incomplete');
  }
  // 共享 FactoryKey：优先取现存凭证；全部记录已删除时从存档恢复
  // （eFuse 只烧一次——生成新密钥会让已烧 eFuse 的设备永远无法通过验证）
  let factoryKey = null;
  if (records.length > 0) {
    factoryKey = decrypt(records[0].factory_key);
  } else {
    factoryKey = recoverFactoryKeyFromArchive(productId, hardwareId)
      || recoverFactoryKeyFromTombstones(productId, hardwareId);
    if (!factoryKey) {
      if (hasProvisionHistory(productId, hardwareId)) {
        throw new Error('factory_key_archive_missing');
      }
      throw new Error('device_not_found');
    }
  }
  const tx = db.transaction(() => {
    db.prepare("UPDATE products SET sn_seq = sn_seq + 1 WHERE id = ?").run(productId);
    const updated = getProductRow(productId);
    const snValue = `${updated.sn_prefix}${String(updated.sn_seq).padStart(6, '0')}`;
    const hwidClean = hardwareId.replace(/[^0-9A-Fa-f]/g, '').toLowerCase();
    // 每个 SN 在火山侧是独立设备，名字带 SN 后缀避免同名冲突
    const volcanoDeviceName = `${product.code}-${hwidClean}-${snValue}`;
    db.prepare(`
      INSERT INTO device_credentials (product_id, sn, hardware_id, factory_key, volcano_device_name, status)
      VALUES (?, ?, ?, ?, ?, 'provisioned')
    `).run(productId, snValue, hardwareId, encrypt(factoryKey), volcanoDeviceName);
    if (requestId) {
      db.prepare("INSERT INTO provision_requests (request_id, product_id, hardware_id, sn, mode) VALUES (?, ?, ?, ?, 'reserve')")
        .run(requestId, productId, hardwareId, snValue);
    }
    archiveFactoryKey(productId, hardwareId, factoryKey);
    return snValue;
  });
  return { sn: tx(), reused: false };
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

// 账号注销模型（软删除）：整个操作在事务内完成，失败整体回滚，不会出现
// "绑定已删、用户还在"的部分删除状态。
//   - 绑定随注销解除（绑定是用户与设备的关系）；设备、FactoryKey、各 SN、
//     服务期全部保留——不为通过外键删除设备权益。
//   - 订单历史保留（注销关联，审计追溯），服务期持有人保留为注销账号。
//   - phone/email 匿名化：释放原手机号供重新注册；password_hash 清空使
//     已注销账号不可再登录。deleted_at 是注销标记（登录/鉴权均拒绝）。
function deleteUser(id) {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!user) throw new Error('user_not_found');
  if (user.deleted_at) throw new Error('user_already_deleted');
  db.transaction(() => {
    db.prepare("DELETE FROM user_device_bindings WHERE user_id = ?").run(id);
    db.prepare(`
      UPDATE users
      SET deleted_at = datetime('now'), email = NULL, password_hash = '',
          phone = ?
      WHERE id = ?
    `).run('deleted-' + id, id);
  })();
  return { ok: true };
}

function setUserVerified(id) {
  db.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").run(id);
}

function setUserPlan(id, plan, expiresAt) {
  // 已废弃：套餐不再按用户。保留函数以免旧代码调用报错，但不再写 users.plan
  // 真实写入请走 setDeviceServicePlan(credentialId, plan, expiresAt)
  return { ok: true, deprecated: true };
}

// 设备级套餐：直接设置 device_services.plan 和 expires_at（服务期挂物理设备）
// 用于管理员手动调整设备服务期 / 套餐（如：补偿、补录、特殊情况授权）
// 接受任意一份 SN 凭证 id，按其物理设备身份定位服务期记录
function setDeviceServicePlan(credentialId, plan, expiresAt) {
  const cred = getCredentialById(credentialId);
  if (!cred) throw new Error('device_not_found');
  const svc = getServiceByHardware(cred.product_id, cred.hardware_id);
  if (!svc) throw new Error('service_not_found');
  db.prepare(`
    UPDATE device_services
    SET plan = ?, expires_at = ?, updated_at = datetime('now')
    WHERE product_id = ? AND hardware_id = ?
  `).run(plan, expiresAt, cred.product_id, cred.hardware_id);
  return getServiceByHardware(cred.product_id, cred.hardware_id);
}

// ==================== User-Device Bindings ====================
// 绑定属于物理设备（product_id + hardware_id），与具体 SN 无关：
// 后台切换"下次上线 SN"不需要搬迁绑定。

// 同一 MAC 展示用凭证：后台选定（pending_primary）> 最近激活（is_primary）> 最早一条；
// 排除已作废（retired）——全部作废时 rc 为 NULL，调用方按"未配置可用 SN"展示
// outerAlias：外层表的别名（绑定表用 b，服务期表用 s）
const RESOLVED_CRED_JOIN = (outerAlias = 'b') => `
  LEFT JOIN device_credentials rc ON rc.id = (
    SELECT c.id FROM device_credentials c
    WHERE c.product_id = ${outerAlias}.product_id AND c.hardware_id = ${outerAlias}.hardware_id
      AND c.status != 'retired'
    ORDER BY c.pending_primary DESC, c.is_primary DESC, c.id ASC LIMIT 1
  )`;

function createBinding(userId, productId, hardwareId, nickname) {
  db.prepare(`
    INSERT INTO user_device_bindings (user_id, product_id, hardware_id, nickname)
    VALUES (?, ?, ?, ?)
  `).run(userId, productId, hardwareId, nickname || null);
  return db.prepare("SELECT * FROM user_device_bindings WHERE product_id = ? AND hardware_id = ?").get(productId, hardwareId);
}

function getBindingByHardware(productId, hardwareId) {
  return db.prepare("SELECT * FROM user_device_bindings WHERE product_id = ? AND hardware_id = ?").get(productId, hardwareId);
}

function getBindingById(id) {
  return db.prepare("SELECT * FROM user_device_bindings WHERE id = ?").get(id);
}

function listBindingsByUser(userId) {
  return db.prepare(`
    SELECT
      b.*,
      rc.id AS credential_id, rc.sn, rc.status AS cred_status,
      s.plan AS service_plan,
      s.expires_at AS service_expires_at,
      r.provider_renew_status
    FROM user_device_bindings b
    LEFT JOIN device_services s ON s.product_id = b.product_id AND s.hardware_id = b.hardware_id
    ${RESOLVED_CRED_JOIN('b')}
    LEFT JOIN device_sn_rights r ON r.credential_id = rc.id
    WHERE b.user_id = ?
    ORDER BY b.id DESC
  `).all(userId);
}

function listAllBindings(productId) {
  // 不返回 user_email，避免泄露；只返回手机号 + 是否已填邮箱
  return db.prepare(`
    SELECT b.*, u.phone AS user_phone, u.email IS NOT NULL AS user_has_email,
      rc.id AS credential_id, rc.sn, rc.volcano_device_name
    FROM user_device_bindings b
    JOIN users u ON b.user_id = u.id
    ${RESOLVED_CRED_JOIN('b')}
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
// 服务期属于物理设备（product_id + hardware_id）：切换 SN 不搬迁、不清空。
// 首次绑定时创建第一年服务期；续费在 expires_at 上累加。
// 火山权益（License ID / 有效期 / 处理状态）按 SN 记录在 device_sn_rights，
// 由 getSnRights / setSnRenewStatus 读写，与本表无关。

function createServiceForDevice(userId, productId, hardwareId, plan = 'annual', years = SERVICE_DEFAULT_YEARS) {
  const now = new Date();
  const startAt = now.toISOString();
  const exp = new Date(now.getTime() + years * 365 * 24 * 60 * 60 * 1000);
  db.prepare(`
    INSERT INTO device_services (user_id, product_id, hardware_id, start_at, expires_at, plan)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(product_id, hardware_id) DO UPDATE SET
      user_id = excluded.user_id,
      plan = excluded.plan,
      updated_at = datetime('now')
  `).run(userId, productId, hardwareId, startAt, exp.toISOString(), plan);
  return getServiceByHardware(productId, hardwareId);
}

function getServiceByHardware(productId, hardwareId) {
  return db.prepare("SELECT * FROM device_services WHERE product_id = ? AND hardware_id = ?").get(productId, hardwareId);
}

// 续费：在当前 expires_at 基础上累加 years 年（只延长平台服务期，不碰火山权益）
// 若已过期，则从 now 开始计算（避免续费叠加过期时间）
function extendService(productId, hardwareId, userId, years = 1) {
  const svc = getServiceByHardware(productId, hardwareId);
  if (!svc) throw new Error('service_not_found');
  const now = Date.now();
  const currentExp = new Date(svc.expires_at).getTime();
  const base = currentExp > now ? currentExp : now;
  const newExp = new Date(base + years * 365 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    UPDATE device_services
    SET expires_at = ?, user_id = ?, updated_at = datetime('now')
    WHERE product_id = ? AND hardware_id = ?
  `).run(newExp, userId, productId, hardwareId);
  return getServiceByHardware(productId, hardwareId);
}

// ==================== SN 火山权益（device_sn_rights） ====================
// License 属于具体 SN 的火山设备，不随切换转移。

function getSnRights(credentialId) {
  return db.prepare("SELECT * FROM device_sn_rights WHERE credential_id = ?").get(credentialId);
}

// upsert：目标 SN 尚无权益记录时先创建（如订单针对尚未激活过的 SN）
function setSnRenewStatus(credentialId, status, { error = null, licenseId = null, providerExpiresAt = null } = {}) {
  db.prepare(`
    INSERT INTO device_sn_rights (credential_id, provider_renew_status, provider_renew_error, provider_license_id, provider_expires_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(credential_id) DO UPDATE SET
      provider_renew_status = excluded.provider_renew_status,
      provider_renew_error = excluded.provider_renew_error,
      provider_license_id = COALESCE(?, provider_license_id),
      provider_expires_at = COALESCE(?, provider_expires_at),
      updated_at = datetime('now')
  `).run(credentialId, status, error, licenseId, providerExpiresAt, licenseId, providerExpiresAt);
}

function listServicesByProduct(productId) {
  return db.prepare(`
    SELECT s.*, rc.sn, rc.volcano_device_name,
      u.phone AS user_phone, u.email IS NOT NULL AS user_has_email,
      u.deleted_at IS NOT NULL AS user_deleted
    FROM device_services s
    LEFT JOIN users u ON s.user_id = u.id
    ${RESOLVED_CRED_JOIN('s')}
    WHERE s.product_id = ?
    ORDER BY s.expires_at DESC
  `).all(productId);
}

function listServicesByUser(userId) {
  return db.prepare(`
    SELECT s.*, rc.sn, rc.volcano_device_name, rc.status AS cred_status
    FROM device_services s
    ${RESOLVED_CRED_JOIN('s')}
    WHERE s.user_id = ?
    ORDER BY s.expires_at DESC
  `).all(userId);
}

// 列出需要后台处理续期的 SN（pending 状态）
function listSnRightsPendingRenew() {
  return db.prepare(`
    SELECT r.*, c.sn, c.volcano_device_name, p.code AS product_code,
           p.instance_id, p.product_key, p.product_secret
    FROM device_sn_rights r
    JOIN device_credentials c ON r.credential_id = c.id
    JOIN products p ON c.product_id = p.id
    WHERE r.provider_renew_status = 'pending'
  `).all().map(r => ({ ...r, product_secret: r.product_secret ? decrypt(r.product_secret) : null }));
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

// 确认收款（原子事务）：标记已付款 → 延长 MAC 平台服务期 → 自动预留新 SN → 订单关联新 SN。
//   - 整体一个事务，任一步失败全部回滚（不会出现已收款但没延长/没预留的中间态）。
//   - 订单 ID 作为幂等依据：request_id = 'renew-' + order_no，重复确认返回同一个
//     预留 SN，不重复延长服务期、不重复生成 SN。
//   - 自动生成不代表切走当前 SN：新 SN 仅"待激活"，仍由管理员手动选"下次使用"；
//     新 SN 激活失败时旧 SN/旧 License/绑定/服务期原样保留，可随时选回。
//   - 旧"给原 SN 购买 License 续期"任务（尚未开始，pending/failed）标记 superseded：
//     新 SN 激活自带一年 License，两套续期流程不得对同一订单重复执行（后台轮询只认
//     pending，会跳过 superseded）。
//   - 已付款订单的重放是纯只读幂等：不补 SN、不改续期状态。补预留/重新分配是独立的
//     管理操作（见 reallocateOrderReservedSn），不归收款接口承担。订单以 renew_mode
//     标记流程版本（'new_sn' = 新流程；NULL = 旧流程），已完成续期的旧订单重放不追加权益。
const confirmOrderPaid = db.transaction((orderId) => {
  const order = getOrderById(orderId);
  if (!order) throw new Error('order_not_found');
  const orderCred = getCredentialById(order.credential_id);
  if (!orderCred) throw new Error('order_credential_missing');

  if (order.status === 'paid') {
    // 只读重放：无论 renew_mode 与续期状态如何，都不再产生任何写入
    const prev = order.reserved_credential_id ? getCredentialById(order.reserved_credential_id) : null;
    return { order, reserved_sn: prev ? prev.sn : null, reused: true };
  }
  if (order.status !== 'pending') throw new Error('order_not_pending');
  // 旧流程的续期任务正在火山处理中：不能靠改状态"假装取消"后改走新 SN 流程，
  // 等任务终态（completed/failed）后再由管理员决定重试或改用新 SN
  if (order.provider_renew_status === 'processing') throw new Error('renew_task_processing');

  markOrderPaid(orderId);
  extendService(orderCred.product_id, orderCred.hardware_id, order.user_id, order.years);
  const reserved = reserveSnForDevice(orderCred.product_id, orderCred.hardware_id, 'renew-' + order.order_no);
  const reservedCred = db.prepare("SELECT id FROM device_credentials WHERE product_id = ? AND sn = ?")
    .get(orderCred.product_id, reserved.sn);
  db.prepare("UPDATE orders SET reserved_credential_id = ?, renew_mode = 'new_sn' WHERE id = ?")
    .run(reservedCred.id, orderId);
  setOrderRenewStatus(orderId, 'superseded');
  return { order: getOrderById(orderId), reserved_sn: reserved.sn, reused: reserved.reused };
});

// 订单预留 SN 的"作废并重新分配"（独立管理操作，不属于收款确认；仅限新流程订单）。
//   - 当前预留 SN 置为 retired（作废终态，凭证记录保留），旧关联写入 reserved_history；
//   - 用独立幂等键（request_id，由管理端每次操作生成，如 UUID）预留替代 SN 并更新订单关联；
//   - 幂等记录绑定订单（order_realloc_requests）：重放只返回该次操作的原结果，
//     绝不修改当前关联（延迟重放不能把订单指回已作废的旧 SN）；
//   - request_id 全局唯一：复用烧录/其他订单/其他设备的映射一律拒绝；
//   - 已激活的 SN 绝不能作废（正在使用的设备会激活失败且无法选回），明确拒绝；
//   - 旧流程订单不支持：转新流程有独立规则，不得绕过续期任务状态检查。
const reallocateOrderReservedSn = db.transaction((orderId, requestId) => {
  const order = getOrderById(orderId);
  if (!order) throw new Error('order_not_found');
  if (order.status !== 'paid') throw new Error('order_not_paid');
  if (order.renew_mode !== 'new_sn') throw new Error('order_not_new_sn_flow');
  if (order.provider_renew_status === 'processing') throw new Error('renew_task_processing');
  if (typeof requestId !== 'string' || !requestId.trim()) throw new Error('missing_request_id');
  if (requestId.trim().length > 128) throw new Error('invalid_request_id');
  const rid = requestId.trim();

  const orderCred = getCredentialById(order.credential_id);
  if (!orderCred) throw new Error('order_credential_missing');

  // 幂等重放：request_id 必须属于本订单。只返回该次操作的原结果，不做任何写入。
  const prior = db.prepare("SELECT * FROM order_realloc_requests WHERE request_id = ?").get(rid);
  if (prior) {
    if (prior.order_id !== orderId) throw new Error('request_id_mismatch');
    const getSn = (cid) => { const row = db.prepare("SELECT sn FROM device_credentials WHERE id = ?").get(cid); return row ? row.sn : null; };
    return {
      order,
      reserved_sn: getSn(prior.reserved_credential_id),
      reused: true,
      voided_sn: prior.voided_credential_id ? getSn(prior.voided_credential_id) : null,
    };
  }
  // request_id 全局唯一：烧录/预留/其他订单已占用的映射一律拒绝，
  // 防止 reserveSnForDevice 按既有映射返回其他设备的 SN 并被关联到本订单
  if (db.prepare("SELECT 1 FROM provision_requests WHERE request_id = ?").get(rid)) {
    throw new Error('request_id_conflict');
  }

  // 作废当前预留（若存在）：已激活的 SN 明确拒绝（不绕过"已激活不得作废"规则；
  // 需要新增备选时走独立预留，保留旧 SN）。已被通用"作废"置 retired 的补记历史。
  // 统一走 setCredentialStatus：作废同时清理该 SN 上的 pending_primary/is_primary
  // 选择标记（否则"选中 B → 重新分配为 C"后仍会解析到已作废的 B），同一事务内完成。
  let voided = null;
  if (order.reserved_credential_id) {
    const cur = getCredentialById(order.reserved_credential_id);
    if (cur) {
      if (cur.volcano_activated_at) throw new Error('reserved_sn_activated');
      if (cur.status !== 'retired') {
        setCredentialStatus(cur.id, 'retired');
      }
      voided = { credential_id: cur.id, sn: cur.sn, voided_at: new Date().toISOString() };
      const history = JSON.parse(order.reserved_history || '[]');
      history.push(voided);
      db.prepare("UPDATE orders SET reserved_history = ? WHERE id = ?").run(JSON.stringify(history), orderId);
    }
    db.prepare("UPDATE orders SET reserved_credential_id = NULL WHERE id = ?").run(orderId);
  }

  const r = reserveSnForDevice(orderCred.product_id, orderCred.hardware_id, rid);
  const reservedCred = db.prepare("SELECT id FROM device_credentials WHERE product_id = ? AND sn = ?")
    .get(orderCred.product_id, r.sn);
  db.prepare("UPDATE orders SET reserved_credential_id = ?, renew_mode = 'new_sn' WHERE id = ?")
    .run(reservedCred.id, orderId);
  db.prepare("INSERT INTO order_realloc_requests (request_id, order_id, reserved_credential_id, voided_credential_id) VALUES (?, ?, ?, ?)")
    .run(rid, orderId, reservedCred.id, voided ? voided.credential_id : null);
  return { order: getOrderById(orderId), reserved_sn: r.sn, reused: r.reused, voided_sn: voided ? voided.sn : null };
});

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
//       device_sn_rights（该 SN 当前正在使用的 License / 有效期 / 状态）
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
  // device_sn_rights.provider_expires_at 记录"该 SN 当前正在使用的 License"有效期
  const rights = getSnRights(order0.credential_id);
  const currentProviderExpiry = rights && rights.provider_expires_at && new Date(rights.provider_expires_at).getTime();
  const providerBase = Number.isFinite(currentProviderExpiry) && currentProviderExpiry > Date.now()
    ? currentProviderExpiry : Date.now();
  const providerExpiresAt = new Date(
    providerBase + order0.years * 365 * 24 * 60 * 60 * 1000
  ).toISOString();
  setSnRenewStatus(order0.credential_id, 'completed', {
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

// 删除订单：仅允许删除 pending 状态的订单（已付款订单已产生服务期延长，不能直接删）
function deleteOrder(id) {
  const order = getOrderById(id);
  if (!order) throw new Error('order_not_found');
  if (order.status !== 'pending') throw new Error('order_not_deletable');
  db.prepare("DELETE FROM orders WHERE id = ?").run(id);
  return { ok: true };
}

// 管理员删除订单：
//  - pending / cancelled 可删（未产生任何效果）
//  - 已付款且续期未完成（pending/processing/failed）禁止物理删除：
//    删除后后台扫描不到该订单，续期完成入口、失败重试和 License 审计记录全部丢失
//  - 有"作废并重新分配"幂等历史（order_realloc_requests 引用）禁止物理删除：
//    删除后重放无法返回原结果、替代历史丢失；此类订单一律保留为审计记录
function adminDeleteOrder(id) {
  const order = getOrderById(id);
  if (!order) throw new Error('order_not_found');
  if (order.status === 'paid' && ['pending', 'processing', 'failed'].includes(order.provider_renew_status)) {
    throw new Error('order_renew_incomplete');
  }
  const reallocHistory = db.prepare("SELECT 1 FROM order_realloc_requests WHERE order_id = ?").get(id);
  if (reallocHistory) throw new Error('order_has_realloc_history');
  db.prepare("DELETE FROM orders WHERE id = ?").run(id);
  return { ok: true };
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
    SELECT o.*, u.phone as user_phone, u.deleted_at IS NOT NULL AS user_deleted,
           c.sn, c.volcano_device_name, r.sn AS reserved_sn,
           EXISTS(SELECT 1 FROM order_realloc_requests rr WHERE rr.order_id = o.id) AS has_realloc_history
    FROM orders o
    JOIN users u ON o.user_id = u.id
    JOIN device_credentials c ON o.credential_id = c.id
    LEFT JOIN device_credentials r ON o.reserved_credential_id = r.id
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
  getSnDeletability,
  setPrimaryCredential,
  resolveNoSnCredential,
  resolveActiveCredential,
  markActivated,
  reserveSnForDevice,
  deleteUser,
  getCredentialByHardwareId,
  getCredentialsByHardwareId,
  getCredentialByHardwareIdAndSn,
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
  setDeviceServicePlan,
  // bindings
  createBinding,
  getBindingByHardware,
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
  // device services（物理设备维度）
  createServiceForDevice,
  getServiceByHardware,
  extendService,
  listServicesByProduct,
  listServicesByUser,
  // SN 火山权益（device_sn_rights）
  getSnRights,
  setSnRenewStatus,
  listSnRightsPendingRenew,
  // orders
  createOrder,
  getOrderById,
  getOrderByNo,
  markOrderPaid,
  confirmOrderPaid,
  reallocateOrderReservedSn,
  attachVoucher,
  setOrderRenewStatus,
  claimOrderForRenew,
  retryOrderRenew,
  completeOrderRenew,
  deleteOrder,
  adminDeleteOrder,
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
