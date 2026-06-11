// Vectorac 短链服务
// 用法：
//   PORT=3030 node server.js
//   打开浏览器访问 http://<host>:3030
// 不依赖任何 nginx 配置改动；如需用 s.vectorac.com 等子域名对外，再加 nginx 反代即可。
const path = require('path');
const crypto = require('crypto');
const express = require('express');

const db = require('./db');

const app = express();
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));

// 动态响应一律不缓存：避免浏览器把 SSR 页面和 /api/* 缓存在磁盘上，
// 导致 tab 切换拿到的是旧数据（需要 Ctrl+Shift+R 才能看到新数据）。
// 静态资源 (/static/*) 仍走默认缓存策略，因为带 hash 一般不会变。
app.use((req, res, next) => {
  if (req.path.startsWith('/static/')) return next();
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// 基础配置
const PORT = parseInt(process.env.PORT || '3030', 10);
const HOST = process.env.HOST || '0.0.0.0';
// 对外展示的短链前缀，演示页会用它来拼接完整短链。
// 部署到 s.vectorac.com 时，把 SHORT_BASE_URL 设为 https://s.vectorac.com 即可。
const SHORT_BASE_URL = (process.env.SHORT_BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
// 管理令牌（用于查看全部短链、删除），生产环境务必改。
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-demo-2026';
// 短码字符集（去掉 0/O/1/I/l 等容易混淆的字符）
const CODE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
function genCode(len = 7) {
  const buf = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
  return out;
}

// ---------- 工具 ----------
function now() { return Date.now(); }
function isValidHttpUrl(s) {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (e) { return false; }
}
function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim();
  return req.socket.remoteAddress || '';
}
function isValidToken(token) {
  if (!token) return false;
  const row = db.getToken(token);
  if (!row) return false;
  if (row.disabled) return false;
  if (row.expires_at && row.expires_at < now()) return false;
  return true;
}
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---------- 视图（SSR） ----------
const VIEWS = path.join(__dirname, 'views');
const PUBLIC_DIR = path.join(__dirname, 'public');

function layout(title, body, opts = {}) {
  const active = opts.active || '';
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)} · Vectorac 短链服务</title>
<link rel="stylesheet" href="/static/app.css" />
</head>
<body>
<header class="topbar">
  <a class="brand" href="/">
    <span class="dot"></span>
    <span>Vectorac <em>短链服务</em></span>
  </a>
  <nav class="nav">
    <a href="/" class="${active==='home'?'on':''}">首页</a>
    <a href="/create" class="${active==='create'?'on':''}">创建短链</a>
    <a href="/links" class="${active==='links'?'on':''}">短链管理</a>
    <a href="/stats" class="${active==='stats'?'on':''}">数据统计</a>
    <a href="/api-docs" class="${active==='api'?'on':''}">API 文档</a>
  </nav>
</header>
<main class="page">${body}</main>
<footer class="footer">
  <span>Vectorac 短链服务 · 演示版</span>
  <span class="muted">短链前缀：<code>${escapeHtml(SHORT_BASE_URL)}</code></span>
</footer>
<script src="/static/app.js"></script>
${opts.script || ''}
</body>
</html>`;
}

// 公共 fetch 封装（前端）
const FETCH_HELPER = `
window.api = {
  async req(method, url, body) {
    const opt = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opt.body = JSON.stringify(body);
    const r = await fetch(url, opt);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    return data;
  },
  copy(text) {
    return navigator.clipboard?.writeText(text).then(() => true).catch(() => false);
  },
  toast(msg, type='ok') {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.className = 'toast ' + type;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2200);
  }
};
`;

// ---------- 页面 ----------
app.get('/', (req, res) => {
  res.send(layout('首页', `
    <section class="hero">
      <h1>短链跳转 <span class="grad">API</span> 服务</h1>
      <p class="lead">基于令牌的短链生成、302 跳转、点击统计一体化方案。<br/>演示版：直接生成令牌、创建短链、查看实时折线图。</p>
      <div class="cta">
        <a class="btn primary" href="/create">立即创建</a>
        <a class="btn" href="/api-docs">查看 API</a>
      </div>
    </section>

    <section class="card">
      <h2>① 获取演示令牌</h2>
      <p class="muted">生产场景中令牌通过邮件/短信下发；演示版点一下立即生成。</p>
      <form id="tokForm" class="row">
        <input name="name" placeholder="令牌名称（可选，例如：测试-2026）" maxlength="40" />
        <button class="btn primary" type="submit">生成令牌</button>
      </form>
      <div id="tokOut" class="out"></div>
    </section>

    <section class="grid two">
      <div class="card">
        <h2>② 用令牌创建短链</h2>
        <p>填写短链前缀（如 <code>${escapeHtml(SHORT_BASE_URL)}</code>）和要跳转的 URL，绑定到令牌后即可生成。</p>
        <a class="btn" href="/create">前往创建 →</a>
      </div>
      <div class="card">
        <h2>③ 查看数据</h2>
        <p>折线图展示最近 14 天点击趋势、Top 链接、令牌请求数。</p>
        <a class="btn" href="/stats">查看统计 →</a>
      </div>
    </section>
  `, {
    active: 'home',
    script: `<script>${FETCH_HELPER}
    document.getElementById('tokForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = e.target.name.value.trim();
      const out = document.getElementById('tokOut');
      out.innerHTML = '<span class="muted">生成中…</span>';
      try {
        const r = await api.req('POST', '/api/token/generate', { name });
        out.innerHTML = \`
          <div class="kv"><span>令牌</span><code class="big">\${r.token}</code>
            <button class="btn xs" data-c="\${r.token}">复制</button>
            <button class="btn xs" data-go="/create?token=\${encodeURIComponent(r.token)}">去创建</button>
          </div>
          <div class="kv"><span>请求次数</span><span>\${r.request_count}</span></div>
          <div class="kv"><span>创建时间</span><span>\${new Date(r.created_at).toLocaleString()}</span></div>
        \`;
        out.querySelectorAll('[data-c]').forEach(b => b.onclick = async () => {
          (await api.copy(b.dataset.c)) ? api.toast('已复制') : api.toast('复制失败', 'err');
        });
        out.querySelector('[data-go]').onclick = (ev) => { location.href = ev.currentTarget.dataset.go; };
      } catch (e) { out.innerHTML = '<span class="err">'+e.message+'</span>'; }
    });</script>`
  }));
});

