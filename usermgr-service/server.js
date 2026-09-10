// Device Center 服务 v4
// 核心变更（对照 pro 文档优化建议）：
//   ① /provision 只收 hardware_id，SN 和 FactoryKey 由服务器生成
//   ② /device/activate 用 HardwareID + timestamp + nonce + HMAC 签名，不依赖 SN
//   ③ 签名串固定为 "v1|activate|hardware_id|timestamp|nonce"
//   ④ 二维码只放 temp_token，不再放 SN
//   ⑤ device_name 统一改名 nickname
//   ⑥ /device/bind/poll 增加 HMAC 认证
//   ⑦ 新增 /device/status，设备开火山会话前必须先问平台是否已绑定
//   ⑧ nonce 防重放
// v4 新增（设备服务期 + 订单 + 续费，对照 pro 文档阶段 6.5/9）：
//   ⑨ 绑定成功自动创建首年服务期（device_services）
//   ⑩ /device/status 增加 service_status + ai_allowed 字段
//   ⑪ 续费订单：创建/查询/模拟支付
//   ⑫ 后台轮询：paid && provider_renew_status=pending → 调火山 License 续期
//   ⑬ 管理员订单/服务期查看 + 手动确认收款
require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const DB = require('./db');
const volcano = require('./volcano');
const captcha = require('./captcha');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3031;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const PROVISION_TOKEN = process.env.PROVISION_TOKEN;
const VOLCANO_ENABLED = process.env.VOLCANO_ENABLED === 'true';
const ALLOWED_DRIFT_MS = 5 * 60 * 1000;  // ±5 分钟时间窗

// 局域网控制使用与设备固件约定的稳定 mDNS 名称。
// 只接受 12 位十六进制 HardwareID，或 6 组由冒号/短横线分隔的字节；
// 不能用“删除所有非十六进制字符”的宽松方式，避免脏数据被静默转换成可访问地址。
function deriveLocalHostname(hardwareId) {
  if (typeof hardwareId !== 'string') return null;
  const raw = hardwareId.trim();
  if (!/^(?:[0-9a-fA-F]{12}|[0-9a-fA-F]{2}(?:[:-][0-9a-fA-F]{2}){5})$/.test(raw)) {
    return null;
  }
  const compact = raw.replace(/[:-]/g, '').toLowerCase();
  return `xiaov-${compact}.local`;
}

// ==================== Rate Limiter（内存滑动窗口） ====================
// 防 SMS 轰炸 + 密码暴力。单实例够用；多实例需换 Redis。
const rateBuckets = new Map();  // key -> { count, resetAt }
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const b = rateBuckets.get(key);
  if (!b || b.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= max) return false;
  b.count++;
  return true;
}
function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket.remoteAddress || 'unknown';
}
// 定期清理过期 bucket，防内存泄漏
const _cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [k, b] of rateBuckets) if (b.resetAt <= now) rateBuckets.delete(k);
}, 5 * 60 * 1000);
if (_cleanupTimer.unref) _cleanupTimer.unref();

// ==================== SMS 配置（阿里云） ====================
// 敏感配置只从环境变量读取，绝不写进代码/仓库；真实值在服务器 .env 里填
// 开通入口：https://dysms.console.aliyun.com/
// 所需字段：SMS_ACCESS_KEY_ID / SMS_ACCESS_KEY_SECRET / SMS_SIGN_NAME / SMS_TEMPLATE_CODE
const SMS_CONFIG = {
  accessKeyId:     process.env.SMS_ACCESS_KEY_ID     || '',
  accessKeySecret: process.env.SMS_ACCESS_KEY_SECRET || '',
  signName:         process.env.SMS_SIGN_NAME         || '',
  templateCode:     process.env.SMS_TEMPLATE_CODE     || '',
  endpoint:         process.env.SMS_ENDPOINT          || 'dysmsapi.aliyuncs.com',
};
// 4 个必填字段都有值才视为已启用；任一缺失走 dev 模式（不发送，回传 dev_code 供联调）
const SMS_ENABLED = !!(SMS_CONFIG.accessKeyId && SMS_CONFIG.accessKeySecret && SMS_CONFIG.signName && SMS_CONFIG.templateCode);

// 阿里云短信 — 原生 HTTP 调用（RPC 签名 V1.0），不依赖 SDK
 const https = require('https');

function pctEncode(str) {
  return encodeURIComponent(String(str))
    .replace(/!/g, '%2B')
    .replace(/\*/g, '%2A')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29');
}

async function sendSms(phone, code) {
  if (SMS_ENABLED) {
    const params = {
      PhoneNumbers:  phone,
      SignName:      SMS_CONFIG.signName,
      TemplateCode:  SMS_CONFIG.templateCode,
      TemplateParam: JSON.stringify({ code, time: '5' }),
      Action:        'SendSms',
      Version:       '2017-05-25',
      Format:        'JSON',
      RegionId:      'cn-hangzhou',
      AccessKeyId:   SMS_CONFIG.accessKeyId,
      SignatureMethod:   'HMAC-SHA1',
      SignatureVersion:  '1.0',
      SignatureNonce:    crypto.randomUUID(),
      Timestamp:         new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    };
    // 计算签名
    const sortedKeys = Object.keys(params).sort();
    const canonicalQuery = sortedKeys.map(k => `${pctEncode(k)}=${pctEncode(params[k])}`).join('&');
    const stringToSign = 'GET&' + pctEncode('/') + '&' + pctEncode(canonicalQuery);
    const signature = crypto.createHmac('sha1', SMS_CONFIG.accessKeySecret + '&').update(stringToSign).digest('base64');
    params.Signature = signature;

    const finalQuery = Object.entries(params).map(([k, v]) => `${pctEncode(k)}=${pctEncode(v)}`).join('&');
    const url = `https://${SMS_CONFIG.endpoint}/?${finalQuery}`;

    await new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const body = JSON.parse(data);
            if (body.Code !== 'OK') {
              console.error(`[sms] 发送失败: ${body.Code} ${body.Message}`);
              reject(new Error(`短信发送失败: ${body.Message || body.Code}`));
              return;
            }
            console.log(`[sms] 已发送至 ${phone} (bizId=${body.BizId})`);
            resolve();
          } catch (e) {
            console.error(`[sms] 响应解析失败: ${data}`);
            reject(new Error('短信服务响应异常'));
          }
        });
      }).on('error', (e) => {
        console.error(`[sms] 网络错误: ${e.message}`);
        reject(new Error('短信服务网络错误'));
      });
    });
  } else {
    console.log(`[sms:dev] ${phone} -> ${code}  (配置 SMS_ACCESS_KEY_ID 等环境变量后启用真实发送)`);
  }
}

// ==================== 中间件 ====================
function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${ADMIN_PASSWORD}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

function provisionAuth(req, res, next) {
  const auth = req.headers.authorization;
  const adminAllowed = auth === `Bearer ${ADMIN_PASSWORD}`;
  const provisionAllowed = !!PROVISION_TOKEN && auth === `Bearer ${PROVISION_TOKEN}`;
  if (!adminAllowed && !provisionAllowed) return res.status(401).json({ error: 'unauthorized' });
  next();
}

function userAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'no_token' });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    // 已注销账号即使 token 未过期也立即失效
    const u = DB.getUserById(req.user.uid);
    if (!u || u.deleted_at) return res.status(401).json({ error: 'invalid_token' });
    const productId = DB.getProductIdByCode(req.params.product);
    if (!productId) return res.status(404).json({ error: 'product_not_found' });
    if (req.user.pid !== productId) return res.status(403).json({ error: 'product_mismatch' });
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

// ==================== 签名工具 ====================
// 签名版本：
//   v1（旧固件）：v1|{action}|hardware_id|timestamp|nonce —— 不含 sn
//   v2（多 SN 固件）：v2|{action}|hardware_id|sn|timestamp|nonce —— sn 参与签名
// 规则：请求带 sn 字段时必须使用 v2 签名（防止 sn 被篡改后签名仍成立）；
//       不带 sn 的请求仍按 v1 校验，旧固件完全兼容。
function buildSignString(action, hardwareId, timestamp, nonce, sn) {
  return sn
    ? `v2|${action}|${hardwareId}|${sn}|${timestamp}|${nonce}`
    : `v1|${action}|${hardwareId}|${timestamp}|${nonce}`;
}

function verifySignature(action, factoryKey, hardwareId, timestamp, nonce, signatureB64, sn) {
  const ts = Number(timestamp);
  if (!ts || isNaN(ts)) return { ok: false, reason: 'bad_timestamp' };
  const now = Date.now();
  if (Math.abs(now - ts) > ALLOWED_DRIFT_MS) return { ok: false, reason: 'timestamp_out_of_window' };

  if (!nonce || nonce.length < 8) return { ok: false, reason: 'bad_nonce' };
  if (DB.isNonceUsed(nonce)) return { ok: false, reason: 'nonce_reused' };

  const expected = buildSignString(action, hardwareId, ts, nonce, sn);
  // FactoryKey is persisted as 64 hex characters, while ESP32 HMAC_UP uses
  // the represented 32 raw bytes as its key.
  const expectedSig = crypto.createHmac('sha256', Buffer.from(factoryKey, 'hex')).update(expected).digest();
  let got;
  try {
    got = Buffer.from(signatureB64, 'base64');
  } catch (e) {
    return { ok: false, reason: 'bad_signature_format' };
  }
  if (expectedSig.length !== got.length) return { ok: false, reason: 'signature_mismatch' };
  if (!crypto.timingSafeEqual(expectedSig, got)) return { ok: false, reason: 'signature_mismatch' };

  DB.recordNonce(nonce);
  return { ok: true };
}

