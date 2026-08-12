// Vectorac 多产品用户前台 SPA
// 改动：
//   - 绑定页不再传 SN（二维码里只有 temp_token，服务器自查 SN）
//   - device_name 改 nickname
//   - 绑定页显示 SN 由服务器返回
// v4 新增：
//   - 设备列表显示服务期 + 续费按钮
//   - 订单页（创建续费订单 → 模拟支付）
// 路由：#/login  #/register  #/me  #/bind?t=xxx  #/orders
const PRODUCT = location.pathname.match(/^\/([a-z][a-z0-9_]{1,30})\/account(?:\/|$)/)?.[1] || 'xiaov';
const API = `/${PRODUCT}/api`;
const PENDING_BIND_KEY = `pending_bind_token:${PRODUCT}`;
const $ = (s) => document.querySelector(s);

const state = {
  token: localStorage.getItem('user_token') || '',
  user: null,
  view: '',
  bindParams: null,
  alert: null,
  orders: [],
  forgotPhone: null,
  forgotDevCode: null,
  productName: PRODUCT,
  // 模态弹窗
  modal: null,             // { type, ... }  type: 'renew'|'voucher'|'unbind'
  renewYears: 1,           // 用户选的年限
  renewYearsDropdown: false,
};

async function loadProductBrand() {
  try {
    const product = await api('/product');
    state.productName = product.name || product.code || PRODUCT;
    document.title = `${state.productName}账号 · Vectorac`;
    render();
  } catch { /* 路由本身仍可显示 product code */ }
}

// 年卡 19.9 元/年（与服务端 DEFAULT_ANNUAL_AMOUNT 同步）
const PRICE_PER_YEAR_CENTS = 1990;
const fmtAmount = (cents) => '¥' + (cents / 100).toFixed(2);

// SVG 图标
const ICON_EYE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICON_EYE_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
const ICON_CLEAR = '<svg viewBox="0 0 20 20" width="18" height="18"><circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.25"/><path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/></svg>';

// 不 re-render，只更新 alert 区域，保留用户输入
function setAlert(type, msg) {
  state.alert = { type, msg };
  const existing = document.querySelector('.alert');
  if (existing) {
    existing.className = `alert ${type}`;
    existing.textContent = msg;
  } else {
    const container = document.querySelector('.container');
    if (container) {
      const div = document.createElement('div');
      div.className = `alert ${type}`;
      div.textContent = msg;
      container.insertBefore(div, container.firstChild);
    } else {
      render();
    }
  }
}

function clearAlert() {
  state.alert = null;
  const el = document.querySelector('.alert');
  if (el) el.remove();
}

// 生成输入框 HTML（Apple 风格清空 × + 密码小眼睛）
function inputHTML(id, type, placeholder, opts = {}) {
  const isPwd = type === 'password';
  const oninputStr = opts.oninput ? `${opts.oninput};updateClear(this)` : 'updateClear(this)';
  const extraAttrs = [
    opts.required ? 'required' : '',
    opts.pattern ? `pattern="${opts.pattern}"` : '',
    opts.maxlength ? `maxlength="${opts.maxlength}"` : '',
  ].filter(Boolean).join(' ');
  // 密码框：只有小眼睛，没有清空 ×；其他框：只有清空 ×
  return `<div class="input-wrap${isPwd ? ' has-eye' : ''}">
    <input id="${id}" type="${type}" placeholder="${placeholder}" ${extraAttrs} oninput="${oninputStr}" onfocus="updateClear(this)" onblur="updateClear(this)" />
    ${isPwd ? `<button type="button" class="input-icon eye" onclick="togglePwd('${id}')" onmousedown="event.preventDefault()">${ICON_EYE_OFF}</button>` : ''}
    ${!isPwd ? `<button type="button" class="input-icon clear" onclick="clearInput('${id}')" onmousedown="event.preventDefault()">${ICON_CLEAR}</button>` : ''}
  </div>`;
}

// 密码可见切换
function togglePwd(id) {
  const inp = document.getElementById(id);
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  const btn = inp.parentElement.querySelector('.input-icon.eye');
  if (btn) btn.innerHTML = inp.type === 'password' ? ICON_EYE_OFF : ICON_EYE;
}