app.get('/create', (req, res) => {
  const token = req.query.token || '';
  res.send(layout('创建短链', `
    <section class="card">
      <h2>创建短链</h2>
      <p class="muted">短码随机生成 7 位字母数字；同一令牌下短码不重复。</p>
      <form id="f" class="form">
        <label>短链 BaseURL
          <input name="base" value="${escapeHtml(SHORT_BASE_URL)}" required />
        </label>
        <label>令牌
          <input name="token" value="${escapeHtml(token)}" placeholder="填写第一步生成的令牌" required />
        </label>
        <label>目标 URL（要跳转的地址）
          <input name="url" type="url" placeholder="https://example.com/very/long/path" required />
        </label>
        <label>备注（可选）
          <input name="remark" maxlength="60" placeholder="例如：618 活动落地页" />
        </label>
        <div class="actions">
          <button class="btn primary" type="submit">生成短链</button>
          <button class="btn" type="reset">重置</button>
        </div>
      </form>
      <div id="out" class="out"></div>
    </section>
  `, {
    active: 'create',
    script: `<script>${FETCH_HELPER}
    document.getElementById('f').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const out = document.getElementById('out');
      out.innerHTML = '<span class="muted">提交中…</span>';
      try {
        const r = await api.req('POST', '/api/links', {
          base_url: fd.get('base'),
          token: fd.get('token'),
          target_url: fd.get('url'),
          remark: fd.get('remark')
        });
        out.innerHTML = \`
          <div class="result">
            <div class="kv"><span>短链</span><code class="big">\${r.short_url}</code>
              <button class="btn xs" data-c="\${r.short_url}">复制</button>
              <a class="btn xs" href="\${r.short_url}" target="_blank" rel="noopener">测试跳转</a>
            </div>
            <div class="kv"><span>短码</span><code>\${r.code}</code></div>
            <div class="kv"><span>目标</span><a href="\${r.target_url}" target="_blank" rel="noopener">\${r.target_url}</a></div>
            <div class="kv"><span>令牌</span><code>\${r.token}</code></div>
            \${r.remark ? '<div class="kv"><span>备注</span><span>'+r.remark+'</span></div>' : ''}
          </div>\`;
        out.querySelector('[data-c]').onclick = async () => {
          (await api.copy(r.short_url)) ? api.toast('已复制') : api.toast('复制失败', 'err');
        };
      } catch (e) { out.innerHTML = '<span class="err">'+e.message+'</span>'; }
    });</script>`
  }));
});