// ==================== 管理员：产品管理 ====================
app.get('/admin/api/products', adminAuth, (req, res) => {
  res.json(DB.listProducts());
});

app.patch('/admin/api/products/:id', adminAuth, (req, res) => {
  const id = Number(req.params.id);
  DB.updateProductVolcanoConfig(id, req.body);
  res.json({ ok: true });
});

// 创建新产品（首次部署时使用）
app.post('/admin/api/products', adminAuth, (req, res) => {
  const { code, name, sn_prefix, instance_id, product_key, product_secret, bot_id } = req.body || {};
  // 必填：code + name + sn_prefix；火山相关字段均可后补
  if (!code || !/^[a-z][a-z0-9_]{1,30}$/.test(code)) {
    return res.status(400).json({ error: 'invalid_code', message: '产品代码必须小写字母开头，字母数字下划线，2-30 字符' });
  }
  if (!name) return res.status(400).json({ error: 'missing_name', message: '产品名称必填' });
  if (!sn_prefix) return res.status(400).json({ error: 'missing_sn_prefix', message: 'SN 前缀必填' });
  try {
    const p = DB.createProduct({
      code, name,
      sn_prefix,
      instance_id: instance_id || '',
      product_key: product_key || '',
      product_secret: product_secret || '',
      bot_id: bot_id || '',
    });
    res.json({ ok: true, product: p });
  } catch (e) {
    if (e.message === 'code_exists') return res.status(409).json({ error: 'code_exists', message: '产品代码已存在' });
    res.status(500).json({ error: 'create_failed', message: e.message });
  }
});

// 删除产品（危险：通常不该调用；用于产品配置写错的紧急修正）
app.delete('/admin/api/products/:id', adminAuth, (req, res) => {
  const id = Number(req.params.id);
  const ok = DB.deleteProduct(id);
  if (!ok) return res.status(400).json({ error: 'delete_failed' });
  res.json({ ok: true });
});

// ==================== 管理员：出厂录入 ====================
// 改动①：只收 product + hardware_id，SN 和 FactoryKey 由服务器生成
// 可选参数：
//   sn          —— 只针对该 SN 的记录操作（恢复烧录），与 new_sn 互斥
//   new_sn      —— 同一 MAC 显式新增一个 SN（多证书场景），只接受严格布尔值，必须携带 request_id
//   request_id  —— 请求幂等键（一次烧录操作一个 ID）。同一 ID 重试返回同一 SN 和
//                  同一会话（challenge 不轮换）；记录完成后重放返回 already_provisioned
// 不传可选参数时行为与旧版完全一致：重复录入返回原 SN 或 already_provisioned
app.post('/admin/api/provision', provisionAuth, (req, res) => {
  const { product, hardware_id, sn, new_sn, request_id } = req.body;
  if (!product || !hardware_id) return res.status(400).json({ error: 'missing_params' });
  // new_sn 只接受布尔值："false"/"0"/"true" 等字符串一律拒绝，避免真值字符串误触发新增
  if (new_sn !== undefined && typeof new_sn !== 'boolean') {
    return res.status(400).json({ error: 'invalid_new_sn', message: 'new_sn 只接受布尔值' });
  }
  // sn 与 new_sn 互斥：同时指定时操作目标不明确
  if (new_sn === true && sn) {
    return res.status(400).json({ error: 'conflicting_params', message: 'sn 与 new_sn 不能同时指定' });
  }
  // request_id：烧录请求幂等键，非空字符串 ≤128 字符
  let requestId = null;
  if (request_id !== undefined && request_id !== null && request_id !== '') {
    if (typeof request_id !== 'string' || request_id.length > 128) {
      return res.status(400).json({ error: 'invalid_request_id', message: 'request_id 必须是 ≤128 字符的字符串' });
    }
    requestId = request_id.trim();
    if (!requestId) {
      return res.status(400).json({ error: 'invalid_request_id', message: 'request_id 不能为空白' });
    }
  }
  // new_sn 必须携带 request_id：重试拿同一 SN，不产生重复凭证
  if (new_sn === true && !requestId) {
    return res.status(400).json({ error: 'missing_request_id', message: 'new_sn 必须携带 request_id（烧录工具为本次操作生成的幂等键，重试复用同一 ID）' });
  }

  const productId = DB.getProductIdByCode(product);
  if (!productId) return res.status(404).json({ error: 'product_not_found' });

  try {
    const result = DB.provisionDevice(productId, hardware_id, { sn, newSn: new_sn === true, requestId });
    if (result.already_provisioned) {
      return res.json({ ok: true, already_provisioned: true, sn: result.sn });
    }
    if (result.session_failed) {
      // 该 request_id 对应的烧录会话已失败：明确告知，不返回看似可继续验证的会话。
      // 恢复方式：不带该 request_id 重新调用 provision（可换新 request_id）
      return res.json({
        ok: true,
        session_failed: true,
        sn: result.sn,
        status: result.status,
        failure_reason: result.failure_reason,
        message: '该烧录会话已失败，请显式恢复后重试（重新调用 provision，勿复用已失败的 request_id）',
      });
    }
    res.json({ ok: true, sn: result.sn, factory_key: result.factoryKey, challenge: result.challenge });
  } catch (e) {
    if (e.message === 'device_retired') return res.status(403).json({ error: 'device_retired' });
    if (e.message === 'device_not_found') return res.status(404).json({ error: 'device_not_found' });
    if (e.message === 'request_target_deleted') return res.status(404).json({ error: 'request_target_deleted', message: '该 request_id 对应的凭证已被删除，请使用新的 request_id 重新发起' });
    if (e.message === 'sn_hardware_mismatch') return res.status(400).json({ error: 'sn_hardware_mismatch' });
    if (e.message === 'request_id_conflict') return res.status(409).json({ error: 'request_id_conflict', message: '该 request_id 已绑定其他烧录操作（目标设备/SN/模式不同）' });
    if (e.message === 'factory_key_archive_missing') return res.status(409).json({ error: 'factory_key_archive_missing', message: '该设备有烧录历史但 FactoryKey 存档缺失，无法安全恢复密钥。请联系管理员检查密钥备份' });
    res.status(500).json({ error: 'provision_failed', reason: e.message });
  }
});

// 阶段 2：验证 eFuse HMAC challenge
app.post('/admin/api/provision/verify', provisionAuth, (req, res) => {
  const { product, hardware_id, challenge, response, sn } = req.body;
  if (!product || !hardware_id || !challenge || !response) {
    return res.status(400).json({ error: 'missing_params' });
  }
  const productId = DB.getProductIdByCode(product);
  if (!productId) return res.status(404).json({ error: 'product_not_found' });

  try {
    const result = DB.verifyProvision(productId, hardware_id, challenge, response, sn);
    res.json({ ok: true, sn: result.sn, status: result.status });
  } catch (e) {
    const code = e.message;
    if (code === 'device_not_found') return res.status(404).json({ error: code });
    if (code === 'sn_hardware_mismatch') return res.status(400).json({ error: code });
    if (code === 'already_provisioned') return res.status(409).json({ error: code });
    if (code === 'not_in_provisioning_state') return res.status(409).json({ error: code });
    if (code === 'challenge_expired' || code === 'challenge_mismatch') return res.status(410).json({ error: code });
    if (code === 'hmac_mismatch' || code === 'bad_response_format') return res.status(401).json({ error: code });
    res.status(500).json({ error: 'verify_failed', reason: code });
  }
});

// 标记烧录失败（推荐携带本次 provision 返回的 challenge 做会话绑定，防止延迟上报误伤其他会话）
app.post('/admin/api/provision/fail', provisionAuth, (req, res) => {
  const { product, hardware_id, reason, sn, challenge } = req.body;
  if (!product || !hardware_id) return res.status(400).json({ error: 'missing_params' });
  const productId = DB.getProductIdByCode(product);
  if (!productId) return res.status(404).json({ error: 'product_not_found' });

  try {
    const result = DB.failProvision(productId, hardware_id, reason || 'unknown', { sn, challenge });
    res.json({ ok: true, sn: result.sn, status: result.status });
  } catch (e) {
    if (e.message === 'device_not_found') return res.status(404).json({ error: e.message });
    if (e.message === 'sn_hardware_mismatch') return res.status(400).json({ error: 'sn_hardware_mismatch' });
    if (e.message === 'not_in_provisioning_state') return res.status(409).json({ error: e.message });
    if (e.message === 'ambiguous_provision_target') return res.status(400).json({ error: 'ambiguous_provision_target', message: '该设备存在多份凭证记录，失败上报必须携带本次烧录返回的 challenge' });
    if (e.message === 'challenge_required') return res.status(400).json({ error: 'challenge_required', message: '会话已被恢复轮换，失败上报必须携带本次烧录返回的 challenge' });
    if (e.message === 'challenge_mismatch') return res.status(410).json({ error: 'challenge_mismatch', message: 'challenge 不属于当前烧录会话（旧会话的延迟上报）' });
    res.status(500).json({ error: 'fail_failed', reason: e.message });
  }
});

