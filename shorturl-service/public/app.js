// 公共前端：toast / fetch 包装的兜底实现（页面大多内联了 api 工具，但部分页面引用 app.js）
(function () {
  if (!window.api) {
    window.api = {
      async req(method, url, body) {
        const opt = { method, headers: { 'Content-Type': 'application/json' } };
        if (body) opt.body = JSON.stringify(body);
        const r = await fetch(url, opt);
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
        return data;
      },
      async copy(text) {
        try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
      },
      toast(msg, type) {
        let t = document.getElementById('toast');
        if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
        t.className = 'toast ' + (type || '');
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2200);
      }
    };
  }
})();
