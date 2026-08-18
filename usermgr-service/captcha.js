// 轻量滑块验证码（自研，零第三方依赖）
// 原理：
//   1. 服务端生成一张带噪点纹理的 SVG 背景图，随机挖出一个镂空缺口（x 坐标保密，y 公开用于拼图块定位）
//   2. 缺口处的图案块作为可滑动的拼图，前端拖拽到缺口位置
//   3. 前端提交滑动距离 + 拖拽轨迹，服务端校验位置（容差 ±5px）和轨迹合理性
//   4. 校验通过后颁发一次性 captcha_token，短信接口必须携带该 token 才放行
//   5. 校验失败不消费挑战，允许同一张图重试（前端只重置滑块位置）
// 状态全在内存（单实例足够；多实例需换 Redis），5 分钟自动过期
const crypto = require('crypto');

const BG_W = 300;            // 背景图宽
const BG_H = 160;            // 背景图高
const SLIDER_W = 44;         // 拼图块宽
const SLIDER_H = 44;         // 拼图块高
const TOLERANCE = 5;         // 位置容差（px）
const TTL_MS = 5 * 60 * 1000;
const TOKEN_TTL_MS = 3 * 60 * 1000;

// 内存存储：captchaId -> 状态
const challenges = new Map();
// 已颁发的 token 集合（一次性消费）
const tokens = new Map();

// 定期清理
const _cleanTimer = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of challenges) if (v.expiresAt <= now) challenges.delete(k);
  for (const [k, v] of tokens) if (v.expiresAt <= now) tokens.delete(k);
}, 60 * 1000);
if (_cleanTimer.unref) _cleanTimer.unref();

// 生成 [min,max] 区间整数
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 生成一张带噪点的 SVG 背景图，在 (targetX, targetY) 处真正镂空一个圆角矩形缺口
// 使用 mask 让缺口区域透明，露出页面底色，视觉上"挖了洞"
function generateBackground(targetX, targetY, seed) {
  const hue = randInt(0, 360);
  const c1 = `hsl(${hue}, 55%, 65%)`;
  const c2 = `hsl(${(hue + 40) % 360}, 55%, 75%)`;
  const c3 = `hsl(${(hue + 80) % 360}, 45%, 55%)`;

  // 噪点（随机小圆点 + 线条，制造干扰）
  let noise = '';
  for (let i = 0; i < 60; i++) {
    const x = randInt(0, BG_W), y = randInt(0, BG_H);
    const r = randInt(1, 3);
    noise += `<circle cx="${x}" cy="${y}" r="${r}" fill="${c3}" opacity="${(randInt(10, 40) / 100).toFixed(2)}"/>`;
  }
  for (let i = 0; i < 15; i++) {
    const x1 = randInt(0, BG_W), y1 = randInt(0, BG_H);
    const x2 = randInt(0, BG_W), y2 = randInt(0, BG_H);
    noise += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c3}" stroke-width="1" opacity="0.2"/>`;
  }

  // mask：白色保留，黑色镂空。缺口区域为黑 → 透明
  const mask = `<mask id="hole">
<rect width="${BG_W}" height="${BG_H}" fill="white"/>
<rect x="${targetX}" y="${targetY}" width="${SLIDER_W}" height="${SLIDER_H}" rx="6" fill="black"/>
</mask>`;

  // 缺口描边（用单独的 rect 绘制边框，不受 mask 影响）
  const holeBorder = `<rect x="${targetX}" y="${targetY}" width="${SLIDER_W}" height="${SLIDER_H}" rx="6" fill="none" stroke="rgba(0,0,0,0.4)" stroke-width="1.5"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${BG_W}" height="${BG_H}" viewBox="0 0 ${BG_W} ${BG_H}">
<defs>
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${c1}"/>
    <stop offset="100%" stop-color="${c2}"/>
  </linearGradient>
  ${mask}
</defs>
<g mask="url(#hole)">
<rect width="${BG_W}" height="${BG_H}" fill="url(#g)"/>
${noise}
</g>
${holeBorder}
</svg>`;
  return svg;
}

