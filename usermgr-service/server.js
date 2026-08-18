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

// 阿里云短信客户端（懒加载，仅在 SMS_ENABLED 时创建）
let _smsClient = null;
function getSmsClient() {
  if (_smsClient) return _smsClient;
  const Dysmsapi = require('@alicloud/dysmsapi20170525');
  const OpenApi = require('@alicloud/openapi-client');
  const Util = require('@alicloud/tea-util');
  const config = new OpenApi.Config({
    accessKeyId: SMS_CONFIG.accessKeyId,
    accessKeySecret: SMS_CONFIG.accessKeySecret,
    endpoint: SMS_CONFIG.endpoint,
  });
  _smsClient = new Dysmsapi.default(config);
  _smsClient._runtime = new Util.RuntimeOptions({});
  return _smsClient;
}

async function sendSms(phone, code) {
  if (SMS_ENABLED) {
    const client = getSmsClient();
    const Dysmsapi = require('@alicloud/dysmsapi20170525');
    const req = new Dysmsapi.SendSmsRequest({
      phoneNumbers: phone,
      signName: SMS_CONFIG.signName,
      templateCode: SMS_CONFIG.templateCode,
      templateParam: JSON.stringify({ code, time: '5' }),
    });
    const resp = await client.sendSmsWithOptions(req, client._runtime);
    if (resp.body.code !== 'OK') {
      console.error(`[sms] 发送失败: ${resp.body.code} ${resp.body.message}`);
      throw new Error(`短信发送失败: ${resp.body.message}`);
    }
    console.log(`[sms] 已发送至 ${phone} (bizId=${resp.body.bizId})`);
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
    const productId = DB.getProductIdByCode(req.params.product);
    if (!productId) return res.status(404).json({ error: 'product_not_found' });
    if (req.user.pid !== productId) return res.status(403).json({ error: 'product_mismatch' });
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

// ==================== 签名工具 ====================
// 签名内容：v1|{action}|hardware_id|timestamp|nonce
function buildSignString(action, hardwareId, timestamp, nonce) {
  return `v1|${action}|${hardwareId}|${timestamp}|${nonce}`;
}

function verifySignature(action, factoryKey, hardwareId, timestamp, nonce, signatureB64) {
  const ts = Number(timestamp);
  if (!ts || isNaN(ts)) return { ok: false, reason: 'bad_timestamp' };
  const now = Date.now();
  if (Math.abs(now - ts) > ALLOWED_DRIFT_MS) return { ok: false, reason: 'timestamp_out_of_window' };

  if (!nonce || nonce.length < 8) return { ok: false, reason: 'bad_nonce' };
  if (DB.isNonceUsed(nonce)) return { ok: false, reason: 'nonce_reused' };

  const expected = buildSignString(action, hardwareId, ts, nonce);
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
app.post('/admin/api/provision', provisionAuth, (req, res) => {
  const { product, hardware_id } = req.body;
  if (!product || !hardware_id) return res.status(400).json({ error: 'missing_params' });

  const productId = DB.getProductIdByCode(product);
  if (!productId) return res.status(404).json({ error: 'product_not_found' });

  try {
    const result = DB.provisionDevice(productId, hardware_id);
    if (result.already_provisioned) {
      return res.json({ ok: true, already_provisioned: true, sn: result.sn });
    }
    res.json({ ok: true, sn: result.sn, factory_key: result.factoryKey, challenge: result.challenge });
  } catch (e) {
    if (e.message === 'device_retired') return res.status(403).json({ error: 'device_retired' });
    res.status(500).json({ error: 'provision_failed', reason: e.message });
  }
});

// 阶段 2：验证 eFuse HMAC challenge
app.post('/admin/api/provision/verify', provisionAuth, (req, res) => {
  const { product, hardware_id, challenge, response } = req.body;
  if (!product || !hardware_id || !challenge || !response) {
    return res.status(400).json({ error: 'missing_params' });
  }
  const productId = DB.getProductIdByCode(product);
  if (!productId) return res.status(404).json({ error: 'product_not_found' });

  try {
    const result = DB.verifyProvision(productId, hardware_id, challenge, response);
    res.json({ ok: true, sn: result.sn, status: result.status });
  } catch (e) {
    const code = e.message;
    if (code === 'device_not_found') return res.status(404).json({ error: code });
    if (code === 'already_provisioned') return res.status(409).json({ error: code });
    if (code === 'not_in_provisioning_state') return res.status(409).json({ error: code });
    if (code === 'challenge_expired' || code === 'challenge_mismatch') return res.status(410).json({ error: code });
    if (code === 'hmac_mismatch' || code === 'bad_response_format') return res.status(401).json({ error: code });
    res.status(500).json({ error: 'verify_failed', reason: code });
  }
});

// 标记烧录失败
app.post('/admin/api/provision/fail', provisionAuth, (req, res) => {
  const { product, hardware_id, reason } = req.body;
  if (!product || !hardware_id) return res.status(400).json({ error: 'missing_params' });
  const productId = DB.getProductIdByCode(product);
  if (!productId) return res.status(404).json({ error: 'product_not_found' });

  try {
    const result = DB.failProvision(productId, hardware_id, reason || 'unknown');
    res.json({ ok: true, sn: result.sn, status: result.status });
  } catch (e) {
    if (e.message === 'device_not_found') return res.status(404).json({ error: e.message });
    res.status(500).json({ error: 'fail_failed', reason: e.message });
  }
});

// ==================== 管理员：设备凭证/用户/绑定查询 ====================
app.get('/admin/api/credentials', adminAuth, (req, res) => {
  const productId = DB.getProductIdByCode(req.query.product);
  if (!productId) return res.status(404).json({ error: 'product_not_found' });
  const rows = DB.listCredentials(productId).map(c => ({
    id: c.id,
    sn: c.sn,
    hardware_id: c.hardware_id,
    volcano_device_name: c.volcano_device_name,
    status: c.status,
    failure_reason: c.failure_reason,
    volcano_activated: !!c.volcano_device_secret,
    bound_user_phone: c.bound_user_phone,
    bound_user_has_email: !!c.bound_user_has_email,
    binding_id: c.binding_id,
    created_at: c.created_at,
  }));
  res.json(rows);
});

// 删除设备凭证（仅允许 provisioning / provisioning_failed 状态）
app.delete('/admin/api/credentials/:id', adminAuth, (req, res) => {
  try {
    DB.deleteCredential(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    const code = e.message;
    if (code === 'device_not_found') return res.status(404).json({ error: code });
    if (code === 'device_not_deletable') return res.status(409).json({ error: code });
    res.status(500).json({ error: 'delete_failed', reason: code });
  }
});

app.get('/admin/api/users', adminAuth, (req, res) => {
  const productId = DB.getProductIdByCode(req.query.product);
  if (!productId) return res.status(404).json({ error: 'product_not_found' });
  // 后台不返回 email，避免泄露；只返回 has_email 标记
  const rows = DB.listUsersByProduct(productId).map(u => ({
    id: u.id, product_id: u.product_id, phone: u.phone,
    has_email: !!u.email,
    email_verified: u.email_verified,
    created_at: u.created_at,
    device_count: u.device_count,
  }));
  res.json(rows);
});

app.delete('/admin/api/users/:id', adminAuth, (req, res) => {
  try {
    DB.deleteUser(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    if (e.message === 'user_not_found') return res.status(404).json({ error: e.message });
    res.status(500).json({ error: 'delete_failed', reason: e.message });
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
    const svc = DB.setCredentialServicePlan(id, plan, expires_at);
    res.json({ ok: true, service: svc });
  } catch (e) {
    if (e.message === 'service_not_found') return res.status(404).json({ error: e.message });
    res.status(500).json({ error: 'update_failed', reason: e.message });
  }
});

app.patch('/admin/api/credentials/:id/status', adminAuth, (req, res) => {
  DB.setCredentialStatus(Number(req.params.id), req.body.status);
  res.json({ ok: true });
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

// 管理员手动确认收款（线下支付场景）：原子标记已付款 + 触发续期
// 用 UPDATE changes 防止并发重复确认导致服务期被延长多次
app.patch('/admin/api/orders/:id/mark-paid', adminAuth, (req, res) => {
  const order = DB.getOrderById(Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'not_found' });
  if (order.status !== 'pending') return res.status(400).json({ error: 'order_not_pending' });

  const { changes } = DB.markOrderPaid(order.id);
  if (changes !== 1) return res.status(409).json({ error: 'order_already_paid' });

  // 只有真正抢占到付款操作的才延长服务期 + 标记待续火山 License
  DB.extendService(order.credential_id, order.user_id, order.years);
  DB.setOrderRenewStatus(order.id, 'pending');
  res.json({ ok: true, status: 'paid', provider_renew_status: 'pending' });
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
  if (!user) return res.status(401).json({ error: 'invalid_credentials' });
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
  if (!user) return res.status(401).json({ error: 'invalid_credentials' });
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
      credential_id: b.credential_id,
      sn: b.sn,
      hardware_id: b.hardware_id,
      nickname: b.nickname,
      cred_status: b.cred_status,
      plan: b.service_plan,                  // 设备级套餐
      service_expires_at: b.service_expires_at,
      service_renew_status: b.service_renew_status,
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
    const svc = DB.getServiceByCredential(b.credential_id);
    let service_status = 'none';
    if (svc) {
      service_status = new Date(svc.expires_at).getTime() > Date.now() ? 'active' : 'expired';
    }
    return {
      binding_id: b.id,
      credential_id: b.credential_id,
      sn: b.sn,
      hardware_id: b.hardware_id,
      nickname: b.nickname,
      bound_at: b.bound_at,
      last_seen_at: b.last_seen_at,
      status: b.cred_status,
      service_status,
      service_expires_at: svc ? svc.expires_at : null,
      provider_renew_status: svc ? svc.provider_renew_status : 'none',
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
app.post('/:product/api/devices/:bindingId/renew', userAuth, (req, res) => {
  const b = DB.getBindingById(Number(req.params.bindingId));
  if (!b || b.user_id !== req.user.uid) return res.status(404).json({ error: 'not_found' });

  const years = Number(req.body.years) || 1;
  if (years < 1 || years > 5) return res.status(400).json({ error: 'invalid_years' });

  const order = DB.createOrder({
    userId: req.user.uid,
    credentialId: b.credential_id,
    productId: req.user.pid,
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
app.post('/:product/api/device/bind/confirm', userAuth, (req, res) => {
  const { temp_token, nickname } = req.body;
  const t = DB.getBindToken(temp_token);
  if (!t) return res.status(400).json({ error: 'invalid_or_expired_token' });
  const tokenCredential = DB.getCredentialById(t.credential_id);
  if (!tokenCredential || tokenCredential.product_id !== req.user.pid) {
    return res.status(403).json({ error: 'product_mismatch' });
  }

  const existingBinding = DB.getBindingByCredential(t.credential_id);
  if (existingBinding) return res.status(409).json({ error: 'device_already_bound' });

  DB.confirmBindToken(temp_token);
  const binding = DB.createBinding(req.user.uid, t.credential_id, req.user.pid, nickname);
  // 阶段6.5：首次绑定自动创建第一年服务期（已存在则保留原 expires_at，仅更新持有人）
  const service = DB.createServiceForBinding(req.user.uid, t.credential_id, req.user.pid, 'annual');
  res.json({
    ok: true,
    binding_id: binding.id,
    credential_id: binding.credential_id,
    nickname: binding.nickname,
    service_expires_at: service.expires_at,
  });
});

// ==================== 设备：激活（核心改动②③⑧） ====================
// 设备用 eFuse 中的 FactoryKey 计算 HMAC，签名内容：v1|activate|hardware_id|timestamp|nonce
app.post('/:product/api/device/activate', async (req, res) => {
  const productId = DB.getProductIdByCode(req.params.product);
  if (!productId) return res.status(404).json({ error: 'product_not_found' });

  const { hardware_id, timestamp, nonce, signature } = req.body;
  if (!hardware_id || !timestamp || !nonce || !signature) {
    return res.status(400).json({ error: 'missing_params' });
  }

  const cred = DB.getCredentialByHardwareId(productId, hardware_id);
  if (!cred) return res.status(404).json({ error: 'device_not_provisioned' });
  if (['provisioning', 'provisioning_failed', 'retired'].includes(cred.status)) {
    return res.status(403).json({ error: 'device_not_provisioned', status: cred.status });
  }

  const factoryKey = DB.getDecryptedFactoryKey(cred);
  const v = verifySignature('activate', factoryKey, hardware_id, timestamp, nonce, signature);
  if (!v.ok) return res.status(401).json({ error: 'auth_failed', reason: v.reason });

  // 两项都齐全才可恢复；老设备只有 DeviceSecret 时重新 DynamicRegister
  // 补取 RTCAppID，固件无需清 NVS 或重新绑定。
  const existingSecret = DB.getDecryptedDeviceSecret(cred);
  const productConfig = DB.getProductConfig(productId);
  const existingRtcAppId = productConfig.rtc_app_id || '';
  if (existingSecret && existingRtcAppId) {
    // 老设备/erase_flash 恢复：直接下发原 device_secret，不重复 DynamicRegister
    return res.json({
      ok: true,
      recovered: true,
      sn: cred.sn,                                  // 顺便返回 SN，设备可缓存显示
      volcano_device_name: cred.volcano_device_name,
      device_secret: existingSecret,
      rtc_app_id: existingRtcAppId,
    });
  }

  // 首次激活：调火山 DynamicRegister
  if (!VOLCANO_ENABLED) {
    // 测试模式：返回假的 device_secret
    const fakeSecret = 'TEST_' + crypto.randomBytes(16).toString('hex');
    const fakeRtcAppId = 'TEST_RTC_APP_ID';
    const savedRtcAppId = DB.saveVolcanoCredentials(productId, cred.id, fakeSecret, fakeRtcAppId);
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

// ==================== 设备：状态查询（新增⑦ + v4 ⑩） ====================
// 设备在开启火山会话前必须先问平台：我是否已绑定 + 服务期是否有效
// 解绑后平台返回 bound=false，服务期过期返回 ai_allowed=false
app.post('/:product/api/device/status', (req, res) => {
  const productId = DB.getProductIdByCode(req.params.product);
  if (!productId) return res.status(404).json({ error: 'product_not_found' });

  const { hardware_id, timestamp, nonce, signature } = req.body;
  if (!hardware_id || !timestamp || !nonce || !signature) {
    return res.status(400).json({ error: 'missing_params' });
  }

  const cred = DB.getCredentialByHardwareId(productId, hardware_id);
  if (!cred) return res.status(404).json({ error: 'device_not_provisioned' });

  const factoryKey = DB.getDecryptedFactoryKey(cred);
  const v = verifySignature('status', factoryKey, hardware_id, timestamp, nonce, signature);
  if (!v.ok) return res.status(401).json({ error: 'auth_failed', reason: v.reason });

  const binding = DB.getBindingByCredential(cred.id);
  if (binding) DB.touchBindingSeen(binding.id);

  // 服务期状态：none / active / expired
  const service = DB.getServiceByCredential(cred.id);
  let service_status = 'none';
  let service_expires_at = null;
  if (service) {
    service_expires_at = service.expires_at;
    service_status = new Date(service.expires_at).getTime() > Date.now() ? 'active' : 'expired';
  }

  // 续费状态仅描述新 License 的处理进度；不能覆盖当前 License 的有效期。
  // 旧 License 未到期时，即使新续费 pending/processing/failed，设备仍可使用。
  const provider_expires_at = service ? service.provider_expires_at : null;
  const provider_available = !service
    || !provider_expires_at
    || new Date(provider_expires_at).getTime() > Date.now();

  // ai_allowed = 已绑定 + 平台服务期有效 + 当前供应商 License 有效。
  const ai_allowed = !!binding && service_status === 'active' && provider_available;

  res.json({
    ok: true,
    sn: cred.sn,
    bound: !!binding,
    nickname: binding ? binding.nickname : null,
    device_secret_ready: !!cred.volcano_device_secret,
    credential_status: cred.status,
    service_status,            // none / active / expired
    service_expires_at,        // ISO 时间
    ai_allowed,                // 综合判断：是否允许开火山会话
    provider_renew_status: service ? service.provider_renew_status : 'none',
    provider_expires_at,
    provider_available,        // 火山 License 是否可用（供设备显示提示）
  });
});

// ==================== 设备：生成绑定二维码（改动④：二维码只放 temp_token） ====================
app.post('/:product/api/device/bind/qrcode', (req, res) => {
  const productId = DB.getProductIdByCode(req.params.product);
  if (!productId) return res.status(404).json({ error: 'product_not_found' });

  const { hardware_id, timestamp, nonce, signature } = req.body;
  if (!hardware_id || !timestamp || !nonce || !signature) {
    return res.status(400).json({ error: 'missing_params' });
  }

  const cred = DB.getCredentialByHardwareId(productId, hardware_id);
  if (!cred) return res.status(404).json({ error: 'device_not_provisioned' });

  const factoryKey = DB.getDecryptedFactoryKey(cred);
  const v = verifySignature('qrcode', factoryKey, hardware_id, timestamp, nonce, signature);
  if (!v.ok) return res.status(401).json({ error: 'auth_failed', reason: v.reason });

  // 已绑定则不再生成二维码
  const existingBinding = DB.getBindingByCredential(cred.id);
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

  const { hardware_id, temp_token, timestamp, nonce, signature } = req.body;
  if (!hardware_id || !temp_token || !timestamp || !nonce || !signature) {
    return res.status(400).json({ error: 'missing_params' });
  }

  const cred = DB.getCredentialByHardwareId(productId, hardware_id);
  if (!cred) return res.status(404).json({ error: 'device_not_provisioned' });

  const factoryKey = DB.getDecryptedFactoryKey(cred);
  const v = verifySignature('poll', factoryKey, hardware_id, timestamp, nonce, signature);
  if (!v.ok) return res.status(401).json({ error: 'auth_failed', reason: v.reason });

  // poll 用 getBindTokenAnyStatus：confirmed 状态也要能查到
  const t = DB.getBindTokenAnyStatus(temp_token);
  if (!t || t.credential_id !== cred.id) {
    return res.json({ ok: true, status: 'pending' });
  }

  if (t.status === 'confirmed') {
    const binding = DB.getBindingByCredential(cred.id);
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
      DB.setServiceRenewStatus(order.credential_id, 'completed', {
        licenseId: result.license_id,
        providerExpiresAt: result.expires_at,
      });
      console.log(`[renew] order ${order.order_no} completed, license=${result.license_id}`);
    } catch (e) {
      DB.setOrderRenewStatus(order.id, 'failed', { error: e.message });
      DB.setServiceRenewStatus(order.credential_id, 'failed', { error: e.message });
      console.error(`[renew] order ${order.order_no} failed:`, e.message);
    }
  }
}, 10 * 1000);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[usermgr] v4 listening on :${PORT} (volcano_enabled=${VOLCANO_ENABLED})`);
  });
}

module.exports = { app, verifySignature, buildSignString, rateBuckets };