// ==================== 管理员：设备凭证/用户/绑定查询 ====================
app.get('/admin/api/credentials', adminAuth, (req, res) => {
  const productId = DB.getProductIdByCode(req.query.product);
  if (!productId) return res.status(404).json({ error: 'product_not_found' });
  const rows = DB.listCredentials(productId).map(c => {
    const del = DB.getSnDeletability(c);
    return {
      id: c.id,
      sn: c.sn,
      hardware_id: c.hardware_id,
      volcano_device_name: c.volcano_device_name,
      status: c.status,
      failure_reason: c.failure_reason,
      volcano_activated: !!c.volcano_device_secret,
      volcano_activated_at: c.volcano_activated_at,
      // is_primary = 最近一次激活返回的 SN；primary_pending = 后台选定的"下次上线 SN"
      is_primary: !!c.is_primary,
      primary_pending: !!c.pending_primary,
      bound_user_phone: c.bound_user_phone,
      bound_user_has_email: !!c.bound_user_has_email,
      binding_id: c.binding_id,
      service_plan: c.service_plan,
      service_expires_at: c.service_expires_at,
      provider_renew_status: c.provider_renew_status,
      provider_license_id: c.provider_license_id,
      provider_expires_at: c.provider_expires_at,
      // 删除/作废规则（服务端唯一裁决，前端照此显示）：
      ever_activated: del.ever_activated,
      can_delete: del.can_delete,
      can_void: del.can_void,
      delete_block_reason: del.delete_block_reason,
      created_at: c.created_at,
    };
  });
  res.json(rows);
});