// 清空按钮显示/隐藏
function updateClear(inp) {
  const clear = inp.parentElement.querySelector('.input-icon.clear');
  if (!clear) return;
  const show = inp.value && document.activeElement === inp;
  clear.style.opacity = show ? '1' : '0';
  clear.style.pointerEvents = show ? 'auto' : 'none';
}

// 点击清空
function clearInput(id) {
  const inp = document.getElementById(id);
  if (!inp) return;
  inp.value = '';
  inp.focus();
  updateClear(inp);
  // 触发密码强度更新
  const meter = document.getElementById(id + '-strength');
  if (meter) { meter.style.display = 'none'; }
}

// 密码强度
function pwdStrength(v) {
  let score = 0;
  if (v.length >= 8) score++;
  if (v.length >= 12) score++;
  if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++;
  if (/\d/.test(v)) score++;
  if (/[^a-zA-Z0-9]/.test(v)) score++;
  if (score <= 1) return { label: '弱', cls: 'weak', width: '33%' };
  if (score <= 3) return { label: '中', cls: 'medium', width: '66%' };
  return { label: '强', cls: 'strong', width: '100%' };
}

function onPwdInput(id) {
  const inp = document.getElementById(id);
  if (!inp) return;
  const meter = document.getElementById(id + '-strength');
  if (!meter) return;
  if (!inp.value) { meter.style.display = 'none'; return; }
  const s = pwdStrength(inp.value);
  meter.style.display = 'block';
  meter.innerHTML = `<div class="pwd-bar ${s.cls}" style="width:${s.width}"></div><span class="pwd-label ${s.cls}">${s.label}</span>`;
}

// 清空整个表单
function clearForm(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; updateClear(el); }
    const meter = document.getElementById(id + '-strength');
    if (meter) meter.style.display = 'none';
  });
  clearAlert();
}

// 错误码 → 中文
const ERR_CN = {
  missing_params: '请填写完整信息',
  invalid_phone: '手机号格式不正确',
  invalid_email: '邮箱格式不正确',
  password_too_short: '密码至少 8 位',
  phone_exists: '该手机号已注册',
  invalid_credentials: '手机号或密码错误',
  user_not_found: '用户不存在',
  invalid_or_expired_code: '验证码不正确或已过期',
  invalid_or_expired_token: '链接已失效，请重新操作',
  rate_limited: '操作过于频繁，请稍后再试',
  no_token: '请先登录',
  invalid_token: '登录已过期，请重新登录',
  unauthorized: '未授权',
  not_found: '未找到',
  device_already_bound: '设备已被其他账号绑定，如需换绑请先在原账号解绑',
  order_not_pending: '订单状态不允许此操作',
  order_already_paid: '订单已支付',
  voucher_required: '请填写备注',
  voucher_too_long: '备注内容过长',
  invalid_years: '续费年限不正确',
  product_not_found: '产品不存在',
  device_not_provisioned: '设备未激活',
  device_retired: '设备已退役',
  auth_failed: '设备认证失败',
  network_error: '网络错误，请稍后重试',
};

function errMsg(body) {
  if (!body) return '未知错误';
  if (body.message) return body.message;          // 服务器已带中文 message
  if (body.error && ERR_CN[body.error]) return ERR_CN[body.error];
  if (typeof body.error === 'string') return ERR_CN[body.error] || body.error;
  return '操作失败，请稍后重试';
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  let res, body;
  try {
    res = await fetch(API + path, { ...opts, headers });
    body = await res.json();
  } catch {
    const e = new Error('网络错误，请稍后重试');
    e.code = 'network_error';
    throw e;
  }
  if (!res.ok || body.error) {
    const e = new Error(errMsg(body));
    e.code = typeof body.error === 'string' ? body.error : body.error?.code;
    throw e;
  }
  return body;
}

function route() {
  const hash = location.hash.slice(1) || '/login';
  const [path, query] = hash.split('?');
  const params = new URLSearchParams(query || '');
  state.view = path;
  state.alert = null;   // 切页清 alert
  if (path === '/bind') {
    // 二维码里只有 t，没有 sn
    const token = params.get('t') || sessionStorage.getItem(PENDING_BIND_KEY) || '';
    state.bindParams = { t: token };
    if (token) sessionStorage.setItem(PENDING_BIND_KEY, token);
  }
  if ((path === '/me' || path === '/orders') && !state.token) {
    location.hash = '/login';
    return;
  }
  render();
  if (path === '/me') loadMe();
  if (path === '/orders') loadOrders();
}

