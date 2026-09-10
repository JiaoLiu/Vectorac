// Vectorac 管理后台 SPA v4
// 改动：
//   - 出厂录入只填 hardware_id，SN 和 FactoryKey 由服务器生成
//   - 绑定表 device_name 改 nickname
//   - 新增 /admin/api/login 接口对接
// v4 新增：
//   - 订单查看 + 手动确认收款
//   - 设备服务期查看
const API = 'api';
const $ = (s) => document.querySelector(s);

const state = {
  token: localStorage.getItem('admin_token') || '',
  product: 'xiaov',
  view: '',
  products: [],
  credentials: [],
  users: [],
  bindings: [],
  orders: [],
  services: [],
  alert: null,
  modal: null,
  editProduct: null,
  editCredPlan: null,
  planSelected: null,
  planDropdown: false,
  orderModal: null,         // { type: 'markPaid'|'completeRenew'|'retryRenew', orderId, licenseId, busy }
  confirmLogout: false,
  productDropdown: false,
  // 通用确认 modal：{ title, message, confirmText, danger, onConfirm, busy }
  confirmModal: null,
  page: 1,                  // 列表分页：当前页（切换视图/产品时重置）
};

function setAlert(type, msg) { state.alert = { type, msg }; render(); }

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  const res = await fetch(API + path, { ...opts, headers });
  const body = await res.json().catch(() => ({ ok: false, error: { message: '网络错误' } }));
  if (!res.ok) throw new Error(body.message || body.error?.message || body.error || `HTTP ${res.status}`);
  return body.data || body;
}

function route() {
  const hash = location.hash.slice(1) || '/credentials';
  state.view = hash.split('?')[0];
  state.page = 1;
  if (!state.token && state.view !== '/login') { location.hash = '/login'; return; }
  render();
  if (state.view === '/products') loadProducts();
  if (state.view === '/credentials') { loadCredentials(); loadServices(); }
  if (state.view === '/users') loadUsers();
  if (state.view === '/bindings') loadBindings();
  if (state.view === '/orders') loadOrders();
  if (state.view === '/services') loadServices();
}

function switchProduct(code) {
  state.product = code;
  state.productDropdown = false;
  state.page = 1;
  render();
  if (state.view === '/credentials') loadCredentials();
  if (state.view === '/users') loadUsers();
  if (state.view === '/bindings') loadBindings();
  if (state.view === '/services') loadServices();
  if (state.view === '/orders') loadOrders();
}

window.addEventListener('hashchange', route);

// 已登录时初始化加载产品列表（供侧边栏选择器使用）
if (state.token) {
  api('/products').then(data => { state.products = data; render(); }).catch(() => {});
}

async function loadProducts() {
  try { state.products = await api('/products'); render(); } catch (e) { setAlert('error', e.message); }
}
async function loadCredentials() {
  try { state.credentials = await api('/credentials?product=' + state.product); render(); } catch (e) { setAlert('error', e.message); }
}
async function loadUsers() {
  try { state.users = await api('/users?product=' + state.product); render(); } catch (e) { setAlert('error', e.message); }
}
async function loadBindings() {
  try { state.bindings = await api('/bindings?product=' + state.product); render(); } catch (e) { setAlert('error', e.message); }
}
async function loadOrders() {
  try { state.orders = await api('/orders?product=' + state.product); render(); } catch (e) { setAlert('error', e.message); }
}
async function loadServices() {
  try { state.services = await api('/services?product=' + state.product); render(); } catch (e) { setAlert('error', e.message); }
}

function fmtAmount(cents) { return '¥' + (cents / 100).toFixed(2); }
function fmtDate(s) { return s ? s.replace('T', ' ').replace(/\.\d+Z?$/, '') : '—'; }

// ==================== 列表分页（纯前端切片，每页 20 条） ====================
const PAGE_SIZE = 20;
function pageSlice(list) {
  const total = (list || []).length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (state.page > pages) state.page = pages;   // 删除等操作后数据变少：收敛到最后一页
  const start = (state.page - 1) * PAGE_SIZE;
  return { rows: (list || []).slice(start, start + PAGE_SIZE), total, pages };
}
function pagerHtml(pg) {
  if (pg.pages <= 1) return pg.total ? `<p style="text-align:right;color:var(--text-muted);font-size:13px;margin:10px 4px 0">共 ${pg.total} 条</p>` : '';
  return `<div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;margin:14px 4px 0">
    <button ${state.page <= 1 ? 'disabled' : ''} onclick="goPage(${state.page - 1})">上一页</button>
    <span style="font-size:13px;color:var(--text-muted)">第 ${state.page} / ${pg.pages} 页 · 共 ${pg.total} 条</span>
    <button ${state.page >= pg.pages ? 'disabled' : ''} onclick="goPage(${state.page + 1})">下一页</button>
  </div>`;
}
function goPage(n) { state.page = Math.max(1, n); render(); }

// 管理员手动确认收款（线下支付场景）
function markOrderPaid(id) {
  state.orderModal = { type: 'markPaid', orderId: id, busy: false };
  render();
}

async function submitMarkOrderPaid() {
  const m = state.orderModal;
  if (!m || m.busy) return;
  m.busy = true; render();
  try {
    const r = await api('/orders/' + m.orderId + '/mark-paid', { method: 'PATCH' });
    setAlert('success', '已确认收款：平台服务期已延长' +
      (r.service_expires_at ? '至 ' + String(r.service_expires_at).replace('T',' ').replace(/\.\d+Z?$/,'') : '') +
      '，并为该设备自动预留新 SN「' + (r.reserved_sn || '—') + '」（待火山激活）。' +
      '当前 SN 未切换——请在"设备凭证"页将新 SN 设为下次上线，设备上线激活后即获得新一年 License。');
    state.orderModal = null;
    loadOrders();
  } catch (e) { setAlert('error', e.message); m.busy = false; render(); }
}

// 作废并重新分配订单预留 SN（独立于"确认收款"；已付款订单重复确认不会补 SN）：
// 当前预留 SN 作废（retired，记录保留并写入订单替代历史），用独立幂等键预留替代 SN。
// request_id 每次操作新生成：响应丢失后重试复用同一 ID，返回同一替代 SN，不重复作废。
function reallocateReservedSn(id, orderNo) {
  const requestId = (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'rlc-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  askConfirm({
    title: '作废并重新分配预留 SN',
    message: `订单「${orderNo}」当前预留的 SN 将被作废（记录保留，写入订单替代历史），` +
      '并为其重新预留一个替代 SN（待火山激活）。当前使用的 SN 不受影响，切换仍需在"设备凭证"页手动指定。',
    confirmText: '作废并重新分配',
    onConfirm: async () => {
      const r = await api('/orders/' + id + '/reallocate-sn', {
        method: 'POST',
        body: JSON.stringify({ request_id: requestId }),
      });
      setAlert('success', (r.reserved_reused ? '该次重新分配已存在（幂等重放）：' : '已作废' + (r.voided_sn ? '「' + r.voided_sn + '」并' : '') + '重新分配：') +
        '替代 SN「' + r.reserved_sn + '」（待火山激活）。请在"设备凭证"页将其设为下次上线。');
      loadOrders();
    },
  });
}