app.get('/links', (req, res) => {
  res.send(layout('短链管理', `
    <section class="card">
      <div class="row spread">
        <h2>所有短链（管理视图）</h2>
        <div class="row">
          <input id="adminTok" placeholder="管理员令牌" value="${escapeHtml(req.query.token || '')}" />
          <button class="btn" id="refresh">刷新</button>
        </div>
      </div>
      <p class="muted">默认令牌：<code>${escapeHtml(ADMIN_TOKEN)}</code>（生产请通过 <code>ADMIN_TOKEN</code> 环境变量修改）</p>
      <div id="list" class="list"></div>
    </section>
  `, {
    active: 'links',
    script: `<script>${FETCH_HELPER}
    const tok = () => document.getElementById('adminTok').value.trim();
    async function load() {
      const t = tok();
      if (!t) { document.getElementById('list').innerHTML = '<p class="muted">请先填写管理员令牌</p>'; return; }
      try {
        const r = await api.req('GET', '/api/admin/links?token='+encodeURIComponent(t));
        if (!r.items.length) { document.getElementById('list').innerHTML = '<p class="muted">暂无短链</p>'; return; }
        document.getElementById('list').innerHTML = r.items.map(it => \`
          <div class="row item">
            <div class="grow">
              <div><a href="\${it.short_url}" target="_blank" rel="noopener"><code>\${it.short_url}</code></a>
                <span class="muted">· \${it.click_count} 次点击</span></div>
              <div class="muted small">→ \${it.target_url}</div>
              <div class="muted small">令牌：<code>\${it.token}</code>\${it.token_name?'（'+it.token_name+'）':''}\${it.remark?' · 备注：'+it.remark:''} · 创建于 \${new Date(it.created_at).toLocaleString()}</div>
            </div>
            <div class="row">
              <button class="btn xs" data-c="\${it.short_url}">复制</button>
              <button class="btn xs danger" data-del="\${it.code}">删除</button>
            </div>
          </div>\`).join('');
        document.querySelectorAll('[data-c]').forEach(b => b.onclick = async () => {
          (await api.copy(b.dataset.c)) ? api.toast('已复制') : api.toast('复制失败', 'err');
        });
        document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
          if (!confirm('确认删除短链 '+b.dataset.del+' ？')) return;
          try {
            await api.req('DELETE', '/api/links/'+b.dataset.del, { token: tok() });
            api.toast('已删除'); load();
          } catch (e) { api.toast(e.message, 'err'); }
        });
      } catch (e) { document.getElementById('list').innerHTML = '<span class="err">'+e.message+'</span>'; }
    }
    document.getElementById('refresh').onclick = load;
    document.getElementById('adminTok').addEventListener('change', load);
    if (tok()) load();
    </script>`
  }));
});