function continueAfterAuth() {
  const token = sessionStorage.getItem(PENDING_BIND_KEY);
  location.hash = token ? `/bind?t=${encodeURIComponent(token)}` : '/me';
}

window.addEventListener('hashchange', route);

async function doRegister(phone, password, email) {
  try {
    const payload = { phone, password };
    if (email) payload.email = email;
    const data = await api('/auth/register', { method: 'POST', body: JSON.stringify(payload) });
    state.token = data.token;
    localStorage.setItem('user_token', data.token);
    state.user = data.user;
    continueAfterAuth();
  } catch (e) { setAlert('error', e.message); }
}

async function doLogin(phone, password) {
  try {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ phone, password }) });
    state.token = data.token;
    localStorage.setItem('user_token', data.token);
    state.user = data.user;
    continueAfterAuth();
  } catch (e) { setAlert('error', e.message); }
}

// 忘记密码：发送验证码
async function doSendCode() {
  const phone = $('#phone').value.trim();
  if (!phone) { setAlert('error', '请输入手机号'); return; }
  try {
    const r = await api('/auth/sms-code', {
      method: 'POST', body: JSON.stringify({ phone, purpose: 'reset_password' }),
    });
    state.forgotPhone = phone;
    state.forgotDevCode = r.dev_code;   // dev 模式才有，生产为 undefined
    setAlert('info', `验证码已发送（5 分钟内有效）${
      r.dev_code ? '，开发模式验证码：' + r.dev_code : ''
    }`);
  } catch (e) { setAlert('error', e.message); }
}

// 忘记密码：设置新密码
async function doResetPassword() {
  const phone = state.forgotPhone || $('#phone').value.trim();
  const code = $('#code').value.trim();
  const newPwd = $('#new-password').value;
  if (!phone || !code || !newPwd) { setAlert('error', '请填写完整'); return; }
  if (newPwd.length < 8) { setAlert('error', '新密码至少 8 位'); return; }
  try {
    await api('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ phone, code, new_password: newPwd }),
    });
    state.forgotPhone = null;
    state.forgotDevCode = null;
    setAlert('success', '密码已重置，请用新密码登录');
    setTimeout(() => location.hash = '/login', 1500);
  } catch (e) { setAlert('error', e.message); }
}

async function loadMe() {
  try {
    const me = await api('/me');
    state.user = me;
    const devices = await api('/devices');
    state.user.devices = devices;
    render();
  } catch (e) {
    if (e.code === 'invalid_token' || e.code === 'no_token') {
      state.token = '';
      localStorage.removeItem('user_token');
      location.hash = '/login';
    } else setAlert('error', e.message);
  }
}

// ============ 自定义 Modal（替换浏览器原生 confirm/prompt） ============

function openRenewModal(bindingId, sn) {
  state.modal = { type: 'renew', bindingId, sn, busy: false };
  state.renewYears = 1;
  render();
}

function openVoucherModal(orderId, orderNo) {
  state.modal = { type: 'voucher', orderId, orderNo, voucher: '', busy: false };
  render();
}

function openUnbindModal(bindingId, sn, nickname) {
  state.modal = { type: 'unbind', bindingId, sn, nickname, busy: false };
  render();
}

function closeModal() {
  state.modal = null;
  render();
}

async function submitRenew() {
  const m = state.modal;
  if (!m || m.type !== 'renew' || m.busy) return;
  const years = state.renewYears;
  if (years < 1 || years > 5) return setAlert('error', '年限应在 1-5 年之间');
  m.busy = true; render();
  try {
    const r = await api('/devices/' + m.bindingId + '/renew', {
      method: 'POST',
      body: JSON.stringify({ years }),
    });
    state.modal = {
      type: 'voucher',
      orderId: r.order_id,
      orderNo: r.order_no,
      amount: r.amount,
      years: r.years,
      voucher: '',
      busy: false,
    };
  } catch (e) { setAlert('error', e.message); m.busy = false; }
  render();
}