// 管理员人工完成续期：在火山控制台手动购买 License + 绑定设备后确认
function completeRenew(id) {
  state.orderModal = { type: 'completeRenew', orderId: id, licenseId: '', busy: false };
  render();
}

async function submitCompleteRenew() {
  const m = state.orderModal;
  if (!m || m.busy) return;
  m.busy = true; render();
  try {
    const r = await api('/orders/' + m.orderId + '/complete-renew', {
      method: 'POST',
      body: JSON.stringify({ license_id: (m.licenseId || '').trim() }),
    });
    setAlert('success', '续期已完成' + (r.license_id ? '，License=' + r.license_id : ''));
    state.orderModal = null;
    loadOrders();
  } catch (e) { setAlert('error', e.message); m.busy = false; render(); }
}

// 管理员重试续期（failed → pending）
function retryRenew(id) {
  state.orderModal = { type: 'retryRenew', orderId: id, busy: false };
  render();
}

async function submitRetryRenew() {
  const m = state.orderModal;
  if (!m || m.busy) return;
  m.busy = true; render();
  try {
    await api('/orders/' + m.orderId + '/retry-renew', { method: 'POST' });
    setAlert('success', '已重置为 pending，等待重新处理');
    state.orderModal = null;
    loadOrders();
  } catch (e) { setAlert('error', e.message); m.busy = false; render(); }
}

// 删除订单
// paid 且续期未完成（pending/processing/failed）的订单服务端拒绝删除，前端也不显示删除按钮
function deleteOrder(id, orderNo, paid) {
  askConfirm({
    title: '删除订单',
    message: paid
      ? `订单「${orderNo}」已付款。删除后将丢失本次收款与续费的审计记录（License ID、操作人、完成时间），且不可恢复。确认删除？`
      : `确认删除订单「${orderNo}」？删除后不可恢复。`,
    confirmText: '确认删除',
    onConfirm: async () => {
      await api('/orders/' + id, { method: 'DELETE' });
      setAlert('success', '订单已删除');
      loadOrders();
    },
  });
}

function closeOrderModal() {
  state.orderModal = null;
  render();
}

function logout() { state.token = ''; state.confirmLogout = false; localStorage.removeItem('admin_token'); location.hash = '/login'; }

// 通用自定义确认弹窗（替换浏览器原生 confirm）
// input: { placeholder, value } 可选——弹窗内显示单个输入框，值经 onConfirm(value) 传回
// inputs: [{ id, label, placeholder, value, type }] 可选——多个输入框，值经 onConfirm(values) 以 {id: value} 传回
function askConfirm({ title, message, confirmText = '确认', danger = true, input = null, inputs = null, onConfirm }) {
  state.confirmModal = { title, message, confirmText, danger, input, inputs, onConfirm, busy: false };
  render();
}

async function submitConfirm() {
  const m = state.confirmModal;
  if (!m || m.busy) return;
  let inputValue;
  if (m.inputs) {
    inputValue = {};
    for (const f of m.inputs) {
      const el = document.getElementById('confirmInput_' + f.id);
      inputValue[f.id] = el ? el.value : undefined;
    }
  } else {
    inputValue = m.input ? (document.getElementById('confirmInput') || {}).value : undefined;
  }
  m.busy = true; render();
  try {
    await m.onConfirm(inputValue);
    state.confirmModal = null;
  } catch (e) {
    setAlert('error', e.message);
    m.busy = false; render();
  }
}

function closeConfirm() {
  state.confirmModal = null;
  render();
}

// 删除设备凭证（仅限"从未激活且无订单"的 SN，服务端强制校验，按钮按 can_delete 显示）
function deleteCred(id) {
  const c = state.credentials.find(x => x.id === id);
  askConfirm({
    title: '删除设备凭证',
    message: `将删除未激活的 SN「${c ? c.sn : ''}」，此操作不可撤销。` +
      '用户绑定与平台服务期挂在物理设备（MAC）上，不受删除影响。' +
      (c && c.ever_activated ? '注意：该 SN 已激活过，正常情况下不应出现删除入口。' : ''),
    confirmText: '确认删除',
    onConfirm: async () => {
      await api('/credentials/' + id, { method: 'DELETE' });
      setAlert('success', '已删除');
      loadCredentials();
    },
  });
}

// 作废未激活但已关联订单的 SN（保留订单历史），作废后可预留替代 SN。
// 作废 = 状态置为 retired（终态）；换回旧 SN 不需要恢复，用"下次使用"即可。
function voidCred(id) {
  const c = state.credentials.find(x => x.id === id);
  askConfirm({
    title: '作废 SN',
    message: `将作废 SN「${c ? c.sn : ''}」。该 SN 已关联订单，作废保留订单历史；` +
      '如需替代 SN，请用"预留新 SN"重新生成。作废的 SN 不能再被设备激活。',
    confirmText: '确认作废',
    danger: true,
    onConfirm: async () => {
      await api('/credentials/' + id + '/status', { method: 'PATCH', body: JSON.stringify({ status: 'retired' }) });
      setAlert('success', '已作废（保留订单历史）。如需替代 SN，请使用"预留新 SN"');
      loadCredentials();
    },
  });
}

// 指定"下次上线使用的 SN"（管理员选择，设备无感知）。
// 目标可以是"待火山激活"或"已激活"的 SN；纯选择操作：不搬绑定、不清权益、不受订单影响。
// 设备下次不带 SN 激活时返回所选 SN 的凭证（新 SN 走首次火山注册，旧 SN 返回已存密钥）。
// 选择保持粘性直到管理员再次改选；无需"立即转正"——首次激活是设备上线后的操作。
function setPrimaryCred(id) {
  const target = state.credentials.find(x => x.id === id);
  askConfirm({
    title: '指定下次上线 SN',
    message: `将「${target ? target.sn : ''}」指定为该设备下次上线使用的凭证？` +
      '设备下次不带 SN 激活时即返回该 SN 的凭证；选择保持粘性直到再次改选。' +
      '用户绑定、平台服务期与历史订单不因选择变化而被搬迁或清空。',
    confirmText: '确认指定',
    danger: false,
    onConfirm: async () => {
      const r = await api('/credentials/' + id + '/primary', { method: 'PATCH' });
      setAlert('success', '已指定下次上线 SN：' + (r.sn || '') + '（设备下次上线激活时生效）');
      loadCredentials();
    },
  });
}