// 删除设备凭证：按"是否曾激活"判断（见 getSnDeletability），服务端强制校验
app.delete('/admin/api/credentials/:id', adminAuth, (req, res) => {
  try {
    DB.deleteCredential(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    console.error('[admin:delete-credential] 删除失败:', e.message);
    const code = e.message;
    if (code === 'device_not_found') return res.status(404).json({ error: code, message: 'SN 记录不存在' });
    if (code === 'device_activated_no_delete') return res.status(409).json({ error: code, message: '已激活的 SN 保留记录（订单/权益历史），不能删除；换回该 SN 请用"下次使用"' });
    if (code === 'device_has_orders_void') return res.status(409).json({ error: code, message: '该 SN 已关联订单，不能物理删除；请使用"作废"保留订单历史，再预留替代 SN' });
    if (code === 'order_reserved_sn') return res.status(409).json({ error: code, message: '该 SN 是订单预留的替代 SN，不能直接删除；请在订单列表对该订单使用"作废并重新分配"' });
    if (code === 'device_in_realloc_history') return res.status(409).json({ error: code, message: '该 SN 是订单"作废并重新分配"历史的关联记录，不能删除；状态保留为"已作废"（重放幂等需要它返回原结果）' });
    res.status(500).json({ error: 'delete_failed', reason: code, message: '删除失败：' + code });
  }
});

// 指定"下次上线使用的 SN"（管理员选择，设备无感知）：
//   - 目标可以是"待火山激活（provisioned）"或"已激活（volcano_registered）"的 SN；
//   - 纯选择操作：不搬绑定、不清权益、不受订单影响；
//   - 设备下次不带 SN 激活时返回所选 SN 的凭证（新 SN 走首次注册，旧 SN 返回已存密钥）。
// 选择保持粘性直到管理员改选；不再需要"立即转正"——首次激活是设备上线后的操作。
app.patch('/admin/api/credentials/:id/primary', adminAuth, (req, res) => {
  try {
    const cred = DB.getCredentialById(Number(req.params.id));
    if (!cred) return res.status(404).json({ error: 'device_not_found' });
    DB.setPrimaryCredential(cred.product_id, cred.hardware_id, cred.id);
    res.json({ ok: true, sn: cred.sn, selected: true });
  } catch (e) {
    const code = e.message;
    if (code === 'device_not_found') return res.status(404).json({ error: code });
    if (code === 'device_not_switchable') return res.status(409).json({ error: code, message: '仅"待火山激活"或"已激活"的 SN 可指定为下次上线使用' });
    res.status(500).json({ error: 'set_primary_failed', reason: code });
  }
});

// 为已有设备预留新 SN（管理员操作，平台行为，不依赖火山）：
//   - 复用物理设备身份与共享 FactoryKey，不创建烧录 challenge（不重新烧 eFuse）；
//   - SN 初始状态 provisioned（待火山激活），设备下次激活时走首次火山注册；
//   - 全新 MAC（无任何出厂记录）不支持预留，需先走出厂烧录；
//   - 必须完成过出厂验证；request_id 幂等：同一次预留重试返回同一个 SN。
app.post('/admin/api/devices/reserve-sn', adminAuth, (req, res) => {
  const productId = DB.getProductIdByCode((req.body || {}).product);
  const hardwareId = (req.body || {}).hardware_id;
  const requestId = (req.body || {}).request_id ? String(req.body.request_id).trim() : null;
  if (!productId || !hardwareId) return res.status(400).json({ error: 'missing_params' });
  try {
    const result = DB.reserveSnForDevice(productId, String(hardwareId).trim(), requestId);
    res.json({ ok: true, sn: result.sn, reused: result.reused });
  } catch (e) {
    const code = e.message;
    if (code === '产品不存在' || code === 'device_not_found') return res.status(404).json({ error: 'device_not_found' });
    if (code === 'device_retired') return res.status(409).json({ error: code, message: '该设备已停用，不能预留新 SN' });
    if (code === 'factory_verify_incomplete') return res.status(409).json({ error: code, message: '该设备尚未完成出厂验证（烧录未完成），不能预留新 SN' });
    if (code === 'factory_key_archive_missing') return res.status(409).json({ error: code, message: 'FactoryKey 存档缺失，无法为已烧录设备预留新 SN' });
    if (code === 'request_id_conflict') return res.status(409).json({ error: code, message: 'request_id 已被其他预留/烧录操作使用，请更换后重试' });
    if (code === 'request_target_deleted') return res.status(409).json({ error: code, message: '该次预留对应的 SN 已被删除，重放被拒（请换用新的 request_id）' });
    console.error('[admin:reserve-sn] 预留失败:', code);
    res.status(500).json({ error: 'reserve_failed', reason: code, message: '预留失败：' + code });
  }
});

// 火山权益按"实际激活后一年、火山控制"自动记录（saveVolcanoCredentials）：
// 不再需要管理员手工确认关卡；火山将来有实际返回状态时以实际结果为准。
app.get('/admin/api/users', adminAuth, (req, res) => {
  const productId = DB.getProductIdByCode(req.query.product);
  if (!productId) return res.status(404).json({ error: 'product_not_found' });
  // 后台不返回 email，避免泄露；只返回 has_email 标记。deleted_at = 注销标记
  const rows = DB.listUsersByProduct(productId).map(u => ({
    id: u.id, product_id: u.product_id, phone: u.phone,
    has_email: !!u.email,
    email_verified: u.email_verified,
    created_at: u.created_at,
    device_count: u.device_count,
    deleted: !!u.deleted_at,
    deleted_at: u.deleted_at || null,
  }));
  res.json(rows);
});

// 删除用户 = 账号注销（软删除，事务内完成）：绑定解除，设备/服务期/订单审计保留
app.delete('/admin/api/users/:id', adminAuth, (req, res) => {
  try {
    DB.deleteUser(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    console.error('[admin:delete-user] 注销失败:', e.message);
    if (e.message === 'user_not_found') return res.status(404).json({ error: e.message, message: '用户不存在' });
    if (e.message === 'user_already_deleted') return res.status(409).json({ error: e.message, message: '该账号已注销，请勿重复操作' });
    res.status(500).json({ error: 'delete_failed', reason: e.message, message: '注销失败：' + e.message });
  }
});

app.get('/admin/api/bindings', adminAuth, (req, res) => {
  const productId = DB.getProductIdByCode(req.query.product);
  if (!productId) return res.status(404).json({ error: 'product_not_found' });
  res.json(DB.listAllBindings(productId));
});

// 管理员强制解绑：只删 user_device_bindings，不影响 device_credentials / 火山设备
app.delete('/admin/api/bindings/:id', adminAuth, (req, res) => {
  const b = DB.getBindingById(Number(req.params.id));
  if (!b) return res.status(404).json({ error: 'not_found' });
  DB.deleteBinding(b.id);
  res.json({ ok: true });
});

// 设备级套餐：管理员手动调整 device_services.plan / expires_at
// 用于补偿、补录、特殊情况授权等场景
app.patch('/admin/api/credentials/:id/service', adminAuth, (req, res) => {
  const id = Number(req.params.id);
  const { plan, expires_at } = req.body || {};
  if (!plan || !expires_at) return res.status(400).json({ error: 'missing_params' });
  try {
    const svc = DB.setDeviceServicePlan(id, plan, expires_at);
    res.json({ ok: true, service: svc });
  } catch (e) {
    if (e.message === 'service_not_found') return res.status(404).json({ error: e.message });
    res.status(500).json({ error: 'update_failed', reason: e.message });
  }
});

app.patch('/admin/api/credentials/:id/status', adminAuth, (req, res) => {
  try {
    DB.setCredentialStatus(Number(req.params.id), req.body.status);
    res.json({ ok: true });
  } catch (e) {
    console.error('[admin:set-credential-status] 失败:', e.message);
    if (e.message === 'device_not_found') return res.status(404).json({ error: e.message, message: 'SN 记录不存在' });
    if (e.message === 'device_activated_no_void') return res.status(409).json({ error: e.message, message: '已激活的 SN 不能作废：正在使用的设备会激活失败且无法选回；需要替代 SN 请用"预留新 SN"（保留旧 SN）' });
    res.status(500).json({ error: 'status_update_failed', reason: e.message, message: '状态更新失败：' + e.message });
  }
});

// ==================== 管理员：订单/服务期（v4 ⑬） ====================
app.get('/admin/api/orders', adminAuth, (req, res) => {
  const productId = DB.getProductIdByCode(req.query.product);
  if (!productId) return res.status(404).json({ error: 'product_not_found' });
  res.json(DB.listAllOrders(productId));
});

app.get('/admin/api/services', adminAuth, (req, res) => {
  const productId = DB.getProductIdByCode(req.query.product);
  if (!productId) return res.status(404).json({ error: 'product_not_found' });
  res.json(DB.listServicesByProduct(productId));
});

// 管理员手动确认收款（线下支付场景）：原子事务（整体提交/回滚）——
// 标记已付款 + 延长 MAC 平台服务期 + 自动预留新 SN + 订单关联新 SN。
// 订单 ID 幂等：重复确认返回同一个预留 SN，不重复延长服务期。
// 旧"给原 SN 购买 License"续期任务标记 superseded（新 SN 激活自带一年，两套流程不重复执行）。
// 自动预留不切走当前 SN：管理员仍手动选择"下次使用"，可随时选回。
app.patch('/admin/api/orders/:id/mark-paid', adminAuth, (req, res) => {
  try {
    const result = DB.confirmOrderPaid(Number(req.params.id));
    // 服务期可能不存在（重放的旧订单设备未绑定过）：不因展示字段崩溃
    const oc = DB.getCredentialById(result.order.credential_id);
    const svc = oc && DB.getServiceByHardware(oc.product_id, oc.hardware_id);
    res.json({
      ok: true,
      status: 'paid',
      provider_renew_status: result.order.provider_renew_status,
      reserved_sn: result.reserved_sn,
      reserved_reused: result.reused,
      service_expires_at: svc ? svc.expires_at : null,
    });
  } catch (e) {
    console.error('[admin:mark-paid] 确认收款失败:', e.message);
    const code = e.message;
    if (code === 'order_not_found') return res.status(404).json({ error: code, message: '订单不存在' });
    if (code === 'order_credential_missing') return res.status(409).json({ error: code, message: '订单对应的 SN 凭证已被删除，无法确认收款（服务期延长与预留被整体回滚）' });
    if (code === 'order_not_pending') return res.status(409).json({ error: code, message: '订单当前状态不允许确认收款（已取消或已处理）' });
    if (code === 'renew_task_processing') return res.status(409).json({ error: code, message: '该订单的旧续期任务正在火山处理中，不能改走新 SN 流程；请等任务出结果后再操作' });
    if (code === 'service_not_found') return res.status(409).json({ error: code, message: '该设备没有平台服务期记录，无法延长（请先核对绑定流程）' });
    if (code === 'factory_verify_incomplete') return res.status(409).json({ error: code, message: '该设备尚未完成出厂验证，无法预留新 SN（收款未确认，请先处理设备记录）' });
    res.status(500).json({ error: 'mark_paid_failed', reason: code, message: '确认收款失败：' + code });
  }
});

// 管理员对订单预留 SN 的"作废并重新分配"（独立于收款确认）：
// 当前预留 SN 作废（retired，记录与订单历史保留，写入 reserved_history），
// 用独立幂等键预留替代 SN。同一 request_id 重放返回同一替代 SN，不重复作废/生成。
// 已付款订单的"再次确认收款"永远只读幂等，不会补 SN——补配只能走这里。
app.post('/admin/api/orders/:id/reallocate-sn', adminAuth, (req, res) => {
  const requestId = req.body ? req.body.request_id : undefined;
  try {
    const result = DB.reallocateOrderReservedSn(Number(req.params.id), requestId);
    res.json({
      ok: true,
      reserved_sn: result.reserved_sn,
      reserved_reused: result.reused,
      voided_sn: result.voided_sn,
      reserved_history: JSON.parse(result.order.reserved_history || '[]'),
    });
  } catch (e) {
    console.error('[admin:reallocate-sn] 重新分配失败:', e.message);
    const code = e.message;
    if (code === 'order_not_found') return res.status(404).json({ error: code, message: '订单不存在' });
    if (code === 'order_not_paid') return res.status(409).json({ error: code, message: '只有已确认收款的订单才能重新分配预留 SN' });
    if (code === 'order_not_new_sn_flow') return res.status(409).json({ error: code, message: '旧流程订单不支持"作废并重新分配"；改走新 SN 流程需使用独立的转换规则' });
    if (code === 'renew_task_processing') return res.status(409).json({ error: code, message: '该订单续期任务正在处理中，不能重新分配预留 SN' });
    if (code === 'order_credential_missing') return res.status(409).json({ error: code, message: '订单对应的 SN 凭证已被删除，无法重新分配' });
    if (code === 'missing_request_id') return res.status(400).json({ error: code, message: '缺少 request_id（管理端为本次操作生成的幂等键，重试复用同一 ID）' });
    if (code === 'invalid_request_id') return res.status(400).json({ error: code, message: 'request_id 必须是 ≤128 字符的字符串' });
    if (code === 'request_id_mismatch') return res.status(409).json({ error: code, message: '该 request_id 已被其他订单的重新分配占用，请换新的 request_id' });
    if (code === 'request_id_conflict') return res.status(409).json({ error: code, message: '该 request_id 已被其他操作（如烧录、预留）占用，请换新的 request_id' });
    if (code === 'reserved_sn_activated') return res.status(409).json({ error: code, message: '当前预留的 SN 已激活，不能作废；如需新增备选请使用独立预留（保留旧 SN）' });
    if (code === 'factory_verify_incomplete') return res.status(409).json({ error: code, message: '该设备尚未完成出厂验证，无法预留替代 SN（本次操作已整体回滚）' });
    res.status(500).json({ error: 'reallocate_failed', reason: code, message: '重新分配失败：' + code });
  }
});

// 管理员重试续期（provider 续期失败后）：failed → pending，后台 worker 重新处理
app.post('/admin/api/orders/:id/retry-renew', adminAuth, (req, res) => {
  const ok = DB.retryOrderRenew(Number(req.params.id));
  if (!ok) return res.status(400).json({ error: 'order_not_failed' });
  res.json({ ok: true, provider_renew_status: 'pending' });
});

// 管理员人工完成续期：火山无公开 API 时，管理员在控制台手动购买 License + 绑定设备后确认
// 校验 order.status==='paid'，记录 License ID + 操作员 + 完成时间（审计追溯）
app.post('/admin/api/orders/:id/complete-renew', adminAuth, (req, res) => {
  const licenseId = (req.body && req.body.license_id) ? String(req.body.license_id).trim() : '';
  const ok = DB.completeOrderRenew(Number(req.params.id), licenseId || null, 'admin');
  if (!ok) return res.status(400).json({ error: 'order_not_renewable' });
  const order = DB.getOrderById(Number(req.params.id));
  res.json({
    ok: true,
    provider_renew_status: 'completed',
    license_id: order.provider_license_id,
    completed_at: order.provider_renew_completed_at,
    operator_id: order.provider_renew_operator_id,
  });
});

// 管理员删除订单（未付款可删；已付款且续期未完成的服务端拒绝删除）
app.delete('/admin/api/orders/:id', adminAuth, (req, res) => {
  try {
    DB.adminDeleteOrder(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    if (e.message === 'order_not_found') return res.status(404).json({ error: 'not_found' });
    if (e.message === 'order_renew_incomplete') return res.status(409).json({ error: 'order_renew_incomplete', message: '已付款且续期未完成的订单不能删除，请先完成续期或处理失败' });
    if (e.message === 'order_has_realloc_history') return res.status(409).json({ error: e.message, message: '该订单存在"作废并重新分配"历史（关联审计与幂等重放记录），不能删除' });
    res.status(500).json({ error: 'delete_failed' });
  }
});

// ==================== 用户：注册/登录/找回密码 ====================
// phone 为主登录账号，email 备选（可空）。手机号入库前统一标准化为 11 位裸数字。
const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// 产品用户页公开信息：只返回展示字段，不返回任何火山或密钥配置。
app.get('/:product/api/product', (req, res) => {
  const productId = DB.getProductIdByCode(req.params.product);
  if (!productId) return res.status(404).json({ error: 'product_not_found' });
  const product = DB.getProductRow(productId);
  res.json({ code: product.code, name: product.name });
});

app.post('/:product/api/auth/register', async (req, res) => {
  const productId = DB.getProductIdByCode(req.params.product);
  if (!productId) return res.status(404).json({ error: 'product_not_found' });

  // rate limit：按 IP 限频，防批量注册
  if (!rateLimit(`register:${clientIp(req)}`, 20, 60 * 1000)) {
    return res.status(429).json({ error: 'rate_limited', message: '注册过于频繁，请稍后再试' });
  }

  const { phone: rawPhone, password, email, code: smsCode } = req.body || {};
  if (!rawPhone || !password) return res.status(400).json({ error: 'missing_params' });
  const phone = DB.normalizePhone(rawPhone);
  if (!phone) return res.status(400).json({ error: 'invalid_phone' });
  if (password.length < 8) return res.status(400).json({ error: 'password_too_short' });
  if (email && !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }

  const existing = DB.getUserByPhone(productId, phone);
  if (existing) return res.status(409).json({ error: 'phone_exists' });

  if (!smsCode) return res.status(400).json({ error: 'missing_code', message: '请输入短信验证码' });

  // 校验短信验证码
  if (!rateLimit(`verify:${phone}`, 5, 60 * 1000)) {
    return res.status(429).json({ error: 'rate_limited', message: '操作过于频繁，请稍后再试' });
  }
  if (!DB.verifyPhoneCode(phone, String(smsCode), 'register')) {
    return res.status(401).json({ error: 'invalid_or_expired_code', message: '验证码不正确或已过期' });
  }

  const hash = await bcryptHash(password);
  const user = DB.createUser(productId, phone, hash, email || null);
  const token = jwt.sign({ uid: user.id, pid: productId }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, phone: user.phone, email: user.email } });
});

app.post('/:product/api/auth/login', async (req, res) => {
  const productId = DB.getProductIdByCode(req.params.product);
  if (!productId) return res.status(404).json({ error: 'product_not_found' });

  const { phone: rawPhone, password } = req.body || {};
  if (!rawPhone || !password) return res.status(400).json({ error: 'missing_params' });
  const phone = DB.normalizePhone(rawPhone);
  if (!phone) return res.status(400).json({ error: 'invalid_phone' });

  // rate limit：按手机号限频，防暴力撞库
  if (!rateLimit(`login:${phone}`, 20, 60 * 1000)) {
    return res.status(429).json({ error: 'rate_limited', message: '登录尝试过于频繁，请稍后再试' });
  }

  const user = DB.getUserByPhone(productId, phone);
  if (!user || user.deleted_at) return res.status(401).json({ error: 'invalid_credentials' });
  const ok = await bcryptCompare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid_credentials' });
  const token = jwt.sign({ uid: user.id, pid: productId }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, phone: user.phone, email: user.email } });
});