async function submitVoucher() {
  const m = state.modal;
  if (!m || m.type !== 'voucher' || m.busy) return;
  if (!m.voucher || !m.voucher.trim()) return setAlert('error', '请填写备注（流水号 / 支付时间）');
  m.busy = true; render();
  try {
    await api('/orders/' + m.orderId + '/voucher', {
      method: 'POST',
      body: JSON.stringify({ voucher: m.voucher.trim() }),
    });
    setAlert('success', `备注已提交，订单 ${m.orderNo} 等待管理员审核`);
    state.modal = null;
    if (state.view === '/orders') loadOrders(); else loadMe();
  } catch (e) { setAlert('error', e.message); m.busy = false; render(); }
}

async function confirmUnbind() {
  const m = state.modal;
  if (!m || m.type !== 'unbind' || m.busy) return;
  m.busy = true; render();
  try {
    await api('/devices/' + m.bindingId, { method: 'DELETE' });
    state.user.devices = state.user.devices.filter(d => d.binding_id !== m.bindingId);
    state.modal = null;
    render();
  } catch (e) { setAlert('error', e.message); m.busy = false; render(); }
}

// 兼容旧调用名（保留 onclick）
async function doUnbind(bindingId) {
  const d = (state.user.devices || []).find(x => x.binding_id === bindingId);
  openUnbindModal(bindingId, d?.sn || '', d?.nickname || '');
}
async function doRenew(bindingId, sn) { openRenewModal(bindingId, sn); }
async function doSubmitVoucher(orderId, orderNo) { openVoucherModal(orderId, orderNo); }

async function loadOrders() {
  try {
    state.orders = await api('/orders');
    render();
  } catch (e) { setAlert('error', e.message); }
}

function fmtDate(s) {
  if (!s) return '—';
  return s.replace('T', ' ').replace(/\.\d+Z?$/, '');
}

async function doConfirmBind() {
  try {
    await api('/device/bind/confirm', {
      method: 'POST',
      body: JSON.stringify({
        temp_token: state.bindParams.t,
        nickname: $('#bind-name').value.trim(),
      }),
    });
    sessionStorage.removeItem(PENDING_BIND_KEY);
    state.bindParams = null;
    setAlert('success', '设备绑定成功');
    setTimeout(() => location.hash = '/me', 1500);
  } catch (e) { setAlert('error', e.message); }
}

function logout() {
  state.token = '';
  state.user = null;
  localStorage.removeItem('user_token');
  location.hash = '/login';
}

function serviceBadge(s) {
  if (s === 'active') return '<span class="badge annual">服务中</span>';
  if (s === 'expired') return '<span class="badge unverified">已过期</span>';
  return '<span class="badge">无服务期</span>';
}

function renewBadge(s) {
  if (s === 'pending') return '<span class="badge">续期中</span>';
  if (s === 'completed') return '<span class="badge annual">续期完成</span>';
  if (s === 'failed') return '<span class="badge unverified">续期失败</span>';
  return '';
}