// 为已有设备预留新 SN（平台行为，不依赖火山、不重新烧录 eFuse）：
// 复用物理设备身份与共享 FactoryKey；新 SN 初始为"待火山激活"，
// 预留后可在下方直接"设为下次上线"，设备上线激活时才请求火山。
function reserveSnDialog() {
  // 幂等：同一弹窗内重试复用同一 request_id（响应丢失后重试不会重复生成 SN）
  const requestId = (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'rsv-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  askConfirm({
    title: '为设备预留新 SN',
    message: '输入已出厂设备的 HardwareID（MAC）。平台将复用其共享 FactoryKey 生成新 SN，' +
      '不请求火山、不重新烧录；新 SN 初始为"待火山激活"。',
    confirmText: '预留',
    danger: false,
    input: { placeholder: '如 AC:A7:04:28:C9:10', value: '' },
    onConfirm: async (hwid) => {
      const r = await api('/devices/reserve-sn', {
        method: 'POST',
        body: JSON.stringify({ product: state.product, hardware_id: (hwid || '').trim(), request_id: requestId }),
      });
      setAlert('success', (r.reused ? '该次预留已存在（幂等重放）：' : '已为新设备预留 SN：') + r.sn + '（待火山激活）');
      loadCredentials();
    },
  });
}

// 火山权益按"实际激活后一年、火山控制"自动记录（激活即写入到期时间，来源=激活推算）；
// 不再需要人工确认关卡。权益列只读展示状态/License ID/到期时间。

// 删除用户 = 账号注销（软删除）：绑定解除，设备/服务期/订单审计保留，
// 原手机号释放可重新注册；已注销账号不能再登录。
function deleteUser(id) {
  askConfirm({
    title: '注销账号',
    message: '将注销该账号：设备绑定解除，但设备、SN、剩余服务期和订单历史全部保留' +
      '（订单按注销账号关联审计）。原手机号释放，可重新注册。注销后不可登录。',
    confirmText: '确认注销',
    danger: true,
    onConfirm: async () => {
      await api('/users/' + id, { method: 'DELETE' });
      setAlert('success', '账号已注销（绑定已解除，设备与服务期保留，订单历史保留）');
      loadUsers();
    },
  });
}

async function saveProductConfig(id) {
  const body = {
    instance_id: $('#edit-instance-id').value.trim(),
    product_key: $('#edit-product-key').value.trim(),
    bot_id: $('#edit-bot-id').value.trim(),
  };
  const secret = $('#edit-product-secret').value.trim();
  if (secret) body.product_secret = secret;
  try {
    await api('/products/' + id, { method: 'PATCH', body: JSON.stringify(body) });
    state.editProduct = null;
    setAlert('success', '产品配置已更新');
    loadProducts();
  } catch (e) { setAlert('error', e.message); }
}

// 创建新产品（首次部署用）
async function createProduct() {
  const code = $('#edit-product-code').value.trim();
  const name = $('#edit-product-name').value.trim();
  const sn_prefix = $('#edit-sn-prefix').value.trim();
  const instance_id = $('#edit-instance-id').value.trim();
  const product_key = $('#edit-product-key').value.trim();
  const product_secret = $('#edit-product-secret').value.trim();
  const bot_id = $('#edit-bot-id').value.trim();

  const err = (msg) => {
    // 校验失败：只更新 modal 内错误条，不触发整页 render（避免清空输入）
    const box = document.getElementById('create-product-error');
    if (box) { box.textContent = msg; box.style.display = 'block'; }
  };
  // 清除旧错误
  const oldBox = document.getElementById('create-product-error');
  if (oldBox) oldBox.style.display = 'none';

  if (!code || !/^[a-z][a-z0-9_]{1,30}$/.test(code)) {
    return err('产品代码必须是小写字母开头，字母数字下划线，2-30 字符');
  }
  if (!name) return err('请填写产品名称');
  if (!sn_prefix) return err('请填写 SN 前缀');

  try {
    await api('/products', {
      method: 'POST',
      body: JSON.stringify({ code, name, sn_prefix, instance_id, product_key, product_secret, bot_id }),
    });
    state.editProduct = null;
    setAlert('success', `产品 ${code} 创建成功`);
    loadProducts();
  } catch (e) {
    err(e.message);
  }
}

// 删除产品（防止 code 写错后无法删）
function deleteProduct(id, code) {
  askConfirm({
    title: '删除产品',
    message: `确定删除产品「${code}」？该产品下的设备、绑定、订单数据不会被删除但将变为「孤儿」（无对应产品路由）。此操作不可撤销。`,
    confirmText: '确认删除',
    onConfirm: async () => {
      await api('/products/' + id, { method: 'DELETE' });
      setAlert('success', '产品已删除');
      loadProducts();
    },
  });
}

async function updateCredPlan(credId) {
  state.editCredPlan = credId;
  state.planSelected = null;
  state.planDropdown = false;
  render();
  // 服务期挂物理设备（MAC）：按 hardware_id 匹配
  const cred = state.credentials.find(x => x.id === credId);
  const svc = (state.services || []).find(s => s.hardware_id === (cred && cred.hardware_id));
  state.planSelected = (svc && svc.plan) || 'annual';
  render();
}

function togglePlanDropdown() {
  state.planDropdown = !state.planDropdown;
  render();
}

function selectPlan(plan) {
  state.planSelected = plan;
  state.planDropdown = false;
  render();
}

async function saveCredPlan(credId) {
  const plan = state.planSelected || 'annual';
  const expires = $('#plan-expires').value;
  const err = (msg) => {
    const box = document.getElementById('save-plan-error');
    if (box) { box.textContent = msg; box.style.display = 'block'; }
  };
  const oldBox = document.getElementById('save-plan-error');
  if (oldBox) oldBox.style.display = 'none';
  if (!expires) return err('请选择到期日期');
  try {
    await api('/credentials/' + credId + '/service', {
      method: 'PATCH',
      body: JSON.stringify({ plan, expires_at: expires }),
    });
    state.editCredPlan = null;
    state.planSelected = null;
    state.planDropdown = false;
    setAlert('success', '设备套餐已更新');
    loadServices();
  } catch (e) {
    err(e.message);
  }
}