// 验证码登录（手机号 + 短信验证码，免密码）
app.post('/:product/api/auth/login-by-code', async (req, res) => {
  const productId = DB.getProductIdByCode(req.params.product);
  if (!productId) return res.status(404).json({ error: 'product_not_found' });

  const { phone: rawPhone, code } = req.body || {};
  if (!rawPhone || !code) return res.status(400).json({ error: 'missing_params' });
  const phone = DB.normalizePhone(rawPhone);
  if (!phone) return res.status(400).json({ error: 'invalid_phone' });

  if (!rateLimit(`login:${phone}`, 20, 60 * 1000)) {
    return res.status(429).json({ error: 'rate_limited', message: '登录尝试过于频繁，请稍后再试' });
  }
  if (!DB.verifyPhoneCode(phone, String(code), 'login')) {
    return res.status(401).json({ error: 'invalid_or_expired_code', message: '验证码不正确或已过期' });
  }

  const user = DB.getUserByPhone(productId, phone);
  if (!user || user.deleted_at) return res.status(401).json({ error: 'invalid_credentials' });
  const token = jwt.sign({ uid: user.id, pid: productId }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, phone: user.phone, email: user.email } });
});

// ==================== 滑块人机校验（防短信接口被机器人刷） ====================
// 生成滑块挑战：返回背景图（含缺口）+ 拼图块 + captcha_id
app.get('/:product/api/captcha/slider', (req, res) => {
  const productId = DB.getProductIdByCode(req.params.product);
  if (!productId) return res.status(404).json({ error: 'product_not_found' });
  res.json(captcha.create());
});

// 校验滑动结果：通过后颁发一次性 captcha_token，供短信接口消费
app.post('/:product/api/captcha/verify', (req, res) => {
  const productId = DB.getProductIdByCode(req.params.product);
  if (!productId) return res.status(404).json({ error: 'product_not_found' });

  const { captcha_id, slider_x, trail } = req.body || {};
  if (!captcha_id || slider_x === undefined) {
    return res.status(400).json({ error: 'missing_params' });
  }
  const r = captcha.verify(captcha_id, slider_x, trail);
  if (!r.ok) {
    const code = r.reason || 'verify_failed';
    const status = (code === 'captcha_not_found' || code === 'captcha_expired' || code === 'captcha_consumed') ? 410 : 400;
    const CN = {
      position_mismatch: '滑块未对齐缺口，请重新拖动',
      trail_too_short: '拖动轨迹过短，请重新拖动',
      trail_too_fast: '拖动过快，请重新拖动',
      bad_start: '起点异常，请重新拖动',
      bad_slider_x: '滑动数据异常，请重新拖动',
      captcha_not_found: '校验已失效，请重新获取滑块',
      captcha_expired: '校验已过期，请重新获取滑块',
      captcha_consumed: '校验已使用，请重新获取滑块',
      verify_failed: '校验失败，请重新拖动',
    };
    return res.status(status).json({ error: 'captcha_failed', reason: code, message: CN[code] || '校验失败，请重新拖动' });
  }
  res.json({ ok: true, captcha_token: r.token, expires_in: r.expires_in });
});

// 发送短信验证码（注册 / 登录 / 找回密码 / 修改密码）
// dev/test 模式（未配置短信）直接返回 dev_code，便于联调
// 必须先通过滑块校验，携带一次性 captcha_token
const SMS_PURPOSES = ['register', 'login', 'reset_password', 'change_password'];
app.post('/:product/api/auth/sms-code', async (req, res) => {
  const productId = DB.getProductIdByCode(req.params.product);
  if (!productId) return res.status(404).json({ error: 'product_not_found' });

  const { phone: rawPhone, purpose = 'reset_password', captcha_token } = req.body || {};
  if (!rawPhone) return res.status(400).json({ error: 'missing_params' });
  if (!SMS_PURPOSES.includes(purpose)) {
    return res.status(400).json({ error: 'invalid_purpose', message: '验证码用途不合法' });
  }
  // 先校验滑块 token（一次性消费）
  if (!captcha_token || !captcha.consumeToken(captcha_token)) {
    return res.status(403).json({ error: 'captcha_required', message: '请先完成滑块校验' });
  }
  const phone = DB.normalizePhone(rawPhone);
  if (!phone) return res.status(400).json({ error: 'invalid_phone' });

  // 按用途校验手机号状态
  const existingUser = DB.getUserByPhone(productId, phone);
  if (purpose === 'register' && existingUser) {
    return res.status(409).json({ error: 'phone_exists', message: '该手机号已注册' });
  }
  if ((purpose === 'login' || purpose === 'change_password') && !existingUser) {
    return res.status(404).json({ error: 'user_not_found', message: '该手机号尚未注册' });
  }

  // rate limit：分层限流防短信轰炸
  const _ip = clientIp(req);
  const _today = new Date().toISOString().slice(0, 10);  // YYYY-MM-DD
  if (!rateLimit(`sms:${phone}:${purpose}`, 1, 60 * 1000)) {
    return res.status(429).json({ error: 'rate_limited', message: '验证码发送过于频繁，请 60 秒后再试' });
  }
  if (!rateLimit(`sms:phone-day:${phone}:${_today}`, 10, 24 * 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'rate_limited', message: '该手机号今日验证码发送次数已达上限，请明日再试' });
  }
  if (!rateLimit(`sms:ip-hour:${_ip}`, 5, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'rate_limited', message: '请求过于频繁，请稍后再试' });
  }
  if (!rateLimit(`sms:ip-day:${_ip}:${_today}`, 20, 24 * 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'rate_limited', message: '今日请求次数已达上限，请明日再试' });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = DB.createPhoneCode(phone, code, purpose, 5);
  try {
    await sendSms(phone, code);
  } catch (e) {
    console.error('[sms] 发送失败:', e.message);
    return res.status(500).json({ error: 'sms_send_failed', message: '短信发送失败，请稍后重试' });
  }

  res.json({
    ok: true,
    expires_at: expiresAt,
    expires_in: 300,
    ...(!SMS_ENABLED ? { dev_code: code } : {}),   // dev 模式回传验证码，生产模式不返回
  });
});