app.get('/stats', (req, res) => {
  res.send(layout('数据统计', `
    <section class="card">
      <div class="row spread">
        <h2>数据统计</h2>
        <div class="row">
          <input id="tok" placeholder="填写令牌查看该令牌数据" value="${escapeHtml(req.query.token || '')}" />
          <button class="btn" id="refresh">刷新</button>
        </div>
      </div>
      <p class="muted">不填令牌则展示全平台汇总数据。</p>
      <div id="kpi" class="kpi"></div>
    </section>

    <section class="card">
      <h3>近 14 天点击趋势</h3>
      <canvas id="trend" height="120"></canvas>
      <p class="muted small" id="trendNote"></p>
    </section>

    <section class="card">
      <h3>Top 链接</h3>
      <div id="top" class="list"></div>
    </section>
  `, {
    active: 'stats',
    script: `<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
    <script>${FETCH_HELPER}
    const tok = () => document.getElementById('tok').value.trim();
    let chart;
    function renderTrend(series) {
      const ctx = document.getElementById('trend').getContext('2d');
      if (chart) chart.destroy();
      chart = new Chart(ctx, {
        type: 'line',
        data: { labels: series.labels, datasets: [{
          label: '点击数', data: series.data, borderColor: '#3eaf7c',
          backgroundColor: 'rgba(62,175,124,.15)', fill: true, tension: .35, pointRadius: 3
        }]},
        options: {
          responsive: true, plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
      });
    }
    async function load() {
      const t = tok();
      const qs = t ? '?token='+encodeURIComponent(t) : '';
      try {
        const r = await api.req('GET', '/api/stats/overview'+qs);
        document.getElementById('kpi').innerHTML = \`
          <div class="kpi-cell"><div class="num">\${r.totals.clicks}</div><div>总点击</div></div>
          <div class="kpi-cell"><div class="num">\${r.totals.links}</div><div>短链数</div></div>
          <div class="kpi-cell"><div class="num">\${r.totals.tokens}</div><div>令牌数</div></div>
          <div class="kpi-cell"><div class="num">\${r.totals.token_requests}</div><div>令牌请求数</div></div>
        \`;
        renderTrend(r.trend);
        document.getElementById('trendNote').textContent = '区间：'+r.trend.labels[0]+' ~ '+r.trend.labels[r.trend.labels.length-1];
        if (!r.top.length) {
          document.getElementById('top').innerHTML = '<p class="muted">暂无数据</p>';
        } else {
          document.getElementById('top').innerHTML = r.top.map(it => \`
            <div class="row item">
              <div class="grow">
                <a href="\${it.short_url || (location.origin+'/'+it.code)}" target="_blank" rel="noopener"><code>\${it.code}</code></a>
                <span class="muted">· \${it.click_count} 次</span>
                <div class="muted small">→ \${it.target_url}</div>
              </div>
              <div class="bar"><span style="width:\${it.ratio*100}%"></span></div>
            </div>\`).join('');
        }
      } catch (e) { api.toast(e.message, 'err'); }
    }
    document.getElementById('refresh').onclick = load;
    document.getElementById('tok').addEventListener('change', load);
    if (tok()) load(); else load();
    </script>`
  }));
});

