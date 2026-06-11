// 不实际监听端口，直接驱动核心逻辑（db + 业务函数）的端到端测试。
const assert = require('assert');
const path = require('path');
const fs = require('fs');

const DATA = path.join(__dirname, 'data');
const DB = path.join(DATA, 'shorturl.json');
if (fs.existsSync(DB)) fs.unlinkSync(DB);

const db = require('./db');

// ====== 业务函数（与 server.js 中的逻辑一致；这里复制出来只为了在没有 HTTP 的环境下测试）======
function now() { return Date.now(); }
function isValidHttpUrl(s) {
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
}
function isValidToken(token) {
  if (!token) return false;
  const row = db.getToken(token);
  if (!row) return false;
  if (row.disabled) return false;
  if (row.expires_at && row.expires_at < now()) return false;
  return true;
}
function apiTokenGenerate(name) {
  const token = 'tk_' + require('crypto').randomBytes(16).toString('hex');
  db.insertToken(token, (name || '').slice(0, 40) || null, now(), null);
  return db.getToken(token);
}
function apiLinkCreate({ base_url, token, target_url, remark, shortBase }) {
  if (!isValidToken(token)) return { status: 401, error: '令牌无效或已过期' };
  if (!isValidHttpUrl(target_url)) return { status: 400, error: '目标 URL 不合法' };
  const base = (base_url || shortBase || '').replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(base)) return { status: 400, error: '短链 BaseURL 必须以 http:// 或 https:// 开头' };
  const existing = db.listLinksByToken(token).find(l => l.target_url === target_url);
  if (existing) {
    return { status: 200, data: {
      code: existing.code, short_url: `${base}/s/${existing.code}`,
      target_url: existing.target_url, token: existing.token, remark: existing.remark, reused: true
    }};
  }
  const ALPHA = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const crypto = require('crypto');
  for (let i = 0; i < 5; i++) {
    const buf = crypto.randomBytes(7);
    let code = '';
    for (let j = 0; j < 7; j++) code += ALPHA[buf[j] % ALPHA.length];
    if (db.getLinkByCode(code)) continue;
    db.insertLink({ code, target_url, token, remark: (remark || '').slice(0, 60) || null, created_at: now(), expires_at: null, disabled: 0, click_count: 0 });
    db.bumpTokenReq(token);
    return { status: 200, data: { code, short_url: `${base}/s/${code}`, target_url, token, remark: remark || null } };
  }
  return { status: 500, error: '短码生成失败' };
}
function apiLinkRedirect(code) {
  const link = db.getLinkByCode(code);
  if (!link) return { status: 404, error: '短链不存在' };
  if (link.disabled) return { status: 403, error: '短链已停用' };
  if (link.expires_at && link.expires_at < now()) return { status: 410, error: '短链已过期' };
  db.insertClick(code, now(), '127.0.0.1', 'jest', 'ref');
  db.incLinkClicks(code);
  return { status: 302, location: link.target_url };
}
function apiStatsOverview(token, since, shortBase) {
  let totalClicks, totalLinks, totalTokens, totalTokenReq;
  if (token) {
    if (!isValidToken(token)) return { status: 401, error: '令牌无效' };
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
  const map = token ? db.clicksByDayForToken(token, since) : db.allClicksByDay(since);
  const labels = [], data = [];
  const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
  const start = new Date(todayMidnight.getTime() - 13 * 86400_000);
  for (let i = 0; i < 14; i++) {
    const d = new Date(start.getTime() + i * 86400_000);
    const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    labels.push(k.slice(5));
    data.push(map[k] || 0);
  }
  const topRaw = token ? db.topLinksForToken(token) : db.topLinksAll();
  const max = Math.max(1, ...topRaw.map(x => x.click_count));
  const top = topRaw.map(x => ({
    id: x.code, code: x.code, target_url: x.target_url,
    click_count: x.click_count, remark: x.remark,
    ratio: x.click_count / max,
    short_url: `${shortBase}/s/${x.code}`
  }));
  return { status: 200, data: { totals: { clicks: totalClicks, links: totalLinks, tokens: totalTokens, token_requests: totalTokenReq }, trend: { labels, data }, top } };
}

// ====== 测试用例 ======
(async () => {
  // 1. 生成令牌
  const t = apiTokenGenerate('test');
  assert.ok(t.token && t.token.startsWith('tk_'), 'token shape');
  assert.strictEqual(t.name, 'test');
  assert.strictEqual(t.request_count, 0);
  console.log('OK 生成令牌', t.token.slice(0, 14) + '…');

  // 2. 创建短链
  const SHORT = 'http://localhost:3030';
  const r1 = apiLinkCreate({ base_url: SHORT, token: t.token, target_url: 'https://example.com/abc?x=1', remark: 'first', shortBase: SHORT });
  assert.strictEqual(r1.status, 200);
  const code = r1.data.code;
  assert.ok(code && code.length === 7, 'code length 7');
  assert.ok(r1.data.short_url.endsWith('/s/' + code), 'short_url shape');
  console.log('OK 创建短链', r1.data.short_url);

  // 3. 复用
  const r1b = apiLinkCreate({ base_url: SHORT, token: t.token, target_url: 'https://example.com/abc?x=1' });
  assert.strictEqual(r1b.data.code, code, 'reuse code');
  assert.strictEqual(r1b.data.reused, true);
  console.log('OK 重复创建复用短码');

  // 4. 跳转
  for (let i = 0; i < 3; i++) {
    const r = apiLinkRedirect(code);
    assert.strictEqual(r.status, 302, 'redirect');
    assert.strictEqual(r.location, 'https://example.com/abc?x=1');
  }
  console.log('OK 跳转 3 次');

  // 5. 不存在
  const miss = apiLinkRedirect('zzzzzzz');
  assert.strictEqual(miss.status, 404);
  console.log('OK 不存在的短链 404');

  // 6. 非法 token
  const bad1 = apiLinkCreate({ base_url: SHORT, token: 'nope', target_url: 'https://example.com' });
  assert.strictEqual(bad1.status, 401);
  console.log('OK 非法令牌 401');

  // 7. 非法 URL
  const bad2 = apiLinkCreate({ base_url: SHORT, token: t.token, target_url: 'javascript:alert(1)' });
  assert.strictEqual(bad2.status, 400);
  console.log('OK 非法 URL 400');

  // 8. 统计
  const s = apiStatsOverview(t.token, now() - 14*86400_000, SHORT);
  assert.strictEqual(s.status, 200);
  assert.ok(s.data.totals.clicks >= 3, 'clicks counted: ' + s.data.totals.clicks);
  assert.strictEqual(s.data.trend.labels.length, 14, '14 days');
  assert.strictEqual(s.data.top[0].code, code, 'top1 is our code');
  console.log('OK 统计 clicks=' + s.data.totals.clicks + ' top=' + s.data.top[0].code + '(' + s.data.top[0].click_count + ')');

  // 9. 全局统计
  const sg = apiStatsOverview(null, now() - 14*86400_000, SHORT);
  assert.ok(sg.data.totals.tokens >= 1);
  assert.ok(sg.data.totals.links >= 1);
  console.log('OK 全局统计 links=' + sg.data.totals.links + ' tokens=' + sg.data.totals.tokens);

  // 10. 删除
  const existed = db.deleteLinkByCode(code);
  assert.strictEqual(existed, true);
  const after = apiLinkRedirect(code);
  assert.strictEqual(after.status, 404);
  console.log('OK 删除后再访问 404');

  // 11. 短码字符集不含易混字符
  const ALPHA = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  assert.ok(!/[0O1Il]/.test(ALPHA), 'no 0O1Il in alphabet');
  console.log('OK 短码字符集 7 位长度 安全');

  // 12. 今日点击必须出现在 14 天趋势的最后一天
  // 重新生成一个令牌 + 短链 + 跳转，验证 stats 今日 data > 0
  const t2 = apiTokenGenerate('tz-test');
  const r2 = apiLinkCreate({ base_url: SHORT, token: t2.token, target_url: 'https://example.com/tz', shortBase: SHORT });
  const code2 = r2.data.code;
  apiLinkRedirect(code2);
  apiLinkRedirect(code2);
  const s2 = apiStatsOverview(t2.token, now() - 14 * 86400_000, SHORT);
  const lastLabel = s2.data.trend.labels[s2.data.trend.labels.length - 1];
  const lastData = s2.data.trend.data[s2.data.trend.data.length - 1];
  // 今日本地日期的 MM-DD
  const now2 = new Date();
  const todayMM = String(now2.getMonth() + 1).padStart(2, '0');
  const todayDD = String(now2.getDate()).padStart(2, '0');
  const todayLabel = todayMM + '-' + todayDD;
  assert.strictEqual(lastLabel, todayLabel, `trend 最后一天 label 应该是 ${todayLabel}, 实际是 ${lastLabel}`);
  assert.ok(lastData >= 2, `今日 data 应 >= 2, 实际 ${lastData}`);
  console.log(`OK 今日(${todayLabel})点击 ${lastData} 次出现在趋势末端`);

  // 13. 删除旧短链后重建，KPI 与折线图必须一致（之前 bug：图表会算入已删链接的事件）
  const t3 = apiTokenGenerate('recreate-test');
  const r3a = apiLinkCreate({ base_url: SHORT, token: t3.token, target_url: 'https://example.com/old', shortBase: SHORT });
  for (let i = 0; i < 3; i++) apiLinkRedirect(r3a.data.code);  // 旧链点 3 次
  db.deleteLinkByCode(r3a.data.code);                          // 删掉
  const r3b = apiLinkCreate({ base_url: SHORT, token: t3.token, target_url: 'https://example.com/new', shortBase: SHORT });
  for (let i = 0; i < 2; i++) apiLinkRedirect(r3b.data.code);  // 新链点 2 次
  const s3 = apiStatsOverview(t3.token, now() - 14 * 86400_000, SHORT);
  const chartSum = s3.data.trend.data.reduce((a, b) => a + b, 0);
  assert.strictEqual(s3.data.totals.clicks, 2, `KPI 总点击应为 2, 实际 ${s3.data.totals.clicks}`);
  assert.strictEqual(chartSum, 2, `折线图 sum 应为 2, 实际 ${chartSum} (已删链接事件不应计入)`);
  console.log(`OK 删除+重建后 KPI=图表=${chartSum}`);

  console.log('\n所有测试通过 ✓');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