async function updateCredStatus(id, status) {
  try {
    await api('/credentials/' + id + '/status', { method: 'PATCH', body: JSON.stringify({ status }) });
    setAlert('success', '状态已更新');
    loadCredentials();
  } catch (e) { setAlert('error', e.message); }
}

function deleteBinding(id) {
  askConfirm({
    title: '删除绑定关系',
    message: '设备凭证不删除，仅解除该用户与设备的绑定。用户需在设备上重新扫码绑定。',
    confirmText: '确认解绑',
    onConfirm: async () => {
      await api('/bindings/' + id, { method: 'DELETE' });
      loadBindings();
    },
  });
}

function render() {
  let html = '';
  if (state.view === '/login') {
    html = `
      <div style="max-width:380px;margin:80px auto;padding:16px">
        <div style="text-align:center;margin-bottom:24px">
          <img src="logo.png" alt="Vectorac" style="width:64px;height:64px;object-fit:contain;margin:0 auto 16px;display:block;border-radius:12px">
          <h2 style="font-size:22px;color:#e6edf3;margin-bottom:4px">Vectorac 管理后台</h2>
          <p style="color:#7d8590;font-size:14px">输入管理员密码登录</p>
        </div>
        <div class="card">
          <form onsubmit="event.preventDefault(); doLogin($('#password').value)">
            <input id="password" type="password" placeholder="管理员密码" style="width:100%;margin-bottom:14px" autofocus />
            <button class="primary" type="submit" style="width:100%;justify-content:center">登录</button>
          </form>
        </div>
      </div>`;
    $('#app').innerHTML = html;
    return;
  }

  const currentProduct = state.products.find(p => p.code === state.product);
  const productItems = state.products.map(p =>
    `<a href="#" class="${p.code === state.product ? 'on' : ''}" onclick="switchProduct('${p.code}');return false">${p.name}（${p.code}）</a>`
  ).join('');

  const nav = `
    <div class="sidebar">
      <div class="brand"><span class="dot"></span>Vectorac 管理</div>
      <nav>
        <div class="nav-section">
          <div class="nav-label">当前产品</div>
          <div class="product-dropdown">
            <button class="product-trigger" onclick="state.productDropdown=!state.productDropdown;render()">
              <span>${currentProduct ? currentProduct.name + '（' + currentProduct.code + '）' : '选择产品'}</span>
              <svg class="chevron ${state.productDropdown ? 'up' : ''}" width="14" height="14" viewBox="0 0 14 14"><path d="M3.5 5l3.5 4 3.5-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            ${state.productDropdown ? `
              <div class="product-menu" onclick="event.stopPropagation()">
                ${productItems || '<div class="product-menu-empty">暂无产品</div>'}
              </div>
              <div class="dropdown-mask" onclick="state.productDropdown=false;render()"></div>
            ` : ''}
          </div>
        </div>
        <div class="nav-section">
          <a href="#/credentials" class="${state.view === '/credentials' ? 'on' : ''}">设备凭证</a>
          <a href="#/users" class="${state.view === '/users' ? 'on' : ''}">用户</a>
          <a href="#/bindings" class="${state.view === '/bindings' ? 'on' : ''}">绑定关系</a>
          <a href="#/services" class="${state.view === '/services' ? 'on' : ''}">服务期</a>
          <a href="#/orders" class="${state.view === '/orders' ? 'on' : ''}">订单</a>
        </div>
        <div class="nav-section">
          <div class="nav-label">系统</div>
          <a href="#/products" class="${state.view === '/products' ? 'on' : ''}">产品配置</a>
          <a href="#" onclick="state.confirmLogout=true;render()">退出</a>
        </div>
      </nav>
    </div>`;

  let main = '';
  if (state.alert) main += `<div class="alert ${state.alert.type}">${state.alert.msg}</div>`;

  if (state.view === '/products') {
    main += `
      <div class="row" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h1>产品配置</h1>
        <button class="primary" onclick="state.editProduct='new';render()">+ 添加产品</button>
      </div>
      <div class="card">
        <table>
          <thead><tr><th>ID</th><th>代码</th><th>名称</th><th>SN前缀</th><th>InstanceID</th><th>ProductKey</th><th>BotID</th><th>操作</th></tr></thead>
          <tbody>
            ${state.products.map(p => `
              <tr>
                <td>${p.id}</td>
                <td>${p.code}</td>
                <td>${p.name}</td>
                <td>${p.sn_prefix || '—'}</td>
                <td>${p.instance_id ? '✓ 已配置' : '<span class="badge">未配置</span>'}</td>
                <td>${p.product_key ? '✓' : '—'}</td>
                <td>${p.bot_id ? '✓' : '—'}</td>
                <td>
                  <button onclick="state.editProduct=${p.id};render()">配置火山</button>
                  <button class="danger" onclick="deleteProduct(${p.id}, '${p.code}')" style="margin-left:4px">删除</button>
                </td>
              </tr>
            `).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:32px">暂无产品，点击右上「+ 添加产品」创建</td></tr>'}
          </tbody>
        </table>
      </div>`;
  } else if (state.view === '/credentials') {
    const statusBadge = (s) => {
      const map = {
        provisioning: '<span class="badge" style="background:rgba(251,191,36,.15);color:#fbbf24">烧录中</span>',
        provisioned: '<span class="badge" style="background:rgba(251,191,36,.15);color:#fbbf24" title="已出厂/已预留，等待设备上线激活火山">待火山激活</span>',
        provisioning_failed: '<span class="badge disabled">烧录失败</span>',
        volcano_registered: '<span class="badge active">已激活</span>',
        retired: '<span class="badge disabled">已退役</span>',
      };
      return map[s] || `<span class="badge">${s}</span>`;
    };
    const pgCred = pageSlice(state.credentials);
    main += `
      <div class="row">
        <h1>设备凭证（${state.product}）</h1>
        <button class="primary" onclick="reserveSnDialog()" title="为已出厂设备预留新 SN：复用 FactoryKey，不请求火山、不重新烧录">+ 预留新 SN</button>
      </div>
      <div class="card">
        <table>
          <thead><tr><th>SN</th><th>HardwareID</th><th>状态</th><th>套餐</th><th>服务到期</th><th>火山激活</th><th>火山权益</th><th>绑定用户</th><th>录入时间</th><th>操作</th></tr></thead>
          <tbody>
            ${pgCred.total === 0 ? '<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:32px">暂无设备。出厂录入由烧录工具自动完成。</td></tr>' : pgCred.rows.map(c => {
              // 绑定/服务期挂物理设备（MAC）：按 hardware_id 匹配，同一 MAC 的所有 SN 显示相同服务期
              const svc = (state.services || []).find(s => s.hardware_id === c.hardware_id);
              const planLabel = svc ? (svc.plan === 'annual' ? '年卡' : svc.plan) : '—';
              const exp = svc ? svc.expires_at : null;
              const now = Date.now();
              const expired = exp && new Date(exp).getTime() < now;
              const expLabel = exp ? exp.replace('T',' ').replace(/\.\d+Z?$/,'') : '—';
              const expColor = !exp ? 'var(--text-muted)' : (expired ? 'var(--danger)' : 'var(--primary)');
              // 同一 MAC 有多个 SN 时显示选择入口；徽标区分"后台选定"与"最近激活"
              const sameMac = state.credentials.filter(x => x.hardware_id && x.hardware_id === c.hardware_id);
              const multiSn = sameMac.length > 1;
              const selectBadge = c.primary_pending
                ? ` <span class="badge" style="background:rgba(251,191,36,.15);color:#fbbf24" title="管理员选定的下次上线 SN：设备下次不带 SN 激活时返回该凭证">后台选定</span>`
                : '';
              const activeBadge = c.is_primary
                ? ` <span class="badge active" title="最近一次激活返回给设备的凭证（设备端缓存与此一致）">最近激活</span>`
                : '';
              const canSelect = !c.primary_pending && (c.status === 'provisioned' || c.status === 'volcano_registered') && (multiSn || !c.is_primary);
              const selectBtn = canSelect
                ? ` <button onclick="setPrimaryCred(${c.id})" title="指定为下次上线使用的 SN（可随时切回任意未停用的旧 SN）">设为下次上线</button>`
                : '';
              // 火山权益按"实际激活后一年"自动记录（来源=激活推算，火山控制）：
              // completed+无 License ID = 激活推算到期；completed+License ID = 真实续期录入；
              // none = 旧数据无权益记录（兼容口径视为可用）。人工确认关卡已撤销。
              const rightsBadge = (rs) => {
                const map = {
                  completed: '<span class="badge active" title="实际激活即获得一年 License（按激活时间推算到期；真实续期后为火山实际到期时间）">有效</span>',
                  pending: '<span class="badge" style="background:rgba(251,191,36,.15);color:#fbbf24">续期处理中</span>',
                  processing: '<span class="badge" style="background:rgba(251,191,36,.15);color:#fbbf24">续期处理中</span>',
                  failed: '<span class="badge disabled" title="最近一次续期失败">续期失败</span>',
                  superseded: '<span class="badge" style="background:rgba(148,163,184,.15);color:#94a3b8" title="已改由新 SN 激活获得一年 License，原 SN 无需购买续期">已替代</span>',
                };
                return rs ? (map[rs] || `<span class="badge">${rs}</span>`) : '<span style="color:var(--text-muted)" title="旧数据无权益记录，按兼容口径视为可用">—</span>';
              };
              const rightsExp = c.provider_expires_at ? String(c.provider_expires_at).replace('T',' ').replace(/\.\d+Z?$/,'') : '';
              const rightsExpired = rightsExp && new Date(rightsExp).getTime() < Date.now();
              return `
              <tr>
                <td><code>${c.sn}</code>${selectBadge}${activeBadge}${selectBtn}</td>
                <td>${c.hardware_id || '—'}</td>
                <td>${statusBadge(c.status)}${c.failure_reason ? `<br><small style="color:var(--danger)">${c.failure_reason}</small>` : ''}</td>
                <td><span class="badge ${svc ? svc.plan : ''}">${planLabel}</span></td>
                <td style="color:${expColor};font-size:12px">${expLabel}${expired ? '<br><small>已过期</small>' : ''}</td>
                <td>${c.volcano_activated ? '✓' : '—'}</td>
                <td style="font-size:12px">
                  ${rightsBadge(c.provider_renew_status)}
                  ${c.provider_license_id ? `<br><code style="font-size:11px">${c.provider_license_id}</code>` : ''}
                  ${rightsExp ? `<br><span style="color:${rightsExpired ? 'var(--danger)' : 'var(--text-muted)'}" title="来源：实际激活时间 +1 年（展示推算，火山控制）">${rightsExp}${rightsExpired ? '（已过期）' : ''}</span>` : ''}
                </td>
                <td>${c.bound_user_phone ? `<code>${c.bound_user_phone}</code>${c.bound_user_has_email ? '<br><small style="color:var(--text-muted)">邮箱已填</small>' : ''}` : '—'}</td>
                <td>${c.created_at || '—'}</td>
                <td>
                  ${c.status !== 'provisioning' && c.status !== 'provisioning_failed' && c.status !== 'retired' ? `<button onclick="updateCredPlan(${c.id})">改套餐</button> ` : ''}
                  ${c.can_delete ? `<button class="danger" onclick="deleteCred(${c.id})">删除</button>` : ''}
                  ${c.can_void ? `<button class="danger" onclick="voidCred(${c.id})" title="${c.delete_block_reason || ''}">作废</button>` : ''}
                  ${(!c.can_delete && !c.can_void && c.delete_block_reason && (c.ever_activated || c.status === 'retired'))
                    ? `<details style="display:inline-block"><summary style="cursor:pointer;font-size:12px;color:var(--text-muted)">高级</summary>
                        <div style="margin-top:4px">
                          ${c.status === 'retired'
                            ? `<button onclick="updateCredStatus(${c.id},'provisioned')">恢复为待激活</button>`
                            : `<button class="danger" onclick="updateCredStatus(${c.id},'retired')">退役停用</button>`}
                        </div></details>` : ''}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        ${pagerHtml(pgCred)}
      </div>`;
  } else if (state.view === '/users') {
    const pgUsers = pageSlice(state.users);
    main += `
      <div class="row"><h1>用户（${state.product}）</h1></div>
      <div class="card">
        <table>
          <thead><tr><th>ID</th><th>手机号</th><th>邮箱</th><th>已绑设备</th><th>验证</th><th>注册时间</th><th>操作</th></tr></thead>
          <tbody>
            ${pgUsers.rows.map(u => `
              <tr${u.deleted ? ' style="opacity:.55"' : ''}>
                <td>${u.id}</td>
                <td><code>${u.phone || '—'}</code>${u.deleted ? ' <span class="badge disabled" title="账号已注销：绑定已解除，设备/服务期/订单历史保留，原手机号已释放">已注销</span>' : ''}</td>
                <td>${u.has_email ? '<span class="badge">已填</span>' : '<span style="color:var(--text-muted)">未填</span>'}</td>
                <td>${u.device_count != null ? u.device_count + ' 台' : '—'}</td>
                <td>${u.email_verified ? '✓' : '—'}</td>
                <td>${u.created_at || '—'}</td>
                <td>${u.deleted
                  ? '<span style="color:var(--text-muted);font-size:12px">已注销</span>'
                  : `<button class="danger" onclick="deleteUser(${u.id})">注销</button>`}</td>
              </tr>
            `).join('') || '<tr><td colspan="7" style="color:#888">暂无</td></tr>'}
          </tbody>
        </table>
        ${pagerHtml(pgUsers)}
      </div>`;
  } else if (state.view === '/bindings') {
    const pgBind = pageSlice(state.bindings);
    main += `
      <div class="row"><h1>绑定关系（${state.product}）</h1></div>
      <div class="card">
        <table>
          <thead><tr><th>ID</th><th>用户</th><th>SN</th><th>HardwareID</th><th>火山设备名</th><th>昵称</th><th>绑定时间</th><th>最近活跃</th><th>操作</th></tr></thead>
          <tbody>
            ${pgBind.rows.map(b => `
              <tr>
                <td>${b.id}</td>
                <td><code>${b.user_phone || '—'}</code></td>
                <td><code>${b.sn}</code></td>
                <td>${b.hardware_id || '—'}</td>
                <td>${b.volcano_device_name}</td>
                <td>${b.nickname || '—'}</td>
                <td>${b.bound_at || '—'}</td>
                <td>${b.last_seen_at || '—'}</td>
                <td><button class="danger" onclick="deleteBinding(${b.id})">解绑</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${pagerHtml(pgBind)}
      </div>`;
  } else if (state.view === '/services') {
    const pgSvc = pageSlice(state.services);
    main += `
      <div class="row"><h1>设备服务期（${state.product}）</h1></div>
      <div class="card">
        <table>
          <thead><tr><th>ID</th><th>SN</th><th>HardwareID</th><th>火山设备名</th><th>持有人</th><th>开始</th><th>到期</th><th>续期状态</th><th>License</th></tr></thead>
          <tbody>
            ${pgSvc.rows.map(s => `
              <tr>
                <td>${s.id}</td>
                <td><code>${s.sn}</code></td>
                <td>${s.hardware_id || '—'}</td>
                <td>${s.volcano_device_name || '—'}</td>
                <td><code>${s.user_phone || '—'}</code></td>
                <td>${fmtDate(s.start_at)}</td>
                <td>${fmtDate(s.expires_at)}</td>
                <td><span class="badge ${s.provider_renew_status === 'completed' ? 'active' : s.provider_renew_status === 'failed' ? 'disabled' : ''}">${s.provider_renew_status || 'none'}</span></td>
                <td>${s.provider_license_id || '—'}</td>
              </tr>
            `).join('') || '<tr><td colspan="9" style="color:#888">暂无</td></tr>'}
          </tbody>
        </table>
        ${pagerHtml(pgSvc)}
      </div>`;
  } else if (state.view === '/orders') {
    const pgOrd = pageSlice(state.orders);
    main += `
      <div class="row"><h1>订单（${state.product}）</h1></div>
      <div class="card">
        <p style="color:#888;font-size:13px;margin:8px 0 16px">人工转账流程：用户提交转账凭证后状态显示"待审核"，核对凭证无误后点"确认收款"——平台服务期自动延长，并为设备自动预留新 SN（不切换当前 SN，由管理员在"设备凭证"页选择下次上线）。</p>
        <table>
          <thead><tr><th>ID</th><th>订单号</th><th>用户</th><th>SN</th><th>预留 SN</th><th>金额</th><th>年限</th><th>状态</th><th>转账凭证</th><th>续期</th><th>创建时间</th><th>操作</th></tr></thead>
          <tbody>
            ${pgOrd.rows.map(o => {
              const statusLabel = o.status === 'paid' ? '已付款' : (o.status === 'pending' && o.voucher_text ? '待审核' : (o.status === 'pending' ? '待付款' : o.status));
              return `
              <tr>
                <td><code>${o.id}</code></td>
                <td><code>${o.order_no}</code></td>
                <td><code>${o.user_phone || '—'}</code>${o.user_deleted ? ' <span class="badge disabled" title="订单历史按注销账号保留审计">已注销</span>' : ''}</td>
                <td><code>${o.sn}</code></td>
                <td>${o.reserved_sn ? `<code>${o.reserved_sn}</code> <span class="badge" style="background:rgba(251,191,36,.15);color:#fbbf24" title="确认收款时自动预留的新 SN，待设备激活获得新一年 License">待激活</span>` : '—'}</td>
                <td>${fmtAmount(o.amount)}</td>
                <td>${o.years}年</td>
                <td><span class="badge ${o.status === 'paid' ? 'active' : (o.status === 'pending' && o.voucher_text ? '' : 'disabled')}">${statusLabel}</span></td>
                <td>${o.voucher_text ? `<small>${o.voucher_text}</small><br><small style="color:#888">${fmtDate(o.voucher_submitted_at)}</small>` : '<span style="color:#888">—</span>'}</td>
                <td>${o.provider_renew_status === 'superseded' ? '已由新SN替代' : o.provider_renew_status}${o.provider_renew_error ? '<br><small style="color:#c00">' + o.provider_renew_error + '</small>' : ''}</td>
                <td>${fmtDate(o.created_at)}</td>
                <td>${
                  o.status === 'pending'
                    ? `<button class="primary" onclick="markOrderPaid(${o.id})">确认收款</button> <button class="danger" onclick="deleteOrder(${o.id}, '${o.order_no}')">删除</button>`
                    : ((o.status === 'paid' && ['pending', 'processing', 'failed'].includes(o.provider_renew_status))
                        ? `<button class="primary" onclick="completeRenew(${o.id})">完成续期</button>` +
                          (o.provider_renew_status === 'failed' ? ` <button onclick="retryRenew(${o.id})">重试</button>` : '')
                        : '') +
                      // 新流程订单（确认收款自动预留 SN）：预留 SN 有问题（错发/损坏）时
                      // "作废并重新分配"——旧预留作废保留历史，独立幂等键预留替代 SN
                      ((o.status === 'paid' && o.renew_mode === 'new_sn')
                        ? ` <button onclick="reallocateReservedSn(${o.id}, '${o.order_no}')">重新分配</button>`
                        : '') +
                      // 已付款且续期未完成的订单不可删（服务端强制），其余已付款订单删除前有审计提示；
                      // 有"作废并重新分配"历史的订单一律保留审计记录，不显示删除按钮
                      ((o.status === 'paid' && ['pending', 'processing', 'failed'].includes(o.provider_renew_status))
                        ? ''
                        : (o.has_realloc_history
                            ? '<span class="badge disabled" title="该订单存在「作废并重新分配」历史（关联审计与幂等重放记录），不能删除">有替代历史</span>'
                            : `<button class="danger" onclick="deleteOrder(${o.id}, '${o.order_no}', ${o.status === 'paid'})">删除</button>`))
                }</td>
              </tr>`;
            }).join('') || '<tr><td colspan="12" style="color:#888">暂无</td></tr>'}
          </tbody>
        </table>
        ${pagerHtml(pgOrd)}
      </div>`;
  }

  if (state.editProduct) {
    const isNew = state.editProduct === 'new';
    const p = isNew ? null : state.products.find(x => x.id === state.editProduct);
    if (isNew || p) {
      const title = isNew ? '添加新产品' : `配置火山 — ${p.name}（${p.code}）`;
      const v = isNew ? { instance_id:'', product_key:'', product_secret:'', bot_id:'' } : p;
      main += `
      <div class="modal" onclick="event.stopPropagation()">
        <div class="modal-content">
          <h3>${title}</h3>
          ${isNew ? `<div id="create-product-error" style="display:none;background:rgba(229,62,62,.08);border:1px solid rgba(229,62,62,.25);border-radius:8px;padding:8px 12px;margin:0 0 14px;color:var(--danger);font-size:13px"></div>` : ''}
          ${isNew ? `
            <p style="color:#888;font-size:12px;margin:0 0 14px">标 <span style="color:var(--danger)">*</span> 为必填项。</p>
            <label>产品代码 <span style="color:var(--danger)">*</span>（英文小写，唯一）</label>
            <input id="edit-product-code" type="text" placeholder="例：xiaov" />
            <label>产品名称 <span style="color:var(--danger)">*</span></label>
            <input id="edit-product-name" type="text" placeholder="例：小V机器人" />
            <label>SN 前缀 <span style="color:var(--danger)">*</span>（设备 SN 默认前缀，如 XV）</label>
            <input id="edit-sn-prefix" type="text" placeholder="例：XV" />
            <p style="color:#888;font-size:12px;margin:14px 0 0">以下火山引擎信息可以稍后在「配置火山」入口补充。</p>
          ` : `<p style="color:#888;font-size:13px;margin:8px 0 16px">填写火山引擎 IoT 平台信息。所有字段均可随时修改后重新保存。</p>`}
          <label>InstanceID（火山实例 ID）</label>
          <input id="edit-instance-id" type="text" value="${v.instance_id || ''}" placeholder="火山引擎实例 ID" />
          <label>ProductKey</label>
          <input id="edit-product-key" type="text" value="${v.product_key || ''}" placeholder="产品 ProductKey" />
          <label>ProductSecret（新增必填；编辑时留空 = 不修改）</label>
          <input id="edit-product-secret" type="text" autocomplete="off" placeholder="${isNew ? '粘贴产品 ProductSecret' : (v.product_secret ? '已配置，留空不修改' : '粘贴产品 ProductSecret')}" />
          <label>BotID（火山方舟智能体 ID）</label>
          <input id="edit-bot-id" type="text" value="${v.bot_id || ''}" placeholder="火山方舟智能体 ID" />
          <div class="modal-actions">
            <button onclick="state.editProduct=null;render()">取消</button>
            <button class="primary" onclick="${isNew ? 'createProduct()' : `saveProductConfig(${p.id})`}">${isNew ? '创建' : '保存'}</button>
          </div>
        </div>
      </div>`;
    }
  }

  if (state.editCredPlan) {
    const c = state.credentials.find(x => x.id === state.editCredPlan);
    if (c) {
      const svc = (state.services || []).find(s => s.hardware_id === c.hardware_id);
      const plan = state.planSelected || (svc && svc.plan) || 'annual';
      const planLabel = plan === 'annual' ? '年卡（annual）' : '基础版（basic）';
      const defaultExp = svc && svc.expires_at ? svc.expires_at.slice(0, 10) : new Date(Date.now() + 365 * 86400 * 1000).toISOString().slice(0, 10);
      main += `
      <div class="modal" onclick="event.stopPropagation()">
        <div class="modal-content">
          <h3>修改设备套餐</h3>
          <div id="save-plan-error" style="display:none;background:rgba(229,62,62,.08);border:1px solid rgba(229,62,62,.25);border-radius:8px;padding:8px 12px;margin:0 0 12px;color:var(--danger);font-size:13px"></div>
          <p style="color:var(--text-muted);font-size:13px;margin-bottom:12px">SN: <code>${c.sn}</code>${c.hardware_id ? ' · ' + c.hardware_id : ''}</p>
          <label>套餐类型</label>
          <div class="product-dropdown" style="margin:4px 0 12px">
            <button type="button" class="product-trigger" onclick="togglePlanDropdown()">
              <span>${planLabel}</span>
              <svg class="chevron ${state.planDropdown ? 'up' : ''}" width="14" height="14" viewBox="0 0 14 14"><path d="M3.5 5l3.5 4 3.5-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            ${state.planDropdown ? `
              <div class="product-menu" onclick="event.stopPropagation()">
                <a href="#" class="${plan === 'basic' ? 'on' : ''}" onclick="selectPlan('basic');return false">基础版（basic）</a>
                <a href="#" class="${plan === 'annual' ? 'on' : ''}" onclick="selectPlan('annual');return false">年卡（annual）</a>
              </div>
              <div class="dropdown-mask" onclick="state.planDropdown=false;render()"></div>
            ` : ''}
          </div>
          <label>服务到期日</label>
          <input id="plan-expires" type="text" class="air-datepicker-input" value="${defaultExp}" placeholder="选择到期日期" />
          <div class="modal-actions">
            <button onclick="state.editCredPlan=null;render()">取消</button>
            <button class="primary" onclick="saveCredPlan(${c.id})">保存</button>
          </div>
        </div>
      </div>`;
    }
  }

  if (state.confirmLogout) {
    main += `
      <div class="modal" onclick="event.stopPropagation()">
        <div class="modal-content confirm-dialog">
          <div class="confirm-icon">
            <svg width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="none" stroke="#f59e0b" stroke-width="2"/><path d="M16 9v9" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round"/><circle cx="16" cy="22.5" r="1.5" fill="#f59e0b"/></svg>
          </div>
          <h3>确定退出登录？</h3>
          <p>退出后需要重新输入密码才能进入管理后台</p>
          <div class="modal-actions center">
            <button onclick="state.confirmLogout=false;render()">取消</button>
            <button class="danger" onclick="logout()">退出</button>
          </div>
        </div>
      </div>`;
  }

  $('#app').innerHTML = `<div class="layout">${nav}<div class="main">${main}</div></div>` + renderOrderModal() + renderConfirmModal();
  // 初始化 Air Datepicker 日期选择器
  if (window.AirDatepicker) {
    document.querySelectorAll('.air-datepicker-input').forEach(el => {
      if (el._airdp) return;
      el._airdp = new window.AirDatepicker(el, {
        locale: {
          days: ['周日','周一','周二','周三','周四','周五','周六'],
          daysShort: ['日','一','二','三','四','五','六'],
          daysMin: ['日','一','二','三','四','五','六'],
          months: ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'],
          monthsShort: ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'],
          today: '今天',
          clear: '清空',
          apply: '应用',
          cancel: '取消',
        },
        dateFormat: 'yyyy-MM-dd',
        autoClose: true,
        position: 'bottom left',
      });
    });
  }
}

// 自定义订单 Modal（覆盖浏览器原生 confirm/prompt）
function renderOrderModal() {
  const m = state.orderModal;
  if (!m) return '';
  const order = (state.orders || []).find(o => o.id === m.orderId);
  const stop = 'event.stopPropagation()';
  let body = '', actions = '';
  if (m.type === 'markPaid') {
    body = `
      <h3>确认收到付款？</h3>
      <p style="color:var(--text-muted);font-size:13px;margin:8px 0 16px">
        订单 <code>${order ? order.order_no : '#' + m.orderId}</code>${order ? ' · ' + order.user_phone + ' · ' + fmtAmount(order.amount) : ''}<br>
        确认后将自动延长该设备的服务期并标记"待续火山 License"。
      </p>
    `;
    actions = `
      <button onclick="closeOrderModal()">取消</button>
      <button class="primary" onclick="submitMarkOrderPaid()" ${m.busy ? 'disabled' : ''}>${m.busy ? '处理中...' : '确认收款'}</button>
    `;
  } else if (m.type === 'completeRenew') {
    body = `
      <h3>完成续期</h3>
      <p style="color:var(--text-muted);font-size:13px;margin:8px 0 16px">
        订单 <code>${order ? order.order_no : '#' + m.orderId}</code>${order ? ' · ' + order.user_phone : ''}<br>
        请确认你已在<a href="https://console.volcengine.com/conversational-ai-embedded/overview" target="_blank" rel="noopener" style="color:var(--primary)">火山引擎控制台</a>完成：
      </p>
      <ol style="margin:0 0 14px 18px;color:var(--text-muted);font-size:13px;line-height:1.8">
        <li>为该设备购买新规格 License</li>
        <li>将 License 绑定到该设备</li>
      </ol>
      <label>火山 License ID（可选，用于审计追溯）</label>
      <input type="text" value="${m.licenseId || ''}" placeholder="如 LIC-XXXXX-XXXX，留空不记录"
        oninput="state.orderModal.licenseId=this.value"
        style="width:100%;padding:9px 12px;background:var(--bg);border:1px solid var(--border-light);border-radius:8px;color:var(--text);margin-bottom:12px" />
    `;
    actions = `
      <button onclick="closeOrderModal()">取消</button>
      <button class="primary" onclick="submitCompleteRenew()" ${m.busy ? 'disabled' : ''}>${m.busy ? '处理中...' : '确认完成续期'}</button>
    `;
  } else if (m.type === 'retryRenew') {
    body = `
      <h3>重试续期？</h3>
      <p style="color:var(--text-muted);font-size:13px;margin:8px 0 16px">
        订单 <code>${order ? order.order_no : '#' + m.orderId}</code> · 状态将从 <b style="color:var(--danger)">failed</b> 改回 <b style="color:var(--primary)">pending</b>，后台 worker 会重新尝试。
      </p>
    `;
    actions = `
      <button onclick="closeOrderModal()">取消</button>
      <button class="primary" onclick="submitRetryRenew()" ${m.busy ? 'disabled' : ''}>${m.busy ? '处理中...' : '确认重试'}</button>
    `;
  }
  return `
    <div class="modal" onclick="${stop}">
      <div class="modal-content" style="max-width:440px">
        ${body}
        <div class="modal-actions center" style="margin-top:16px">
          ${actions}
        </div>
      </div>
    </div>
  `;
}

// 通用确认弹窗（替换浏览器原生 confirm）
function renderConfirmModal() {
  const m = state.confirmModal;
  if (!m) return '';
  const stop = 'event.stopPropagation()';
  const dangerColor = m.danger ? 'rgba(229,62,62,.12)' : 'rgba(251,191,36,.12)';
  const iconColor = m.danger ? '#e53e3e' : '#f59e0b';
  return `
    <div class="modal" onclick="${stop}">
      <div class="modal-content" style="max-width:400px">
        <div style="text-align:center;padding:8px 0 16px">
          <div style="width:56px;height:56px;border-radius:50%;background:${dangerColor};margin:0 auto 14px;display:flex;align-items:center;justify-content:center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <h3 style="margin-bottom:6px">${m.title}</h3>
          <p style="color:var(--text-muted);font-size:13px">${m.message}</p>
          ${m.input ? `<input id="confirmInput" type="text" placeholder="${m.input.placeholder || ''}" value="${m.input.value || ''}" style="width:100%;margin-top:10px;padding:9px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:var(--text);font-size:13px;outline:none" onkeydown="if(event.key==='Enter')submitConfirm()" autofocus>` : ''}
          ${(m.inputs || []).map(f => `
            <div style="margin-top:10px;text-align:left">
              <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px">${f.label}</label>
              <input id="confirmInput_${f.id}" type="${f.type || 'text'}" placeholder="${f.placeholder || ''}" value="${f.value || ''}" style="width:100%;padding:9px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:var(--text);font-size:13px;outline:none">
            </div>`).join('')}
        </div>
        <div class="modal-actions center" style="margin-top:18px">
          <button onclick="closeConfirm()">取消</button>
          <button class="${m.danger ? 'danger' : 'primary'}" onclick="submitConfirm()" ${m.busy ? 'disabled' : ''}>${m.busy ? '处理中...' : m.confirmText}</button>
        </div>
      </div>
    </div>
  `;
}

// 管理员登录：直接用 ADMIN_PASSWORD / PROVISION_TOKEN 作 Bearer
async function doLogin(password) {
  state.token = password;
  try {
    state.products = await api('/products');
    localStorage.setItem('admin_token', password);
    location.hash = '/credentials';
  } catch (e) {
    state.token = '';
    setAlert('error', '登录失败：' + e.message);
  }
}

route();
