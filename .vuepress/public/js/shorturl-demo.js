// 短链演示按钮：根据当前 host 决定 href，并直接更新 DOM
// 放到外部 .js 是为了避免 VuePress SSR（Node 端）执行到 window
(function () {
  if (typeof window === 'undefined') return;
  var h = location.hostname;
  var url = (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost'))
    ? 'http://localhost:3030'
    : 'https://s.vectorac.com';

  window.__SHORTURL_DEMO_URL__ = url;
  console.log('[shorturl-demo] host =', h, '→ demo url =', url);

  function apply() {
    // 同时用 id 和属性选择器找，VuePress 偶尔会改 id 形式
    var a = document.getElementById('demo-cta') || document.querySelector('a.demo-cta');
    if (a) {
      a.href = url;
      console.log('[shorturl-demo] updated button href →', url);
    } else {
      console.warn('[shorturl-demo] 没找到 a.demo-cta 按钮（页面可能还没渲染完）');
    }
  }

  // 多重保险：DOMContentLoaded / window.load / 200ms 延时都试一次
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
  window.addEventListener('load', apply);
  setTimeout(apply, 200);
  setTimeout(apply, 1000);
})();
