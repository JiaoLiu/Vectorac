// 短链演示按钮：根据当前 host 决定 href，并直接更新 DOM
// 放到外部 .js 是为了避免 VuePress SSR（Node 端）执行到 window
(function () {
  if (typeof window === 'undefined') return;
  var h = location.hostname;
  var url = (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost'))
    ? 'http://localhost:3030'
    : 'https://s.vectorac.com';

  window.__SHORTURL_DEMO_URL__ = url;

  function apply() {
    // 这是全局脚本，只允许命中短链页面的专用标记；不能使用通用
    // .demo-cta，否则会误改小V等其他页面的同名按钮。
    var a = document.querySelector('a[data-shorturl-demo]') || document.querySelector('a#demo-cta');
    if (a && a.href !== url) {
      a.href = url;
      console.log('[shorturl-demo] updated button href →', url);
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