// 重置密码：手机号 + 验证码 + 新密码
app.post('/:product/api/auth/reset-password', async (req, res) => {
  const productId = DB.getProductIdByCode(req.params.product);
  if (!productId) return res.status(404).json({ error: 'product_not_found' });

  const { phone: rawPhone, code, new_password } = req.body || {};
  if (!rawPhone || !code || !new_password) return res.status(400).json({ error: 'missing_params' });
  const phone = DB.normalizePhone(rawPhone);
  if (!phone) return res.status(400).json({ error: 'invalid_phone' });
  if (new_password.length < 8) return res.status(400).json({ error: 'password_too_short' });

  // rate limit：按手机号限频，防暴力猜验证码
  if (!rateLimit(`reset:${phone}`, 5, 60 * 1000)) {
    return res.status(429).json({ error: 'rate_limited', message: '操作过于频繁，请稍后再试' });
  }

  const ok = DB.verifyPhoneCode(phone, String(code), 'reset_password');
  if (!ok) return res.status(401).json({ error: 'invalid_or_expired_code' });

  const user = DB.getUserByPhone(productId, phone);
  if (!user) return res.status(404).json({ error: 'user_not_found' });

  const hash = await bcryptHash(new_password);
  DB.updateUserPassword(user.id, hash);
  res.json({ ok: true });
});

// 修改密码（已登录用户）：旧密码 + 新密码
app.post('/:product/api/auth/change-password', userAuth, async (req, res) => {
  const { old_password, new_password } = req.body || {};
  if (!old_password || !new_password) return res.status(400).json({ error: 'missing_params' });
  if (new_password.length < 8) return res.status(400).json({ error: 'password_too_short' });

  if (!rateLimit(`change:${req.user.uid}`, 5, 60 * 1000)) {
    return res.status(429).json({ error: 'rate_limited', message: '操作过于频繁，请稍后再试' });
  }

  const user = DB.getUserById(req.user.uid);
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  const ok = await bcryptCompare(old_password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'wrong_password', message: '旧密码不正确' });

  const hash = await bcryptHash(new_password);
  DB.updateUserPassword(user.id, hash);
  res.json({ ok: true });
});

// 修改密码（已登录用户）：短信验证码 + 新密码（忘记旧密码时用）
app.post('/:product/api/auth/change-password-by-code', userAuth, async (req, res) => {
  const { code, new_password } = req.body || {};
  if (!code || !new_password) return res.status(400).json({ error: 'missing_params' });
  if (new_password.length < 8) return res.status(400).json({ error: 'password_too_short' });

  if (!rateLimit(`change:${req.user.uid}`, 5, 60 * 1000)) {
    return res.status(429).json({ error: 'rate_limited', message: '操作过于频繁，请稍后再试' });
  }

  const user = DB.getUserById(req.user.uid);
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  if (!DB.verifyPhoneCode(user.phone, String(code), 'change_password')) {
    return res.status(401).json({ error: 'invalid_or_expired_code', message: '验证码不正确或已过期' });
  }

  const hash = await bcryptHash(new_password);
  DB.updateUserPassword(user.id, hash);
  res.json({ ok: true });
});

app.get('/:product/api/me', userAuth, (req, res) => {
  const user = DB.getUserById(req.user.uid);
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  // 套餐按设备：返回该用户的所有绑定设备，每台带服务期 / 续期状态
  const bindings = DB.listBindingsByUser(req.user.uid);
  const devices = bindings.map(b => {
    const now = Date.now();
    const exp = b.service_expires_at ? new Date(b.service_expires_at).getTime() : null;
    const service_status = !exp ? 'none' : (exp > now ? 'active' : 'expired');
    return {
      credential_id: b.credential_id,        // 展示用解析 SN（选定 > 最近激活 > 最早）
      sn: b.sn,
      hardware_id: b.hardware_id,
      nickname: b.nickname,
      cred_status: b.cred_status,
      plan: b.service_plan,                  // 设备级套餐
      service_expires_at: b.service_expires_at,
      service_renew_status: b.provider_renew_status,
      service_status,                       // none / active / expired
    };
  });
  res.json({
    id: user.id,
    phone: user.phone,
    email: user.email,
    email_verified: !!user.email_verified,
    // 套餐已迁移到设备级：用户级 plan/plan_expires_at 不再使用
    devices,
  });
});

// ==================== 用户：设备绑定管理 ====================
app.get('/:product/api/devices', userAuth, (req, res) => {
  const rows = DB.listBindingsByUser(req.user.uid).map(b => {
    let service_status = 'none';
    if (b.service_expires_at) {
      service_status = new Date(b.service_expires_at).getTime() > Date.now() ? 'active' : 'expired';
    }
    return {
      binding_id: b.id,
      credential_id: b.credential_id,
      sn: b.sn,
      hardware_id: b.hardware_id,
      local_hostname: deriveLocalHostname(b.hardware_id),
      nickname: b.nickname,
      bound_at: b.bound_at,
      last_seen_at: b.last_seen_at,
      status: b.cred_status,
      service_status,
      service_expires_at: b.service_expires_at,
      provider_renew_status: b.provider_renew_status || 'none',
    };
  });
  res.json(rows);
});

app.delete('/:product/api/devices/:bindingId', userAuth, (req, res) => {
  const b = DB.getBindingById(Number(req.params.bindingId));
  if (!b || b.user_id !== req.user.uid) return res.status(404).json({ error: 'not_found' });
  DB.deleteBinding(b.id);
  res.json({ ok: true });
});

// ==================== 用户：续费订单（v4 ⑪） ====================
// 创建续费订单：用户为自己的设备续费 N 年
// 订单挂物理设备（通过凭证定位 hardware_id），并记录本次续费针对的 SN
app.post('/:product/api/devices/:bindingId/renew', userAuth, (req, res) => {
  const b = DB.getBindingById(Number(req.params.bindingId));
  if (!b || b.user_id !== req.user.uid) return res.status(404).json({ error: 'not_found' });

  const years = Number(req.body.years) || 1;
  if (years < 1 || years > 5) return res.status(400).json({ error: 'invalid_years' });

  // 下单针对设备当前解析的 SN（后台选定 > 最近激活 > 最早）；切换选择后新订单自然挂新目标
  const targetCred = DB.resolveNoSnCredential(b.product_id, b.hardware_id);
  if (!targetCred) return res.status(404).json({ error: 'device_not_provisioned' });

  const order = DB.createOrder({
    userId: req.user.uid,
    credentialId: targetCred.id,
    productId: b.product_id,
    amount: DB.DEFAULT_ANNUAL_AMOUNT * years,
    plan: 'annual',
    years,
  });
  res.json({
    ok: true,
    order_id: order.id,
    order_no: order.order_no,
    amount: order.amount,
    years: order.years,
    status: order.status,
  });
});

// 用户上传转账凭证（人工转账场景）：订单仍保持 pending，管理员核对后才 paid
app.post('/:product/api/orders/:id/voucher', userAuth, (req, res) => {
  const order = DB.getOrderById(Number(req.params.id));
  if (!order || order.user_id !== req.user.uid) return res.status(404).json({ error: 'not_found' });
  if (order.status !== 'pending') return res.status(400).json({ error: 'order_not_pending' });

  const voucher = (req.body.voucher || '').trim();
  if (!voucher) return res.status(400).json({ error: 'voucher_required' });
  if (voucher.length > 500) return res.status(400).json({ error: 'voucher_too_long' });

  const updated = DB.attachVoucher(order.id, voucher);
  res.json({
    ok: true,
    order_id: updated.id,
    status: updated.status,                 // 仍是 pending
    voucher_submitted_at: updated.voucher_submitted_at,
    message: '凭证已提交，等待管理员审核',
  });
});

// 用户删除订单（仅 pending 状态可删）
app.delete('/:product/api/orders/:id', userAuth, (req, res) => {
  const order = DB.getOrderById(Number(req.params.id));
  if (!order || order.user_id !== req.user.uid) return res.status(404).json({ error: 'not_found' });
  try {
    DB.deleteOrder(order.id);
    res.json({ ok: true });
  } catch (e) {
    if (e.message === 'order_not_deletable') return res.status(400).json({ error: 'order_not_deletable', message: '已付款订单无法删除' });
    res.status(500).json({ error: 'delete_failed' });
  }
});

// 我的订单列表
app.get('/:product/api/orders', userAuth, (req, res) => {
  res.json(DB.listOrdersByUser(req.user.uid).map(o => ({
    id: o.id,
    order_no: o.order_no,
    sn: o.sn,
    amount: o.amount,
    plan: o.plan,
    years: o.years,
    status: o.status,                        // pending（待付款/待审核）/ paid / cancelled
    voucher_text: o.voucher_text,            // 用户提交的转账凭证
    voucher_submitted_at: o.voucher_submitted_at,
    paid_at: o.paid_at,
    provider_renew_status: o.provider_renew_status,
    provider_renew_error: o.provider_renew_error,
    created_at: o.created_at,
  })));
});