// 生成拼图块 SVG（与背景同色同图案，用户拖动它对齐缺口）
// 带白色描边 + 轻微阴影，让拼图块在拖动时清晰可辨
function generateSlider(targetX, targetY) {
  const hue = randInt(0, 360);
  const c1 = `hsl(${hue}, 55%, 65%)`;
  const c2 = `hsl(${(hue + 40) % 360}, 55%, 75%)`;
  const c3 = `hsl(${(hue + 80) % 360}, 45%, 55%)`;

  let noise = '';
  for (let i = 0; i < 12; i++) {
    const x = randInt(0, SLIDER_W), y = randInt(0, SLIDER_H);
    const r = randInt(1, 3);
    noise += `<circle cx="${x}" cy="${y}" r="${r}" fill="${c3}" opacity="0.3"/>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SLIDER_W}" height="${SLIDER_H}" viewBox="0 0 ${SLIDER_W} ${SLIDER_H}">
<defs>
  <linearGradient id="sg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${c1}"/>
    <stop offset="100%" stop-color="${c2}"/>
  </linearGradient>
  <filter id="sh" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="rgba(0,0,0,0.3)"/>
  </filter>
</defs>
<rect width="${SLIDER_W}" height="${SLIDER_H}" rx="6" fill="url(#sg)" stroke="rgba(255,255,255,0.9)" stroke-width="1.5" filter="url(#sh)"/>
${noise}
</svg>`;
  return svg;
}

function svgToBase64(svg) {
  return 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64');
}

// 生成一个新的滑块验证挑战
// 返回 target_y 给前端用于定位拼图块的初始垂直位置
function create() {
  const targetX = randInt(SLIDER_W + 10, BG_W - SLIDER_W - 10);
  const targetY = randInt(10, BG_H - SLIDER_H - 10);
  const id = crypto.randomBytes(16).toString('hex');

  const bgSvg = generateBackground(targetX, targetY);
  const sliderSvg = generateSlider(targetX, targetY);

  challenges.set(id, {
    targetX,
    targetY,
    expiresAt: Date.now() + TTL_MS,
    consumed: false,
  });

  return {
    captcha_id: id,
    bg_image: svgToBase64(bgSvg),
    slider_image: svgToBase64(sliderSvg),
    slider_width: SLIDER_W,
    slider_height: SLIDER_H,
    bg_width: BG_W,
    bg_height: BG_H,
    target_y: targetY,          // 拼图块的初始/目标 y 坐标（公开，仅 x 需保密）
    expires_in: Math.floor(TTL_MS / 1000),
  };
}

// 校验滑动结果，通过则颁发一次性 captcha_token
// trail: [{x, t}, ...]  拖拽轨迹（x 为相对起点的位移，t 为时间戳 ms）
// 失败不消费挑战，允许前端用同一张图重试
function verify(captchaId, sliderX, trail) {
  const c = challenges.get(captchaId);
  if (!c) return { ok: false, reason: 'captcha_not_found' };
  if (c.consumed) return { ok: false, reason: 'captcha_consumed' };
  if (c.expiresAt <= Date.now()) {
    challenges.delete(captchaId);
    return { ok: false, reason: 'captcha_expired' };
  }

  const x = Number(sliderX);
  if (!Number.isFinite(x)) return { ok: false, reason: 'bad_slider_x' };
  if (Math.abs(x - c.targetX) > TOLERANCE) {
    return { ok: false, reason: 'position_mismatch' };
  }

  // 轨迹合理性：至少 3 个点；起点应接近 0；总时长 > 200ms（防机器瞬移）
  if (!Array.isArray(trail) || trail.length < 3) {
    return { ok: false, reason: 'trail_too_short' };
  }
  const t0 = trail[0].t;
  const tN = trail[trail.length - 1].t;
  if (!Number.isFinite(t0) || !Number.isFinite(tN) || tN - t0 < 200) {
    return { ok: false, reason: 'trail_too_fast' };
  }
  if (Math.abs(Number(trail[0].x)) > 5) {
    return { ok: false, reason: 'bad_start' };
  }

  // 消费挑战 + 颁发 token
  c.consumed = true;
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, { expiresAt: Date.now() + TOKEN_TTL_MS, consumed: false });

  return { ok: true, token, expires_in: Math.floor(TOKEN_TTL_MS / 1000) };
}

// 短信接口调用前消费 token（一次性）
function consumeToken(token) {
  if (!token) return false;
  const t = tokens.get(token);
  if (!t) return false;
  if (t.consumed) return false;
  if (t.expiresAt <= Date.now()) {
    tokens.delete(token);
    return false;
  }
  t.consumed = true;
  // 延迟删除，避免并发重复消费被误判
  setTimeout(() => tokens.delete(token), 30 * 1000);
  return true;
}

module.exports = { create, verify, consumeToken, BG_W, BG_H, SLIDER_W, SLIDER_H, TOLERANCE,
  // 仅供测试：获取某 challenge 的目标 x（生产代码不应调用）
  __testGetTarget(id) { const c = challenges.get(id); return c ? c.targetX : null; },
};
