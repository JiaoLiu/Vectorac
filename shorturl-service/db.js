// 基于 JSON 文件的极简存储：所有读写经过内存对象，写入用 write-file-atomic 保证原子性。
// 演示用足够，生产建议换 SQLite/Postgres（接口形态保持一致）。
const path = require('path');
const fs = require('fs');
const writeFileAtomic = require('write-file-atomic');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'shorturl.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let state;
try {
  state = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
} catch {
  state = { tokens: {}, links: {}, clicks: [] };
  fs.writeFileSync(DB_FILE, JSON.stringify(state));
}

let writeTimer = null;
let writing = false;
let pending = false;
function persist() {
  if (writeTimer) return;
  writeTimer = setTimeout(async () => {
    writeTimer = null;
    if (writing) { pending = true; return; }
    writing = true;
    try {
      await writeFileAtomic(DB_FILE, JSON.stringify(state));
    } catch (e) {
      console.error('[shorturl] persist failed:', e.message);
    } finally {
      writing = false;
      if (pending) { pending = false; persist(); }
    }
  }, 30);
}

// ---- Tokens ----
function insertToken(token, name, created_at, expires_at) {
  state.tokens[token] = { token, name, created_at, expires_at, disabled: 0, request_count: 0 };
  persist();
  return state.tokens[token];
}
function getToken(token) { return state.tokens[token] || null; }
function listTokens(limit = 200) {
  return Object.values(state.tokens).sort((a, b) => b.created_at - a.created_at).slice(0, limit);
}
function bumpTokenReq(token) {
  const t = state.tokens[token];
  if (t) { t.request_count += 1; persist(); }
}

// ---- Links ----
function insertLink(link) { state.links[link.code] = link; persist(); return link; }
function getLinkByCode(code) { return state.links[code] || null; }
function listLinksByToken(token) {
  return Object.values(state.links)
    .filter(l => l.token === token)
    .sort((a, b) => b.created_at - a.created_at);
}
function listAllLinks() {
  return Object.values(state.links)
    .map(l => ({ ...l, token_name: state.tokens[l.token]?.name || null }))
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, 500);
}
function deleteLinkByCode(code) {
  const existed = !!state.links[code];
  if (existed) {
    delete state.links[code];
    // 一并清理该短码的点击事件，避免历史数据无限增长
    state.clicks = state.clicks.filter(c => c.link_code !== code);
    if (state._linkId) delete state._linkId[code];
    persist();
  }
  return existed;
}
function getLinkIdMap() {
  // 维护 code -> id 映射，方便级联删除
  if (!state._linkId) state._linkId = {};
  return state._linkId;
}
function ensureLinkId(code) {
  const m = getLinkIdMap();
  if (!m[code]) {
    m[code] = Object.keys(m).length ? Math.max(...Object.values(m)) + 1 : 1;
    persist();
  }
  return m[code];
}
function incLinkClicks(code) {
  const l = state.links[code];
  if (l) { l.click_count += 1; persist(); }
}

// 本地日期字符串（YYYY-MM-DD），避免 UTC 跨日时与标签日期错位
function localDateStr(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// ---- Clicks ----
function insertClick(link_code, clicked_at, ip, user_agent, referer) {
  const id = ensureLinkId(link_code);
  state.clicks.push({ id, link_code, clicked_at, ip, user_agent, referer });
  // 防止文件无限增长：超过 5w 条时只保留最近 1w
  if (state.clicks.length > 50000) state.clicks.splice(0, state.clicks.length - 10000);
  persist();
}
function clicksByDay(link_code, since) {
  const out = {};
  for (const c of state.clicks) {
    if (c.link_code !== link_code) continue;
    if (c.clicked_at < since) continue;
    out[localDateStr(c.clicked_at)] = (out[localDateStr(c.clicked_at)] || 0) + 1;
  }
  return out;
}
function clicksByDayForToken(token, since) {
  const out = {};
  for (const c of state.clicks) {
    if (c.clicked_at < since) continue;
    const l = state.links[c.link_code];
    if (!l || l.token !== token) continue;
    const k = localDateStr(c.clicked_at);
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}
function allClicksByDay(since) {
  const out = {};
  for (const c of state.clicks) {
    if (c.clicked_at < since) continue;
    // 跳过已删除短链的点击事件，保持与 KPI 总点击（基于 link.click_count）一致
    if (!state.links[c.link_code]) continue;
    const k = localDateStr(c.clicked_at);
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}
function topLinksForToken(token) {
  return listLinksByToken(token)
    .sort((a, b) => b.click_count - a.click_count || b.created_at - a.created_at)
    .slice(0, 10);
}
function topLinksAll() {
  return Object.values(state.links)
    .sort((a, b) => b.click_count - a.click_count || b.created_at - a.created_at)
    .slice(0, 10);
}

module.exports = {
  insertToken, getToken, listTokens, bumpTokenReq,
  insertLink, getLinkByCode, listLinksByToken, listAllLinks,
  deleteLinkByCode, incLinkClicks, ensureLinkId,
  insertClick, clicksByDay, clicksByDayForToken, allClicksByDay,
  topLinksForToken, topLinksAll,
  _state: state
};