// 用户扫码后确认绑定（改动⑤：字段改 nickname）
// 绑定与服务期挂物理设备（hardware_id），与具体 SN 无关
app.post('/:product/api/device/bind/confirm', userAuth, (req, res) => {
  const { temp_token, nickname } = req.body;
  const t = DB.getBindToken(temp_token);
  if (!t) return res.status(400).json({ error: 'invalid_or_expired_token' });
  const tokenCredential = DB.getCredentialById(t.credential_id);
  if (!tokenCredential || tokenCredential.product_id !== req.user.pid) {
    return res.status(403).json({ error: 'product_mismatch' });
  }
  const hardwareId = tokenCredential.hardware_id;

  const existingBinding = DB.getBindingByHardware(req.user.pid, hardwareId);
  if (existingBinding) return res.status(409).json({ error: 'device_already_bound' });

  DB.confirmBindToken(temp_token);
  const binding = DB.createBinding(req.user.uid, req.user.pid, hardwareId, nickname);
  // 阶段6.5：首次绑定自动创建第一年服务期（已存在则保留原 expires_at，仅更新持有人）
  const service = DB.createServiceForDevice(req.user.uid, req.user.pid, hardwareId, 'annual');
  res.json({
    ok: true,
    binding_id: binding.id,
    hardware_id: hardwareId,
    credential_id: tokenCredential.id,
    nickname: binding.nickname,
    service_expires_at: service.expires_at,
  });
});

// ==================== 设备：激活（核心改动②③⑧） ====================
// 设备用 eFuse 中的 FactoryKey 计算 HMAC，签名内容：v1|activate|hardware_id|timestamp|nonce
app.post('/:product/api/device/activate', async (req, res) => {
  const productId = DB.getProductIdByCode(req.params.product);
  if (!productId) return res.status(404).json({ error: 'product_not_found' });

  const { hardware_id, timestamp, nonce, signature, sn } = req.body;
  if (!hardware_id || !timestamp || !nonce || !signature) {
    return res.status(400).json({ error: 'missing_params' });
  }

  // 同一 MAC 可能有多个 SN，通过 sn 参数选择；
  // 不带 SN 时解析到"后台选定的下次上线 SN"（无选择则最近激活的凭证）
  const cred = sn
    ? DB.getCredentialByHardwareIdAndSn(productId, hardware_id, sn)
    : DB.resolveNoSnCredential(productId, hardware_id);
  if (!cred) return res.status(404).json({ error: 'device_not_provisioned' });
  if (['provisioning', 'provisioning_failed', 'retired'].includes(cred.status)) {
    return res.status(403).json({ error: 'device_not_provisioned', status: cred.status });
  }

  const factoryKey = DB.getDecryptedFactoryKey(cred);
  // 带 sn 的请求必须用 v2 签名（sn 参与签名，防止目标 SN 被篡改）
  const v = verifySignature('activate', factoryKey, hardware_id, timestamp, nonce, signature, sn);
  if (!v.ok) return res.status(401).json({ error: 'auth_failed', reason: v.reason });

  // 两项都齐全才可恢复；老设备只有 DeviceSecret 时重新 DynamicRegister
  // 补取 RTCAppID，固件无需清 NVS 或重新绑定。
  const existingSecret = DB.getDecryptedDeviceSecret(cred);
  const productConfig = DB.getProductConfig(productId);
  const existingRtcAppId = productConfig.rtc_app_id || '';
  if (existingSecret && existingRtcAppId) {
    // 已激活 SN 的恢复：直接下发已保存的 device_secret，不重复 DynamicRegister。
    // 后台选定（pending_primary）保持不变——管理员改选前，设备一直解析到选定的 SN。
    DB.markActivated(productId, hardware_id, cred.id);
    return res.json({
      ok: true,
      recovered: true,
      sn: cred.sn,                                  // 顺便返回 SN，设备可缓存显示
      volcano_device_name: cred.volcano_device_name,
      device_secret: existingSecret,
      rtc_app_id: existingRtcAppId,
    });
  }

  // 首次激活（待火山激活的 SN，含后台预留的新 SN）：调火山 DynamicRegister
  if (!VOLCANO_ENABLED) {
    // 测试模式：返回假的 device_secret
    const fakeSecret = 'TEST_' + crypto.randomBytes(16).toString('hex');
    const fakeRtcAppId = 'TEST_RTC_APP_ID';
    const savedRtcAppId = DB.saveVolcanoCredentials(productId, cred.id, fakeSecret, fakeRtcAppId);
    DB.markActivated(productId, hardware_id, cred.id);
    return res.json({
      ok: true,
      recovered: false,
      test_mode: true,
      sn: cred.sn,
      volcano_device_name: cred.volcano_device_name,
      device_secret: fakeSecret,
      rtc_app_id: savedRtcAppId,
    });
  }

  if (!productConfig.instance_id || !productConfig.product_key || !productConfig.product_secret) {
    return res.status(500).json({ error: 'product_volcano_not_configured' });
  }

  try {
    const result = await volcano.dynamicRegister({
      instance_id: productConfig.instance_id,
      product_key: productConfig.product_key,
      product_secret: productConfig.product_secret,
    }, cred.volcano_device_name);
    const savedRtcAppId = DB.saveVolcanoCredentials(
      productId, cred.id, result.device_secret, result.rtc_app_id
    );
    DB.markActivated(productId, hardware_id, cred.id);
    return res.json({
      ok: true,
      recovered: false,
      sn: cred.sn,
      volcano_device_name: cred.volcano_device_name,
      device_secret: result.device_secret,
      rtc_app_id: savedRtcAppId,
    });
  } catch (err) {
    console.error('[volcano] DynamicRegister 失败:', err);
    return res.status(502).json({ error: 'volcano_register_failed', message: err.message });
  }
});

// ==================== 设备：列出同一 MAC 的所有 SN（多证书切换） ====================
app.post('/:product/api/device/sns', (req, res) => {
  const productId = DB.getProductIdByCode(req.params.product);
  if (!productId) return res.status(404).json({ error: 'product_not_found' });

  const { hardware_id, timestamp, nonce, signature } = req.body;
  if (!hardware_id || !timestamp || !nonce || !signature) {
    return res.status(400).json({ error: 'missing_params' });
  }

  const creds = DB.getCredentialsByHardwareId(productId, hardware_id);
  if (creds.length === 0) return res.status(404).json({ error: 'device_not_provisioned' });

  // 用第一个凭证的 FactoryKey 验证（同一 MAC 的所有 SN 共享同一个 FactoryKey）
  const factoryKey = DB.getDecryptedFactoryKey(creds[0]);
  const v = verifySignature('sns', factoryKey, hardware_id, timestamp, nonce, signature);
  if (!v.ok) return res.status(401).json({ error: 'auth_failed', reason: v.reason });

  res.json({
    ok: true,
    hardware_id,
    sns: creds.map(c => ({
      sn: c.sn,
      status: c.status,
      volcano_device_name: c.volcano_device_name,
      device_secret_ready: !!c.volcano_device_secret,
      volcano_activated_at: c.volcano_activated_at,
    })),
  });
});

// ==================== 设备：状态查询（新增⑦ + v4 ⑩） ====================
// 设备在开启火山会话前必须先问平台：我是否已绑定 + 服务期是否有效
// 解绑后平台返回 bound=false，服务期过期返回 ai_allowed=false
app.post('/:product/api/device/status', (req, res) => {
  const productId = DB.getProductIdByCode(req.params.product);
  if (!productId) return res.status(404).json({ error: 'product_not_found' });

  const { hardware_id, timestamp, nonce, signature, sn } = req.body;
  if (!hardware_id || !timestamp || !nonce || !signature) {
    return res.status(400).json({ error: 'missing_params' });
  }

  const cred = sn
    ? DB.getCredentialByHardwareIdAndSn(productId, hardware_id, sn)
    : DB.getCredentialByHardwareId(productId, hardware_id);
  if (!cred) return res.status(404).json({ error: 'device_not_provisioned' });

  const factoryKey = DB.getDecryptedFactoryKey(cred);
  const v = verifySignature('status', factoryKey, hardware_id, timestamp, nonce, signature, sn);
  if (!v.ok) return res.status(401).json({ error: 'auth_failed', reason: v.reason });

  const binding = DB.getBindingByHardware(productId, hardware_id);
  if (binding) DB.touchBindingSeen(binding.id);

  // 服务期状态：none / active / expired（服务期挂物理设备）
  const service = DB.getServiceByHardware(productId, hardware_id);
  let service_status = 'none';
  let service_expires_at = null;
  if (service) {
    service_expires_at = service.expires_at;
    service_status = new Date(service.expires_at).getTime() > Date.now() ? 'active' : 'expired';
  }

  // 业务判断用的"当前生效凭证"与上面验签用的凭证分离：
  //   - 验签只用 FactoryKey（挂物理设备，作废记录也能验签）；
  //   - 业务（SN 展示 / 权益 / AI 放行）必须排除 retired——只剩作废 SN 时
  //     不能把它当"可用"返回，更不能因此放行 AI；
  //   - 不带 sn 查询按"最近激活"优先（resolveActiveCredential，刻意不按
  //     pending 优先）：管理员刚指定"下次上线"的新 SN 未激活前，仍按旧 SN 判断。
  const eff = sn ? cred : DB.resolveActiveCredential(productId, hardware_id);
  if (!eff || eff.status === 'retired') {
    return res.json({
      ok: true,
      sn: null,
      sn_available: false,       // 该设备当前没有可用 SN（全部作废或未配置）
      activated: false,
      bound: !!binding,
      nickname: binding ? binding.nickname : null,
      device_secret_ready: false,
      credential_status: null,
      service_status,            // 服务期仍按物理设备如实返回
      service_expires_at,
      ai_allowed: false,         // 无可用 SN 一律禁止 AI
      provider_renew_status: 'none',
      provider_expires_at: null,
      provider_available: false,
      message: '该设备暂无可用 SN，请联系管理员配置；配置并激活前禁止使用 AI',
    });
  }

  // SN 已配置 ≠ 已激活可用：必须区分两层状态。
  //   - 未激活的预留 SN（含显式携带查询）：可以返回 SN 与"待激活"提示，
  //     但 provider_available / ai_allowed 必须为 false——不能因为
  //     "没有权益记录"的旧数据兼容口径就默认可用，固件会据此尝试连接；
  //   - 旧数据兼容（无权益记录视为可用）仅适用于有可信激活证据
  //     （volcano_activated_at）的记录；
  //   - 旧 SN 在新 pending SN 激活前继续可用：resolveActiveCredential
  //     按最近激活优先，无 sn 查询不受新预留影响。
  const activated = !!eff.volcano_activated_at;
  const rights = DB.getSnRights(eff.id);
  const provider_expires_at = rights ? rights.provider_expires_at : null;
  const provider_available = activated
    && (!rights || !provider_expires_at || new Date(provider_expires_at).getTime() > Date.now());

  // ai_allowed = 已激活 + 已绑定 + 平台服务期有效 + 当前供应商 License 有效。
  const ai_allowed = activated && !!binding && service_status === 'active' && provider_available;

  res.json({
    ok: true,
    sn: eff.sn,
    sn_available: true,
    activated,                 // 该 SN 是否有可信激活证据（volcano_activated_at）
    bound: !!binding,
    nickname: binding ? binding.nickname : null,
    device_secret_ready: !!eff.volcano_device_secret,
    credential_status: eff.status,
    service_status,            // none / active / expired
    service_expires_at,        // ISO 时间
    ai_allowed,                // 综合判断：是否允许开火山会话
    provider_renew_status: rights ? rights.provider_renew_status : 'none',
    provider_expires_at,
    provider_available,        // 火山 License 是否可用（供设备显示提示）
    message: activated ? undefined : `SN「${eff.sn}」待激活：设备完成激活并获得 License 前禁止使用 AI`,
  });
});