function render() {
  let html = '';
  const topbar = `
    <div class="topbar">
      <div class="brand">${state.productName} <em>账号</em></div>
      <nav>
        ${state.token ? '<a href="#/me">我的</a><a href="#/orders">订单</a><a href="#" onclick="logout()">退出</a>' : '<a href="#/login">登录</a><a href="#/register">注册</a>'}
      </nav>
    </div>`;

  if (state.alert) html += `<div class="alert ${state.alert.type}">${state.alert.msg}</div>`;

  if (state.view === '/login') {
    html += `
      <div class="container">
        ${topbar}
        <div class="card">
          <h2>登录</h2>
          <form onsubmit="event.preventDefault(); doLogin($('#phone').value, $('#password').value)">
            <label>手机号</label>
            ${inputHTML('phone', 'tel', '11 位手机号', { required: true, pattern: '1[3-9][0-9]{9}', maxlength: 11 })}
            <label>密码</label>
            ${inputHTML('password', 'password', '至少 8 位', { required: true, maxlength: 64 })}
            <button class="primary" type="submit" style="width:100%;margin-top:4px">登录</button>
          </form>
          <p class="hint">还没账号？<a href="#/register">立即注册</a> · <a href="#/forgot">忘记密码</a></p>
        </div>
      </div>`;
  } else if (state.view === '/forgot') {
    html += `
      <div class="container">
        ${topbar}
        <div class="card">
          <h2>忘记密码</h2>
          <p class="hint">输入注册手机号 → 获取短信验证码 → 设置新密码</p>
          <label>手机号</label>
          <div style="display:flex;gap:8px;align-items:flex-start">
            <div style="flex:1">${inputHTML('phone', 'tel', '11 位手机号', { required: true, pattern: '1[3-9][0-9]{9}', maxlength: 11 })}</div>
            <button type="button" style="margin-top:0" onclick="doSendCode()">发送验证码</button>
          </div>
          <label>验证码</label>
          ${inputHTML('code', 'text', '6 位验证码', { maxlength: 6 })}
          <label>新密码（至少 8 位）</label>
          ${inputHTML('new-password', 'password', '至少 8 位', { maxlength: 64, oninput: "onPwdInput('new-password')" })}
          <div id="new-password-strength" class="pwd-strength" style="display:none"></div>
          <button class="primary" onclick="doResetPassword()" style="width:100%;margin-top:4px">重置密码</button>
          <p class="hint">想起来了？<a href="#/login">直接登录</a></p>
        </div>
      </div>`;
  } else if (state.view === '/register') {
    html += `
      <div class="container">
        ${topbar}
        <div class="card">
          <h2>注册</h2>
          <form onsubmit="event.preventDefault(); doRegister($('#phone').value, $('#password').value, $('#email').value)">
            <label>手机号</label>
            ${inputHTML('phone', 'tel', '11 位手机号', { required: true, pattern: '1[3-9][0-9]{9}', maxlength: 11 })}
            <label>密码（至少 8 位）</label>
            ${inputHTML('password', 'password', '至少 8 位', { required: true, maxlength: 64, oninput: "onPwdInput('password')" })}
            <div id="password-strength" class="pwd-strength" style="display:none"></div>
            <label>邮箱（选填，用于找回密码）</label>
            ${inputHTML('email', 'email', 'you@example.com', { maxlength: 255 })}
            <button class="primary" type="submit" style="width:100%;margin-top:4px">注册</button>
          </form>
          <p class="hint">已有账号？<a href="#/login">直接登录</a></p>
        </div>
      </div>`;
  } else if (state.view === '/me') {
    const u = state.user || {};
    const devices = u.devices || [];
    html += `
      <div class="container">
        ${topbar}
        <div class="card">
          <h2>我的账号</h2>
          <p>手机号：${u.phone || '—'}</p>
          <p style="margin-top:4px">邮箱：${u.email || '—'}</p>
          <p style="margin-top:8px">
            ${u.email_verified ? '<span class="badge verified">邮箱已验证</span>' : '<span class="badge unverified">邮箱未验证</span>'}
          </p>
          <p class="hint">套餐 / 服务期按设备计算，每台设备独立续费。</p>
        </div>
        <div class="card">
          <h2>我的设备</h2>
          ${devices.length === 0 ? '<p class="hint">暂无设备。请在设备屏幕上扫码绑定。</p>' : ''}
          ${devices.map(d => `
            <div class="device-item">
              <div class="info">
                <div class="name">${d.nickname || '未命名设备'} ${serviceBadge(d.service_status)} ${renewBadge(d.service_renew_status)}</div>
                <div class="mac">SN: ${d.sn}${d.hardware_id ? ' · ' + d.hardware_id : ''}</div>
                <div class="time">套餐：${d.plan === 'annual' ? '年卡' : (d.plan || '—')} · 服务到期：${fmtDate(d.service_expires_at)}</div>
                <div class="time">绑定：${d.bound_at || '—'}${d.last_seen_at ? ' · 最近：' + d.last_seen_at : ''}</div>
              </div>
              <div class="actions">
                <button class="primary" onclick="doRenew(${d.binding_id}, '${d.sn}')">续费</button>
                <button class="danger" onclick="doUnbind(${d.binding_id})">解绑</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>`;
  } else if (state.view === '/orders') {
    const orders = state.orders || [];
    const statusText = (o) => {
      if (o.status === 'paid') return '<span class="badge annual">已付款</span>';
      if (o.status === 'pending' && o.voucher_text) return '<span class="badge">待审核</span>';
      if (o.status === 'pending') return '<span class="badge unverified">待付款</span>';
      return o.status;
    };
    html += `
      <div class="container">
        ${topbar}
        <div class="card">
          <h2>我的订单</h2>
          <p class="hint">续费流程：创建订单 → 向客服收款账户转账 → 填写支付备注 → 管理员审核 → 服务期延长</p>
          ${orders.length === 0 ? '<p class="hint">暂无订单</p>' : `
            <!-- 桌面端：表格 -->
            <table class="order-table" style="width:100%;font-size:13px">
              <thead><tr><th>订单号</th><th>SN</th><th>金额</th><th>年限</th><th>状态</th><th>支付备注</th><th>续期</th><th>创建时间</th><th>操作</th></tr></thead>
              <tbody>
                ${orders.map(o => `
                  <tr>
                    <td><code>${o.order_no}</code></td>
                    <td>${o.sn}</td>
                    <td>${fmtAmount(o.amount)}</td>
                    <td>${o.years}年</td>
                    <td>${statusText(o)}</td>
                    <td>${o.voucher_text ? `<small>${o.voucher_text.slice(0, 30)}${o.voucher_text.length > 30 ? '...' : ''}</small><br><small style="color:#888">${fmtDate(o.voucher_submitted_at)}</small>` : '<span style="color:#888">未提交</span>'}</td>
                    <td>${renewBadge(o.provider_renew_status)}</td>
                    <td>${fmtDate(o.created_at)}</td>
                    <td>${o.status === 'pending' && !o.voucher_text ? `<button class="primary" onclick="doSubmitVoucher(${o.id}, '${o.order_no}')">填写备注</button>` : '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <!-- 移动端：卡片列表 -->
            <div class="order-list">
              ${orders.map(o => `
                <div class="order-card">
                  <div class="row"><span class="k">订单号</span><span class="v"><code>${o.order_no}</code></span></div>
                  <div class="row"><span class="k">SN</span><span class="v">${o.sn}</span></div>
                  <div class="row"><span class="k">金额 / 年限</span><span class="v">${fmtAmount(o.amount)} · ${o.years}年</span></div>
                  <div class="row"><span class="k">状态</span><span class="v">${statusText(o)}</span></div>
                  <div class="row"><span class="k">续期</span><span class="v">${renewBadge(o.provider_renew_status)}</span></div>
                  <div class="row"><span class="k">创建</span><span class="v">${fmtDate(o.created_at)}</span></div>
                  ${o.voucher_text ? `<div class="row"><span class="k">备注</span><span class="v" style="font-size:12px">${o.voucher_text.slice(0, 50)}${o.voucher_text.length > 50 ? '...' : ''}</span></div>` : ''}
                  ${o.status === 'pending' && !o.voucher_text ? `<div class="actions"><button class="primary" onclick="doSubmitVoucher(${o.id}, '${o.order_no}')">填写备注</button></div>` : ''}
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>`;
  } else if (state.view === '/bind') {
    html += `
      <div class="container">
        ${topbar}
        <div class="card">
          <h2>绑定设备</h2>
          ${!state.token ? '<p>请先<a href="#/login">登录</a>后再绑定设备</p>' : `
            <p class="hint">扫描的设备将与你的账号绑定，可使用 AI 对话功能</p>
            <label>设备昵称（可选）</label>
            <input id="bind-name" type="text" placeholder="可选；留空时显示设备 SN" />
            <button class="primary" onclick="doConfirmBind()">确认绑定</button>
          `}
        </div>
      </div>`;
  }

  $('#app').innerHTML = html + renderModal();
}

// 自定义 Modal（覆盖在页面顶部；点空白不关闭，必须点取消/确认）
function renderModal() {
  const m = state.modal;
  if (!m) return '';
  const stop = 'event.stopPropagation()';
  let body = '', actions = '';
  if (m.type === 'renew') {
    const totalCents = PRICE_PER_YEAR_CENTS * (state.renewYears || 1);
    body = `
      <h3>续费服务期</h3>
      <p style="color:var(--text-muted);font-size:13px;margin:0 0 14px">为设备 <code>${m.sn}</code> 续费服务期。</p>
      <label>续费年限</label>
      <div class="year-chips" style="margin:4px 0 14px">
        ${[1,2,3,4,5].map(y => `<button type="button" class="year-chip ${y === state.renewYears ? 'on' : ''}" data-year="${y}" onclick="setRenewYears(${y})">${y} 年</button>`).join('')}
      </div>
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text-muted)">
          <span>单价</span><span>${fmtAmount(PRICE_PER_YEAR_CENTS)} / 年</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text-muted);margin-top:6px">
          <span>年限</span><span id="renew-years-mult">× ${state.renewYears}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:600;color:var(--text);margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
          <span>合计</span><span id="renew-total" style="color:var(--primary)">${fmtAmount(totalCents)}</span>
        </div>
      </div>
      <p style="color:var(--text-muted);font-size:12px;margin-bottom:0">点击「创建订单」后会生成转账订单，需向客服提供的账户转账并提交凭证。</p>
    `;
    actions = `
      <button onclick="closeModal()">取消</button>
      <button class="primary" onclick="submitRenew()" ${m.busy ? 'disabled' : ''}>${m.busy ? '创建中...' : '创建订单'}</button>
    `;
  } else if (m.type === 'voucher') {
    body = `
      <h3>填写备注</h3>
      <p style="color:var(--text-muted);font-size:13px;margin:0 0 14px">
        订单 <code>${m.orderNo}</code>${m.amount ? ' · ' + fmtAmount(m.amount) + (m.years ? '（' + m.years + '年）' : '') : ''}<br>
        请向客服提供的收款账户转账后，在下方填写支付信息（流水号 / 支付时间等），便于我们快速核对。
      </p>
      <label>支付备注</label>
      <textarea id="modal-voucher" rows="4" style="width:100%;padding:10px 12px;background:var(--input-bg);border:1px solid var(--border-light);border-radius:8px;color:var(--text);font-size:14px;font-family:inherit;resize:vertical;margin-bottom:14px"
        placeholder="例：&#10;支付时间：2026-08-11 18:30&#10;支付方式：微信转账&#10;流水号：WX1234567890&#10;付款人：张三"
        oninput="state.modal.voucher=this.value"
      >${m.voucher || ''}</textarea>
    `;
    actions = `
      <button onclick="closeModal()">稍后填写</button>
      <button class="primary" onclick="submitVoucher()" ${m.busy ? 'disabled' : ''}>${m.busy ? '提交中...' : '提交备注'}</button>
    `;
  } else if (m.type === 'unbind') {
    body = `
      <div style="text-align:center;padding:8px 0 16px">
        <div style="width:56px;height:56px;border-radius:50%;background:rgba(229,62,62,.12);margin:0 auto 14px;display:flex;align-items:center;justify-content:center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#e53e3e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
        </div>
        <h3 style="margin-bottom:6px">确认删除该设备？</h3>
        <p style="color:var(--text-muted);font-size:13px">${m.nickname || m.sn} · 删除后 AI 功能将无法使用，需在设备上重新扫码绑定。</p>
      </div>
    `;
    actions = `
      <button onclick="closeModal()">取消</button>
      <button class="danger" onclick="confirmUnbind()" ${m.busy ? 'disabled' : ''}>${m.busy ? '删除中...' : '确认删除'}</button>
    `;
  }
  // 图标型弹窗（删除设备）：按钮居中；表单型（续费/备注）：按钮靠右
  const actionsCls = m.type === 'unbind' ? 'modal-actions center' : 'modal-actions';
  return `
    <div class="modal" onclick="${stop}">
      <div class="modal-content" style="max-width:420px">
        ${body}
        <div class="${actionsCls}" style="margin-top:18px">
          ${actions}
        </div>
      </div>
    </div>
  `;
}

// 年限 chip 切换：仅更新 chip 状态 + 金额，不重渲染整个 modal（避免闪烁）
function setRenewYears(y) {
  state.renewYears = y;
  // 切换 chip .on 类：用 data-year 属性精确匹配
  document.querySelectorAll('.year-chip').forEach(el => {
    const n = Number(el.getAttribute('data-year'));
    el.classList.toggle('on', n === y);
  });
  // 实时更新金额
  const total = PRICE_PER_YEAR_CENTS * y;
  const totalEl = document.getElementById('renew-total');
  if (totalEl) totalEl.textContent = fmtAmount(total);
  const yearsEl = document.getElementById('renew-years-mult');
  if (yearsEl) yearsEl.textContent = '× ' + y;
}

route();
loadProductBrand();