app.get('/api-docs', (req, res) => {
  const sampleBase = escapeHtml(SHORT_BASE_URL);
  res.send(layout('API 文档', `
    <section class="card">
      <h2>API 文档</h2>
      <p>所有接口返回 JSON；除令牌生成和跳转外都需要在请求体或 URL 上传 <code>token</code>。</p>

      <h3>1. 生成令牌（演示）</h3>
      <pre class="code">POST /api/token/generate
Content-Type: application/json

{ "name": "测试令牌" }

→ { "token": "tk_xxx", "name": "测试令牌", "created_at": 1718000000000, "request_count": 0 }</pre>

      <h3>2. 创建短链</h3>
      <pre class="code">POST /api/links
Content-Type: application/json

{
  "base_url": "${sampleBase}",
  "token":    "tk_xxx",
  "target_url": "https://example.com/long/path",
  "remark":   "可选"
}

→ { "code": "aB3xY7z", "short_url": "${sampleBase}/s/aB3xY7z", "target_url": "...", "token": "tk_xxx" }</pre>

      <h3>3. 跳转</h3>
      <pre class="code">GET ${sampleBase}/s/{code}
→ 302 Found, Location: &lt;target_url&gt;</pre>

      <h3>4. 查询统计</h3>
      <pre class="code">GET /api/stats/overview?token=tk_xxx
→ { totals: {...}, trend: { labels:[...], data:[...] }, top:[ ... ] }</pre>

      <h3>5. 列出我的短链</h3>
      <pre class="code">GET /api/links?token=tk_xxx
→ { items: [ { code, short_url, target_url, click_count, ... } ] }</pre>

      <h3>6. 删除短链</h3>
      <pre class="code">DELETE /api/links/{code}
Content-Type: application/json
{ "token": "tk_xxx" }
→ { "ok": true }</pre>

      <h3>7. 管理员视图（全部短链）</h3>
      <pre class="code">GET  /api/admin/links?token=${escapeHtml(ADMIN_TOKEN)}
DELETE /api/admin/links/{code}
Body: { "token": "${escapeHtml(ADMIN_TOKEN)}" }</pre>
    </section>
  `, { active: 'api' }));
});

// ---------- API ----------

// 1. 生成令牌（演示）
app.post('/api/token/generate', (req, res) => {
  const { name = '' } = req.body || {};
  const random = crypto.randomBytes(16).toString('hex');
  const token = 'tk_' + random;
  db.insertToken(token, String(name).slice(0, 40) || null, now(), null);
  res.json(db.getToken(token));
});