// ==================== 设备：生成绑定二维码（改动④：二维码只放 temp_token） ====================
app.post('/:product/api/device/bind/qrcode', (req, res) => {
  const productId = DB.getProductIdByCode(req.params.product);
  if (!productId) return res.status(404).json({ error: 'product_not_found' });

  const { hardware_id, timestamp, nonce, signature, sn } = req.body;
  if (!hardware_id || !timestamp || !nonce || !signature) {
    return res.status(400).json({ error: 'missing_params' });
  }

  const cred = sn
    ? DB.getCredentialByHardwareIdAndSn(productId, hardware_id, sn)
    : DB.getCredentialByHardwareId(productId, hardware_id);
  if (!cred) return res.status(404).json({ error: 'device_not_provisioned' });

  const factoryKey = DB.getDecryptedFactoryKey(cred);
  const v = verifySignature('qrcode', factoryKey, hardware_id, timestamp, nonce, signature, sn);
  if (!v.ok) return res.status(401).json({ error: 'auth_failed', reason: v.reason });

  // 已绑定则不再生成二维码（绑定挂物理设备，任一 SN 已绑定即视为已绑定）
  const existingBinding = DB.getBindingByHardware(productId, cred.hardware_id);
  if (existingBinding) {
    return res.json({
      ok: true,
      already_bound: true,
      message: '设备已绑定，无需重复绑定。如需换绑请先在官网解绑。',
    });
  }

  const { temp_token, expires_at } = DB.createBindToken(cred.id);
  // 二维码内容：只含 temp_token，不含 SN
  const qrUrl = `https://vectorac.com/${req.params.product}/account/#/bind?t=${temp_token}`;
  res.json({
    ok: true,
    qr_url: qrUrl,
    temp_token: temp_token,
    expires_at: expires_at,
  });
});

// ==================== 设备：轮询绑定状态（改动⑥：加 HMAC 认证） ====================
app.post('/:product/api/device/bind/poll', (req, res) => {
  const productId = DB.getProductIdByCode(req.params.product);
  if (!productId) return res.status(404).json({ error: 'product_not_found' });

  const { hardware_id, temp_token, timestamp, nonce, signature, sn } = req.body;
  if (!hardware_id || !temp_token || !timestamp || !nonce || !signature) {
    return res.status(400).json({ error: 'missing_params' });
  }

  const cred = sn
    ? DB.getCredentialByHardwareIdAndSn(productId, hardware_id, sn)
    : DB.getCredentialByHardwareId(productId, hardware_id);
  if (!cred) return res.status(404).json({ error: 'device_not_provisioned' });

  const factoryKey = DB.getDecryptedFactoryKey(cred);
  const v = verifySignature('poll', factoryKey, hardware_id, timestamp, nonce, signature, sn);
  if (!v.ok) return res.status(401).json({ error: 'auth_failed', reason: v.reason });

  // poll 校验：token 与请求凭证按"同产品 + 同 MAC"匹配。
  // 绑定挂物理设备——设备换 SN（如 A 激活后切到 B）后，旧 token 仍对本 MAC 有效；
  // 跨 MAC 使用 token 必须拒绝，不能静默返回 pending。
  const t = DB.getBindTokenAnyStatus(temp_token);
  if (!t) return res.json({ ok: true, status: 'pending' });
  const tokenCred = DB.getCredentialById(t.credential_id);
  if (!tokenCred || tokenCred.product_id !== productId || tokenCred.hardware_id !== cred.hardware_id) {
    return res.status(403).json({ error: 'token_device_mismatch', message: 'temp_token 与当前设备不匹配' });
  }

  if (t.status === 'confirmed') {
    const binding = DB.getBindingByHardware(productId, cred.hardware_id);
    if (binding) {
      return res.json({
        ok: true,
        status: 'bound',
        nickname: binding.nickname,
      });
    }
  }
  res.json({ ok: true, status: 'pending' });
});

// ==================== 静态文件 ====================
const accountDir = path.join(__dirname, 'public', 'account');
const adminDir = path.join(__dirname, 'public', 'admin');
if (fs.existsSync(accountDir)) app.use('/account', express.static(accountDir));
if (fs.existsSync(adminDir)) app.use('/admin', express.static(adminDir));

if (fs.existsSync(accountDir)) app.use('/:product/account', express.static(accountDir));

app.get('/admin', (req, res) => res.sendFile(path.join(adminDir, 'index.html')));
app.get('/admin/*', (req, res) => res.sendFile(path.join(adminDir, 'index.html')));

app.get('/:product/account/*', (req, res) => res.sendFile(path.join(accountDir, 'index.html')));

app.get('/healthz', (req, res) => res.send('ok'));

// ==================== bcrypt 简易实现（避免额外依赖） ====================
async function bcryptHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `pbkdf2$${salt}$${hash}`;
}
async function bcryptCompare(password, stored) {
  const parts = stored.split('$');
  if (parts.length !== 3) return false;
  const [, salt, hash] = parts;
  const test = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(test));
}

// ==================== 启动 ====================
// 定期清理过期 nonce 和 bind tokens
setInterval(() => {
  try {
    DB.cleanExpiredNonces();
    DB.cleanExpiredBindTokens();
    DB.cleanExpiredPhoneCodes();
  } catch (e) { /* ignore */ }
}, 60 * 1000);

// v4 ⑫：后台轮询处理火山 License 续期（仅在已接入火山 API 时启用）
// 火山暂无公开续期 API 时 VOLCANO_ENABLED !== 'true'，不自动跑，
// 由管理员在火山控制台手动购买 License + 绑定设备后，回平台点"完成续期"人工处理
// 自动模式：扫描 pending → 原子抢占 processing → 调火山续期 → completed/failed
setInterval(async () => {
  if (VOLCANO_ENABLED !== 'true') return;  // 未接入火山 API 时完全靠人工
  let orders;
  try { orders = DB.listOrdersPendingRenew(); } catch (e) { return; }
  for (const order of orders) {
    // 原子抢占：pending → processing，失败说明已被其他 worker 抢走，跳过
    if (!DB.claimOrderForRenew(order.id)) continue;
    try {
      const result = await volcano.renewLicense(
        {
          instance_id: order.instance_id,
          product_key: order.product_key,
          product_secret: order.product_secret,
        },
        {
          device_name: order.volcano_device_name,
          years: order.years,
        }
      );
      DB.setOrderRenewStatus(order.id, 'completed', { licenseId: result.license_id });
      DB.setSnRenewStatus(order.credential_id, 'completed', {
        licenseId: result.license_id,
        providerExpiresAt: result.expires_at,
      });
      console.log(`[renew] order ${order.order_no} completed, license=${result.license_id}`);
    } catch (e) {
      DB.setOrderRenewStatus(order.id, 'failed', { error: e.message });
      DB.setSnRenewStatus(order.credential_id, 'failed', { error: e.message });
      console.error(`[renew] order ${order.order_no} failed:`, e.message);
    }
  }
}, 10 * 1000);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[usermgr] v4 listening on :${PORT} (volcano_enabled=${VOLCANO_ENABLED})`);
  });
}

module.exports = { app, verifySignature, buildSignString, deriveLocalHostname, rateBuckets };