// 2. 创建短链
app.post('/api/links', (req, res) => {
  const { base_url, token, target_url, remark } = req.body || {};
  if (!isValidToken(token)) return res.status(401).json({ error: '令牌无效或已过期' });
  if (!isValidHttpUrl(target_url)) return res.status(400).json({ error: '目标 URL 不合法' });
  const base = (typeof base_url === 'string' && base_url.trim()) ? base_url.trim() : SHORT_BASE_URL;
  if (!/^https?:\/\//i.test(base)) return res.status(400).json({ error: '短链 BaseURL 必须以 http:// 或 https:// 开头' });

  // 同一个 (token, target_url) 复用短码，避免重复生成
  const existing = db.listLinksByToken(token).find(l => l.target_url === target_url);
  if (existing) {
    return res.json({
      code: existing.code,
      short_url: `${base}/s/${existing.code}`,
      target_url: existing.target_url,
      token: existing.token,
      remark: existing.remark,
      reused: true
    });
  }

  // 最多尝试 5 次以防罕见的 hash 冲突
  for (let i = 0; i < 5; i++) {
    const code = genCode();
    if (db.getLinkByCode(code)) continue;
    db.insertLink({
      code,
      target_url,
      token,
      remark: (remark || '').slice(0, 60) || null,
      created_at: now(),
      expires_at: null,
      disabled: 0,
      click_count: 0
    });
    db.bumpTokenReq(token);
    return res.json({
      code,
      short_url: `${base}/s/${code}`,
      target_url,
      token,
      remark: remark || null
    });
  }
  res.status(500).json({ error: '短码生成失败，请重试' });
});

// 3. 跳转
app.get('/s/:code', (req, res) => {
  const link = db.getLinkByCode(req.params.code);
  if (!link) return res.status(404).type('text/plain; charset=utf-8').send('短链不存在');
  if (link.disabled) return res.status(403).type('text/plain; charset=utf-8').send('短链已停用');
  if (link.expires_at && link.expires_at < now()) return res.status(410).type('text/plain; charset=utf-8').send('短链已过期');

  // 记录点击（不阻塞跳转）
  try {
    db.insertClick(link.code, now(), clientIp(req), req.headers['user-agent'] || '', req.headers['referer'] || '');
    db.incLinkClicks(link.code);
  } catch (e) {}

  res.set('Cache-Control', 'no-store');
  res.redirect(302, link.target_url);
});

// 4. 统计概览
app.get('/api/stats/overview', (req, res) => {
  const { token } = req.query;
  const since = now() - 14 * 86400000;

  // totals
  let totalClicks, totalLinks, totalTokens, totalTokenReq;
  if (token) {
    if (!isValidToken(token)) return res.status(401).json({ error: '令牌无效' });
    const t = db.getToken(token);
    const myLinks = db.listLinksByToken(token);
    totalClicks = myLinks.reduce((s, l) => s + (l.click_count || 0), 0);
    totalLinks = myLinks.length;
    totalTokens = 1;
    totalTokenReq = t.request_count;
  } else {
    const allLinks = Object.values(db._state.links);
    totalClicks = allLinks.reduce((s, l) => s + (l.click_count || 0), 0);
    totalLinks = allLinks.length;
    totalTokens = Object.keys(db._state.tokens).length;
    totalTokenReq = Object.values(db._state.tokens).reduce((s, t) => s + (t.request_count || 0), 0);
  }

  // 14 天时间序列（缺补 0），本地日期对齐
  const map = token ? db.clicksByDayForToken(token, since) : db.allClicksByDay(since);
  const labels = []; const data = [];
  const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
  const start = new Date(todayMidnight.getTime() - 13 * 86400000);
  for (let i = 0; i < 14; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    labels.push(k.slice(5));
    data.push(map[k] || 0);
  }

  // top links
  const topRaw = token ? db.topLinksForToken(token) : db.topLinksAll();
  const max = Math.max(1, ...topRaw.map(x => x.click_count));
  const top = topRaw.map(x => ({
    id: x.code, code: x.code, target_url: x.target_url,
    click_count: x.click_count, remark: x.remark,
    ratio: x.click_count / max,
    short_url: `${SHORT_BASE_URL}/s/${x.code}`
  }));

  res.json({
    totals: { clicks: totalClicks, links: totalLinks, tokens: totalTokens, token_requests: totalTokenReq },
    trend: { labels, data },
    top
  });
});

// 5. 列出短链
app.get('/api/links', (req, res) => {
  const { token } = req.query;
  if (!isValidToken(token)) return res.status(401).json({ error: '令牌无效' });
  const rows = db.listLinksByToken(token);
  res.json({
    items: rows.map(r => ({
      ...r,
      short_url: `${SHORT_BASE_URL}/s/${r.code}`
    }))
  });
});

// 6. 删除短链
app.delete('/api/links/:code', (req, res) => {
  const { token } = req.body || {};
  if (!isValidToken(token)) return res.status(401).json({ error: '令牌无效' });
  const link = db.getLinkByCode(req.params.code);
  if (!link) return res.status(404).json({ error: '短链不存在' });
  if (link.token !== token) return res.status(403).json({ error: '令牌与短链不匹配' });
  db.deleteLinkByCode(req.params.code);
  res.json({ ok: true });
});

// 7. 管理员接口
function isAdmin(req) {
  const t = (req.query.token || (req.body && req.body.token) || '').toString();
  return t && t === ADMIN_TOKEN;
}
app.get('/api/admin/links', (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: '需要管理员令牌' });
  const rows = db.listAllLinks();
  res.json({ items: rows.map(r => ({ ...r, short_url: `${SHORT_BASE_URL}/s/${r.code}` })) });
});
app.delete('/api/admin/links/:code', (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: '需要管理员令牌' });
  const ok = db.deleteLinkByCode(req.params.code);
  res.json({ ok });
});

// 健康检查
app.get('/healthz', (req, res) => res.json({ ok: true, ts: now() }));

// 静态资源
app.use('/static', express.static(PUBLIC_DIR));

// 404
app.use((req, res) => {
  if (req.accepts('html')) return res.status(404).send(layout('404', `
    <section class="card"><h2>404</h2><p>页面不存在。<a href="/">回首页</a></p></section>
  `));
  res.status(404).json({ error: 'Not Found' });
});

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`[shorturl] listening on http://${HOST}:${PORT}`);
    console.log(`[shorturl] short base url: ${SHORT_BASE_URL}`);
  });
}

module.exports = app;
