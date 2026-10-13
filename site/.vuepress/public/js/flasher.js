// 固件刷写页：纯前端，基于 Web Serial API + esptool-js
//
// - 不需要后端：固件 .bin 文件托管在 /firmware/ 下，浏览器直接 fetch 下来刷到芯片
// - 整个工程跟着 VuePress 一起 build/部署，不再像 shorturl-service 那样独立 Node 进程
//
// 入口页：/blogs/other/flasher.md
// 容器： <div id="flasher-app"></div>
//
// VuePress 1.x SSR 守卫：Node 端 build 时不执行任何 DOM/浏览器 API
(function () {
  if (typeof window === 'undefined') return;
  if (!window.__FLASHER_LOADED__) window.__FLASHER_LOADED__ = true;
  else return; // 防止页面切换重复注入

  // CDN: esptool-js 0.6.0
  // 必须用 ESM CDN（不是 unpkg）：esptool-js 内部 `import atob from "atob-lite"`
  // 是 CJS 模块，unpkg 直接 ESM 加载会拿到 undefined，导致 stub 解码失败
  // （官方 issue #167）。esm.sh / skypack 会自动把 CJS 转 ESM 并 polyfill Node 依赖。
  // 顺序：esm.sh（首选，国内可达） → skypack（备选） → unpkg（最后兜底，已知有 bug）
  const ESPTOOL_JS_URLS = [
    'https://esm.sh/esptool-js@0.6.0',
    'https://cdn.skypack.dev/esptool-js@0.6.0',
    'https://unpkg.com/esptool-js@0.6.0/lib/index.js'
  ];

  // 固件清单 URL（相对站点根）
  const MANIFEST_URL = '/firmware/manifest.json';

  // 默认波特率
  const DEFAULT_BAUDRATE = 921600;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'style' && typeof attrs[k] === 'object') Object.assign(node.style, attrs[k]);
        else if (k.startsWith('on') && typeof attrs[k] === 'function') node.addEventListener(k.slice(2), attrs[k]);
        else if (k === 'html') node.innerHTML = attrs[k];
        else node.setAttribute(k, attrs[k]);
      }
    }
    for (const c of children) {
      if (c == null || c === false) continue;
      if (typeof c === 'string' || typeof c === 'number') node.appendChild(document.createTextNode(String(c)));
      else node.appendChild(c);
    }
    return node;
  }

  function logToTerminal(term, msg, kind) {
    // kind: 'info' | 'warn' | 'error' | 'success' | 'raw'
    const span = el('div', { class: 'flasher-log-line flasher-log-' + (kind || 'raw') });
    if (kind === 'raw') {
      span.style.whiteSpace = 'pre-wrap';
    }
    span.textContent = msg;
    term.appendChild(span);
    term.scrollTop = term.scrollHeight;
  }

  function buildTerminal(termEl) {
    return {
      clean() { termEl.innerHTML = ''; },
      writeLine(data) { logToTerminal(termEl, data, 'info'); },
      write(data) { logToTerminal(termEl, data, 'raw'); }
    };
  }

  function setBtn(btn, label, disabled) {
    if (!btn) return;
    btn.textContent = label;
    btn.disabled = !!disabled;
    if (disabled) btn.classList.add('is-disabled');
    else btn.classList.remove('is-disabled');
  }

  function setStatus(node, text, kind) {
    node.textContent = text;
    node.className = 'flasher-status flasher-status-' + (kind || 'idle');
  }

  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  async function loadManifest() {
    const res = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('读取固件清单失败：' + res.status + ' ' + res.statusText);
    const list = await res.json();
    if (!Array.isArray(list)) {
      throw new Error('固件清单格式错误：必须是数组');
    }
    return list; // 空数组也是合法的，表示暂无官方固件
  }

  // ===== 主入口 =====
  function init() {
    const mount = document.getElementById('flasher-app');
    if (!mount) {
      // 当前页不是 flasher.md，跳过
      return;
    }
    if (mount.dataset.mounted === '1') return;
    mount.dataset.mounted = '1';

    // 兼容性检测
    const serialSupported = 'serial' in navigator;
    const isSecure = location.protocol === 'https:' ||
                     location.hostname === 'localhost' ||
                     location.hostname === '127.0.0.1' ||
                     location.hostname.endsWith('.localhost');

    // ====== UI 骨架 ======
    const root = el('div', { class: 'flasher-root' });

    // 兼容性提示
    if (!serialSupported || !isSecure) {
      const warn = el('div', { class: 'flasher-warn' });
      const lines = [];
      if (!serialSupported) {
        lines.push('当前浏览器不支持 Web Serial API。请用 Chrome / Edge 89+ 打开本页。');
      }
      if (!isSecure) {
        lines.push('Web Serial 需要安全上下文（HTTPS 或 localhost）。当前地址：' + location.href);
      }
      warn.appendChild(el('p', null, lines[0]));
      if (lines[1]) warn.appendChild(el('p', null, lines[1]));
      warn.appendChild(el('p', { class: 'flasher-warn-hint' },
        '建议：1) 本地用 npm run dev 调试（localhost 自动安全）；2) 线上用 https:// 访问。'));
      root.appendChild(warn);
    }

    // 固件选择
    const firmwareSection = el('div', { class: 'flasher-section' });
    const firmwareLabel = el('label', { class: 'flasher-label', for: 'flasher-select' }, '选择固件');
    firmwareSection.appendChild(firmwareLabel);
    // 隐藏的 file input，由下拉框的"从本地选择"项触发
    const localFileInput = el('input', {
      type: 'file', id: 'flasher-local-file', accept: '.bin,.hex,.img,.elf',
      style: { display: 'none' }
    });
    firmwareSection.appendChild(localFileInput);

    const firmwareSelect = el('select', { id: 'flasher-select', class: 'flasher-select' });
    firmwareSelect.appendChild(el('option', { value: '' }, '— 加载中… —'));
    const meta = el('div', { class: 'flasher-meta' });
    firmwareSection.appendChild(firmwareSelect);
    firmwareSection.appendChild(meta);
    root.appendChild(firmwareSection);

    // 操作区（只留擦除选项；波特率自动从固件清单读，未指定则用 921600）
    const opsSection = el('div', { class: 'flasher-section' });
    const eraseAllWrap = el('label', { class: 'flasher-checkbox' },
      el('input', { type: 'checkbox', id: 'flasher-erase-all' }),
      ' 刷写前擦除整片 Flash（慎用）'
    );
    opsSection.appendChild(el('div', { class: 'flasher-row' }, eraseAllWrap));
    root.appendChild(opsSection);

    // 按钮
    const btnRow = el('div', { class: 'flasher-btnrow' });
    const connectBtn = el('button', { class: 'flasher-btn flasher-btn-primary' }, '连接串口');
    const eraseBtn = el('button', { class: 'flasher-btn', disabled: 'true' }, '擦除 Flash');
    const flashBtn = el('button', { class: 'flasher-btn flasher-btn-success', disabled: 'true' }, '开始烧录');
    const disconnectBtn = el('button', { class: 'flasher-btn flasher-btn-ghost', disabled: 'true' }, '断开');
    btnRow.appendChild(connectBtn);
    btnRow.appendChild(eraseBtn);
    btnRow.appendChild(flashBtn);
    btnRow.appendChild(disconnectBtn);
    root.appendChild(btnRow);

    // 状态
    const statusBar = el('div', { class: 'flasher-status flasher-status-idle' }, '未连接');
    root.appendChild(statusBar);

    // 进度
    const progressWrap = el('div', { class: 'flasher-progress-wrap', style: { display: 'none' } });
    const progressBar = el('div', { class: 'flasher-progress-bar' });
    const progressFill = el('div', { class: 'flasher-progress-fill', style: { width: '0%' } });
    const progressLabel = el('div', { class: 'flasher-progress-label' }, '0%');
    progressBar.appendChild(progressFill);
    progressWrap.appendChild(progressLabel);
    progressWrap.appendChild(progressBar);
    root.appendChild(progressWrap);

    // 终端日志
    const termTitle = el('div', { class: 'flasher-term-title' }, '终端日志');
    const terminal = el('div', { class: 'flasher-terminal' });
    const termBox = el('div', { class: 'flasher-term-box' }, terminal);
    const clearBtn = el('button', { class: 'flasher-btn flasher-btn-mini flasher-btn-ghost' }, '清空日志');
    termTitle.appendChild(clearBtn);
    root.appendChild(termTitle);
    root.appendChild(termBox);

    // ====== 串口调试面板 ======
    // 与烧录区互斥：esptool 占着串口时不能塞用户数据，所以这里是独立连接
    const serialSection = el('div', { class: 'flasher-serial-section' });
    const serialTitle = el('div', { class: 'flasher-section-title' }, '串口调试');
    const serialHint = el('div', { class: 'flasher-serial-hint' },
      '独立串口连接，不走 esptool。烧录完成后可在此直接发收数据，但需要先断开上方的烧录连接。'
    );
    serialSection.appendChild(serialTitle);
    serialSection.appendChild(serialHint);

    // 串口配置行
    const serialCfgRow = el('div', { class: 'flasher-serial-cfg' });
    const serialBaudLabel = el('label', { class: 'flasher-mini-label' }, '波特率');
    const serialBaudInput = el('select', { id: 'serial-baud', class: 'flasher-mini-select' });
    [115200, 230400, 460800, 921600, 460800, 230400, 19200, 9600].forEach((b, i, arr) => {
      // 去重
      if (arr.indexOf(b) !== i) return;
      serialBaudInput.appendChild(el('option', { value: String(b) }, String(b)));
    });
    serialBaudInput.value = '115200';
    const serialNewlineLabel = el('label', { class: 'flasher-mini-label' }, '换行');
    const serialNewlineSelect = el('select', { id: 'serial-newline', class: 'flasher-mini-select' });
    serialNewlineSelect.appendChild(el('option', { value: '' }, '无'));
    serialNewlineSelect.appendChild(el('option', { value: '\\n' }, '\\n (LF)'));
    serialNewlineSelect.appendChild(el('option', { value: '\\r\\n', selected: 'selected' }, '\\r\\n (CRLF)'));
    serialNewlineSelect.appendChild(el('option', { value: '\\r' }, '\\r (CR)'));
    const serialHexRxLabel = el('label', { class: 'flasher-checkbox flasher-mini-checkbox' },
      el('input', { type: 'checkbox', id: 'serial-hex-rx' }), ' HEX 显示'
    );
    const serialHexTxLabel = el('label', { class: 'flasher-checkbox flasher-mini-checkbox' },
      el('input', { type: 'checkbox', id: 'serial-hex-tx' }), ' HEX 发送'
    );
    const serialEchoLabel = el('label', { class: 'flasher-checkbox flasher-mini-checkbox' },
      el('input', { type: 'checkbox', id: 'serial-echo', checked: 'checked' }), ' 回显发送'
    );
    serialCfgRow.appendChild(serialBaudLabel);
    serialCfgRow.appendChild(serialBaudInput);
    serialCfgRow.appendChild(serialNewlineLabel);
    serialCfgRow.appendChild(serialNewlineSelect);
    serialCfgRow.appendChild(serialHexRxLabel);
    serialCfgRow.appendChild(serialHexTxLabel);
    serialCfgRow.appendChild(serialEchoLabel);
    serialSection.appendChild(serialCfgRow);

    // 串口按钮
    const serialBtnRow = el('div', { class: 'flasher-btnrow' });
    const serialConnectBtn = el('button', { class: 'flasher-btn flasher-btn-primary' }, '连接串口');
    const serialDisconnectBtn = el('button', { class: 'flasher-btn flasher-btn-ghost', disabled: 'true' }, '断开');
    const serialClearRxBtn = el('button', { class: 'flasher-btn flasher-btn-mini flasher-btn-ghost' }, '清空接收');
    serialBtnRow.appendChild(serialConnectBtn);
    serialBtnRow.appendChild(serialDisconnectBtn);
    serialBtnRow.appendChild(serialClearRxBtn);
    serialSection.appendChild(serialBtnRow);

    // 串口状态
    const serialStatus = el('div', { class: 'flasher-status flasher-status-idle' }, '未连接');
    serialSection.appendChild(serialStatus);

    // 接收区
    const serialRxTitle = el('div', { class: 'flasher-term-title' }, '接收数据');
    const serialRx = el('div', { class: 'flasher-terminal' });
    const serialRxBox = el('div', { class: 'flasher-term-box' }, serialRx);
    serialSection.appendChild(serialRxTitle);
    serialSection.appendChild(serialRxBox);

    // 输入区
    const serialTxRow = el('div', { class: 'flasher-serial-tx-row' });
    const serialTxInput = el('input', {
      type: 'text', id: 'serial-tx', class: 'flasher-input flasher-serial-tx',
      placeholder: '输入要发送的数据，回车发送…', autocomplete: 'off'
    });
    const serialSendBtn = el('button', { class: 'flasher-btn flasher-btn-success', disabled: 'true' }, '发送');
    serialTxRow.appendChild(serialTxInput);
    serialTxRow.appendChild(serialSendBtn);
    serialSection.appendChild(serialTxRow);

    root.appendChild(serialSection);

    mount.appendChild(root);

    // 注入样式（仅注入一次）
    injectStyles();

    const terminal_api = buildTerminal(terminal);
    terminal_api.writeLine('欢迎使用 Vectorac 固件刷写工具');
    terminal_api.writeLine('协议：Web Serial API + esptool-js（来自 unpkg CDN）');
    if (!serialSupported || !isSecure) {
      terminal_api.writeLine('⚠ 当前环境不满足刷写条件，见上方提示', 'warn');
    }

    // ====== 状态 ======
    const state = {
      manifest: [],
      current: null,
      esploader: null,
      transport: null,
      port: null,
      chipName: null,
      connected: false,
      // 本地固件（从用户电脑选择的 .bin）
      localFirmware: null, // { name, version, data: Uint8Array, address, flashMode, flashFreq, flashSize, baudrate, date, note }
      // 串口调试模式（独立于 esptool 烧录连接）
      serialPort: null,
      serialReader: null,
      serialWriter: null,
      serialConnected: false,
      serialReadActive: false,
      serialLineBuf: ''
    };

    // ====== 加载清单 ======
    loadManifest().then(list => {
      state.manifest = list;
      firmwareSelect.innerHTML = '';
      if (list.length === 0) {
        firmwareSelect.appendChild(el('option', { value: '' }, '— 暂无官方固件，请从本地选择 —'));
        terminal_api.writeLine('ℹ 远程固件清单为空，请从本地选择固件文件', 'info');
      } else {
        list.forEach(item => {
          firmwareSelect.appendChild(el('option', { value: item.id },
            item.name + ' (v' + item.version + ')'));
        });
        firmwareSelect.appendChild(el('option', { value: '__local__', disabled: 'disabled' }, '──────────'));
      }
      // 追加"本地固件"项
      firmwareSelect.appendChild(el('option', { value: '__local__' }, '📁 从本地选择固件…'));
      firmwareSelect.dispatchEvent(new Event('change'));
    }).catch(err => {
      firmwareSelect.innerHTML = '';
      firmwareSelect.appendChild(el('option', { value: '' }, '— 加载失败 —'));
      firmwareSelect.appendChild(el('option', { value: '__local__' }, '📁 从本地选择固件…'));
      terminal_api.writeLine('✗ 远程固件清单加载失败：' + err.message + '（仍可使用本地固件）', 'warn');
    });

    // ====== 选择固件 ======
    firmwareSelect.addEventListener('change', () => {
      const id = firmwareSelect.value;
      meta.innerHTML = '';

      if (id === '__local__') {
        // 本地固件分支
        if (!state.localFirmware) {
          // 还没选过文件，触发文件选择
          localFileInput.click();
        } else {
          renderLocalFirmwareMeta();
          state.current = state.localFirmware;
          terminal_api.writeLine('已选择本地固件：' + state.localFirmware.name, 'info');
          updateButtonStates();
        }
        return;
      }

      // 远程清单固件
      state.localFirmware = null; // 切回远程时清掉本地缓存
      state.current = state.manifest.find(i => i.id === id) || null;
      if (!state.current) {
        updateButtonStates();
        return;
      }
      // 给远程清单项补默认值（manifest.json 可以只写 id/name/file）
      const fw = state.current;
      if (!fw.address) fw.address = '0x0';
      if (!fw.flashMode) fw.flashMode = 'dio';
      if (!fw.flashFreq) fw.flashFreq = '40m';
      if (!fw.flashSize) fw.flashSize = '4MB';
      if (!fw.version) fw.version = fw.id || '';
      const rows = [
        ['版本', fw.version],
        ['发布日期', fw.date || '—'],
        ['文件', fw.file],
        ['地址', fw.address],
        ['Flash', [fw.flashMode, fw.flashFreq, fw.flashSize].filter(Boolean).join(' / ')],
        ['备注', fw.note || '—']
      ];
      const table = el('table', { class: 'flasher-meta-tbl' });
      rows.forEach(([k, v]) => {
        table.appendChild(el('tr', null,
          el('th', null, k),
          el('td', null, String(v))
        ));
      });
      meta.appendChild(table);
      // 同步擦除提示
      terminal_api.writeLine('已选择固件：' + state.current.name, 'info');
      updateButtonStates();
    });

    // ====== 本地文件选择（由下拉框的「📁 从本地选择固件…」项触发） ======
    localFileInput.addEventListener('change', async () => {
      const file = localFileInput.files && localFileInput.files[0];
      if (!file) {
        // 用户取消了文件选择，回退到远程第一个
        if (state.manifest.length > 0) {
          firmwareSelect.value = state.manifest[0].id;
          firmwareSelect.dispatchEvent(new Event('change'));
        }
        return;
      }
      try {
        terminal_api.writeLine('→ 读取本地文件：' + file.name + ' (' + formatBytes(file.size) + ')', 'info');
        const buf = await file.arrayBuffer();
        const data = new Uint8Array(buf);

        // 尝试从 bootloader 文件头（0x0 偏移）解析 flash 参数
        // ESP image header 第 3 字节是 SPI mode，第 4 字节是 SPI speed+size
        let detected = null;
        if (data.length >= 8 && data[0] === 0xE9) {
          const mode = data[2];
          const speedSize = data[3];
          const modeMap = { 0: 'qio', 1: 'qout', 2: 'dio', 3: 'dout' };
          const speedMap = { 0: '40m', 1: '26m', 2: '20m', 0xF: '80m' };
          const sizeMap = { 0: '1MB', 1: '2MB', 2: '4MB', 3: '8MB', 4: '16MB', 5: '32MB' };
          detected = {
            flashMode: modeMap[mode] || 'dio',
            flashFreq: speedMap[(speedSize >> 4) & 0xF] || '40m',
            flashSize: sizeMap[speedSize & 0xF] || '4MB'
          };
          terminal_api.writeLine('  检测到 bootloader 头：' +
            detected.flashMode + ' / ' + detected.flashFreq + ' / ' + detected.flashSize, 'info');
        }

        state.localFirmware = {
          id: '__local__',
          name: file.name,
          version: '本地文件',
          data: data,
          file: file.name,
          address: '0x0',
          flashMode: (detected && detected.flashMode) || 'dio',
          flashFreq: (detected && detected.flashFreq) || '40m',
          flashSize: (detected && detected.flashSize) || '4MB',
          baudrate: null,
          date: new Date(file.lastModified).toISOString().slice(0, 10),
          note: '用户从本地选择的固件文件，未通过远程清单发布。'
        };
        state.current = state.localFirmware;
        renderLocalFirmwareMeta();
        terminal_api.writeLine('✓ 已加载本地固件：' + file.name + '，' + formatBytes(data.length), 'success');
        if (!detected) {
          terminal_api.writeLine('  未检测到 bootloader 头，使用默认参数 dio/40m/4MB，如需修改请在下方调整。', 'info');
        }
        updateButtonStates();
      } catch (err) {
        terminal_api.writeLine('✗ 读取本地文件失败：' + (err && err.message || err), 'error');
        state.localFirmware = null;
        state.current = null;
        updateButtonStates();
      }
    });

    // 渲染本地固件元数据（带可编辑字段）
    function renderLocalFirmwareMeta() {
      const fw = state.localFirmware;
      if (!fw) return;
      meta.innerHTML = '';

      const table = el('table', { class: 'flasher-meta-tbl' });
      const rows = [
        ['文件名', fw.name],
        ['大小', formatBytes(fw.data.length)],
        ['修改日期', fw.date]
      ];
      rows.forEach(([k, v]) => {
        table.appendChild(el('tr', null,
          el('th', null, k),
          el('td', null, String(v))
        ));
      });

      // 可编辑字段
      const trAddr = el('tr', null,
        el('th', null, '地址 *'),
        el('td', null)
      );
      const addrInput = el('input', {
        type: 'text', class: 'flasher-mini-input', value: fw.address,
        placeholder: '0x0', size: '12'
      });
      addrInput.addEventListener('change', () => {
        let v = addrInput.value.trim();
        if (!v.startsWith('0x') && !v.startsWith('0X')) v = '0x' + v;
        fw.address = v;
        terminal_api.writeLine('  本地固件烧录地址改为：' + v, 'info');
      });
      trAddr.querySelector('td').appendChild(addrInput);
      table.appendChild(trAddr);

      const trMode = el('tr', null,
        el('th', null, 'Flash 模式'),
        el('td', null)
      );
      const modeInput = el('select', { class: 'flasher-mini-select' });
      ['dio', 'qio', 'qout', 'dout'].forEach(m => {
        const opt = el('option', { value: m }, m);
        if (m === fw.flashMode) opt.selected = 'selected';
        modeInput.appendChild(opt);
      });
      modeInput.addEventListener('change', () => {
        fw.flashMode = modeInput.value;
      });
      trMode.querySelector('td').appendChild(modeInput);
      table.appendChild(trMode);

      const trFreq = el('tr', null,
        el('th', null, 'Flash 频率'),
        el('td', null)
      );
      const freqInput = el('select', { class: 'flasher-mini-select' });
      ['80m', '40m', '26m', '20m'].forEach(f => {
        const opt = el('option', { value: f }, f);
        if (f === fw.flashFreq) opt.selected = 'selected';
        freqInput.appendChild(opt);
      });
      freqInput.addEventListener('change', () => {
        fw.flashFreq = freqInput.value;
      });
      trFreq.querySelector('td').appendChild(freqInput);
      table.appendChild(trFreq);

      const trSize = el('tr', null,
        el('th', null, 'Flash 大小'),
        el('td', null)
      );
      const sizeInput = el('select', { class: 'flasher-mini-select' });
      ['1MB', '2MB', '4MB', '8MB', '16MB', '32MB'].forEach(s => {
        const opt = el('option', { value: s }, s);
        if (s === fw.flashSize) opt.selected = 'selected';
        sizeInput.appendChild(opt);
      });
      sizeInput.addEventListener('change', () => {
        fw.flashSize = sizeInput.value;
      });
      trSize.querySelector('td').appendChild(sizeInput);
      table.appendChild(trSize);

      meta.appendChild(table);
    }

    clearBtn.addEventListener('click', () => terminal_api.clean());

    function updateButtonStates() {
      setBtn(connectBtn, state.connected ? '已连接' : '连接串口', state.connected);
      setBtn(eraseBtn, '擦除 Flash', !state.connected);
      setBtn(flashBtn, '开始烧录', !state.connected || !state.current);
      setBtn(disconnectBtn, '断开', !state.connected);
      firmwareSelect.disabled = state.connected;
    }

    function setProgress(pct, label) {
      progressWrap.style.display = pct > 0 && pct < 100 ? '' : 'none';
      progressFill.style.width = pct.toFixed(1) + '%';
      progressLabel.textContent = label || (pct.toFixed(1) + '%');
    }

    // ====== 连接 ======
    connectBtn.addEventListener('click', async () => {
      if (state.connected) return;
      if (!serialSupported) {
        terminal_api.writeLine('✗ 当前浏览器不支持 Web Serial API', 'error');
        return;
      }
      try {
        setStatus(statusBar, '正在选择串口…', 'busy');
        terminal_api.writeLine('→ 请在浏览器弹窗里选择 ESP 设备串口', 'info');
        const port = await navigator.serial.requestPort();

        // 兜底：上次连接没正常断开时浏览器会报 "The port is already open"
        // 先尝试关一次，没打开就忽略错误
        try {
          await port.close();
          terminal_api.writeLine('→ 检测到端口仍打开，已自动关闭后重连', 'info');
        } catch (e) { /* 未打开，忽略 */ }

        // 波特率：优先用固件清单指定的；没指定就用默认（921600）
        const baud = (state.current && state.current.baudrate) || DEFAULT_BAUDRATE;
        setStatus(statusBar, '正在握手（波特率 ' + baud + '）…', 'busy');

        terminal_api.writeLine('→ 动态加载 esptool-js …', 'info');
        let mod = null;
        let lastErr = null;
        for (const url of ESPTOOL_JS_URLS) {
          try {
            mod = await import(url);
            terminal_api.writeLine('  已加载：' + url, 'info');
            break;
          } catch (e) {
            lastErr = e;
            terminal_api.writeLine('  加载失败：' + url + ' (' + (e && e.message || e) + ')', 'warn');
          }
        }
        if (!mod) {
          throw new Error('所有 esptool-js CDN 加载失败：' + (lastErr && lastErr.message || lastErr));
        }
        const { ESPLoader, Transport } = mod;

        // ====== Monkey-patch runStub: 绕过 atob-lite 的 bug ======
        // esptool-js 0.6.0 的 stubFlasher.js 用 `import atob from "atob-lite"`，
        // ESM CDN（esm.sh/skypack/unpkg）加载时 atob 解码会失败（issue #167）。
        // runStub() 在 main() 流程的后期才被调用，此时 this.chip 已由 detectChip() 设好。
        // 我们直接覆盖 runStub，自己 fetch stub JSON + 用原生 window.atob 解码 + 复刻上传逻辑。
        if (!ESPLoader.prototype.__patched_stub__) {
          ESPLoader.prototype.__patched_stub__ = true;
          const origRunStub = ESPLoader.prototype.runStub;
          ESPLoader.prototype.runStub = async function () {
            // 先试原版（万一某些环境下 atob-lite 能正常工作）
            try {
              return await origRunStub.call(this);
            } catch (e) {
              const msg = (e && e.message) || String(e);
              if (!/atob|not correctly encoded/i.test(msg)) throw e;
              terminal_api.writeLine('  ⚠ atob-lite 解码失败，使用 fallback…', 'warn');
            }

            // ---- Fallback: 自己 fetch + 解码 + 上传 ----
            if (this.syncStubDetected) {
              this.info("Stub is already running. No upload is necessary.");
              return this.chip;
            }
            this.info("Uploading stub...");

            const chipName = this.chip.CHIP_NAME;
            const chipRevision = this.chip.getChipRevision
              ? await this.chip.getChipRevision(this)
              : undefined;

            // 芯片名 → stub JSON 文件名映射（和 stubFlasher.js 一致）
            const stubMap = {
              'ESP32': 'stub_flasher_32',
              'ESP32-S2': 'stub_flasher_32s2',
              'ESP32-S3': 'stub_flasher_32s3',
              'ESP32-C3': 'stub_flasher_32c3',
              'ESP32-C2': 'stub_flasher_32c2',
              'ESP32-C5': 'stub_flasher_32c5',
              'ESP32-C6': 'stub_flasher_32c6',
              'ESP32-C61': 'stub_flasher_32c61',
              'ESP32-H2': 'stub_flasher_32h2',
              'ESP32-P4': chipRevision && chipRevision < 300 ? 'stub_flasher_32p4rc1' : 'stub_flasher_32p4',
              'ESP8266': 'stub_flasher_8266'
            };
            const stubFile = stubMap[chipName];
            if (!stubFile) throw new Error('Fallback: 不支持的芯片 ' + chipName);

            // 从 CDN fetch stub JSON（和 esptool-js 同源，保证版本一致）
            const stubUrls = [
              'https://cdn.jsdelivr.net/npm/esptool-js@0.6.0/lib/targets/stub_flasher/' + stubFile + '.json',
              'https://unpkg.com/esptool-js@0.6.0/lib/targets/stub_flasher/' + stubFile + '.json'
            ];
            let stubJson = null;
            for (const u of stubUrls) {
              try {
                const r = await fetch(u);
                if (r.ok) {
                  stubJson = await r.json();
                  terminal_api.writeLine('  已加载 stub: ' + u.split('/').pop(), 'info');
                  break;
                }
              } catch (_) { /* 试下一个 */ }
            }
            if (!stubJson) throw new Error('Fallback: stub JSON 下载失败');

            // 用原生 window.atob 解码（polyfill 过，容错）
            const decode = (str) => {
              const decoded = window.atob(str);
              return new Uint8Array(decoded.split('').map(c => c.charCodeAt(0)));
            };
            const decodedText = decode(stubJson.text);
            const decodedData = decode(stubJson.data);

            // 复刻原版 runStub 的上传序列
            const stub = [decodedText, decodedData];
            const starts = [stubJson.text_start, stubJson.data_start];
            for (let i = 0; i < stub.length; i++) {
              if (!stub[i] || stub[i].length === 0) continue;
              const offs = starts[i];
              const length = stub[i].length;
              const blocks = Math.floor((length + this.ESP_RAM_BLOCK - 1) / this.ESP_RAM_BLOCK);
              await this.memBegin(length, blocks, this.ESP_RAM_BLOCK, offs);
              for (let seq = 0; seq < blocks; seq++) {
                const fromOffs = seq * this.ESP_RAM_BLOCK;
                const toOffs = fromOffs + this.ESP_RAM_BLOCK;
                await this.memBlock(stub[i].slice(fromOffs, toOffs), seq);
              }
            }
            this.info("Running stub...");
            await this.memFinish(stubJson.entry);
            const packetResult = await this.transport.read(this.DEFAULT_TIMEOUT);
            const packetStr = String.fromCharCode(...packetResult);
            if (packetStr !== "OHAI") {
              throw new Error('Fallback: stub 启动失败，响应: ' + packetStr);
            }
            this.info("Stub running...");
            this.IS_STUB = true;
            return this.chip;
          };
        }

        const transport = new Transport(port, true);
        const esploader = new ESPLoader({
          transport,
          baudrate: baud,
          romBaudrate: baud,
          terminal: terminal_api
        });
        state.transport = transport;
        state.esploader = esploader;
        state.port = port; // 记下来，断开/重连兜底用

        const chip = await esploader.main();
        state.chipName = chip;
        state.connected = true;
        terminal_api.writeLine('✓ 已连接：' + chip, 'success');
        setStatus(statusBar, '已连接：' + chip, 'ok');
      } catch (err) {
        terminal_api.writeLine('✗ 连接失败：' + (err && err.message || err), 'error');
        setStatus(statusBar, '连接失败', 'error');
        state.connected = false;
      } finally {
        updateButtonStates();
      }
    });

    // ====== 擦除 ======
    eraseBtn.addEventListener('click', async () => {
      if (!state.connected || !state.esploader) return;
      const yes = window.confirm('确认擦除整片 Flash？此操作会清空所有数据，不可恢复。');
      if (!yes) return;
      try {
        setStatus(statusBar, '正在擦除 Flash…', 'busy');
        setBtn(eraseBtn, '擦除中…', true);
        terminal_api.writeLine('→ eraseFlash()', 'info');
        await state.esploader.eraseFlash();
        terminal_api.writeLine('✓ 擦除完成', 'success');
        setStatus(statusBar, '擦除完成（' + state.chipName + '）', 'ok');
      } catch (err) {
        terminal_api.writeLine('✗ 擦除失败：' + (err && err.message || err), 'error');
        setStatus(statusBar, '擦除失败', 'error');
      } finally {
        updateButtonStates();
      }
    });

    // ====== 烧录 ======
    flashBtn.addEventListener('click', async () => {
      if (!state.connected || !state.esploader || !state.current) return;
      const fw = state.current;
      const eraseAll = document.getElementById('flasher-erase-all').checked;

      try {
        setBtn(flashBtn, '烧录中…', true);
        let data;
        if (fw.id === '__local__' && fw.data) {
          // 本地固件：直接用已读取的 Uint8Array
          setStatus(statusBar, '使用本地固件…', 'busy');
          terminal_api.writeLine('→ 使用本地固件：' + fw.name, 'info');
          data = fw.data;
        } else {
          // 远程固件：fetch 下来
          setStatus(statusBar, '正在下载固件文件…', 'busy');
          terminal_api.writeLine('→ fetch(' + fw.file + ')', 'info');
          const res = await fetch(fw.file, { cache: 'no-store' });
          if (!res.ok) throw new Error('固件文件下载失败：' + res.status + ' ' + res.statusText);
          const buf = await res.arrayBuffer();
          data = new Uint8Array(buf);
        }
        terminal_api.writeLine('  固件大小：' + formatBytes(data.length), 'info');

        const address = parseInt(fw.address, 16) || 0;
        const flashOptions = {
          fileArray: [{ data: data, address: address }],
          flashSize: fw.flashSize || '4MB',
          flashMode: fw.flashMode || 'dio',
          flashFreq: fw.flashFreq || '40m',
          eraseAll: !!eraseAll,
          compress: true,
          reportProgress: (fileIndex, written, total) => {
            const pct = total > 0 ? (written / total) * 100 : 0;
            setProgress(pct, '写入 ' + formatBytes(written) + ' / ' + formatBytes(total));
          }
        };

        setStatus(statusBar, '正在写入 Flash…', 'busy');
        terminal_api.writeLine('→ writeFlash(addr=' + fw.address + ', ' + formatBytes(data.length) + ')', 'info');
        await state.esploader.writeFlash(flashOptions);

        setProgress(100, '完成');
        terminal_api.writeLine('✓ 写入完成', 'success');

        setStatus(statusBar, '正在校验 / 硬复位…', 'busy');
        await state.esploader.after('hard_reset');
        terminal_api.writeLine('✓ 已硬复位，固件已启动', 'success');
        setStatus(statusBar, '烧录完成 ✓', 'ok');
      } catch (err) {
        terminal_api.writeLine('✗ 烧录失败：' + (err && err.message || err), 'error');
        setStatus(statusBar, '烧录失败', 'error');
        setProgress(0);
      } finally {
        updateButtonStates();
      }
    });

    // ====== 断开 ======
    disconnectBtn.addEventListener('click', async () => {
      if (!state.connected) return;
      try {
        if (state.transport) {
          await state.transport.disconnect();
        }
        terminal_api.writeLine('✓ 已断开串口', 'info');
      } catch (err) {
        terminal_api.writeLine('断开时出错：' + (err && err.message || err), 'warn');
      }
      state.connected = false;
      state.esploader = null;
      state.transport = null;
      state.chipName = null;
      state.port = null;
      setStatus(statusBar, '未连接', 'idle');
      setProgress(0);
      updateButtonStates();
    });

    // 串口意外断开
    if (serialSupported) {
      navigator.serial.addEventListener('disconnect', (e) => {
        if (state.connected) {
          terminal_api.writeLine('⚠ 串口已断开：' + (e && e.target && e.target.getInfo ? JSON.stringify(e.target.getInfo()) : ''), 'warn');
          state.connected = false;
          state.esploader = null;
          state.transport = null;
          state.port = null;
          setStatus(statusBar, '串口已断开', 'error');
          updateButtonStates();
        }
        if (state.serialConnected) {
          appendSerialRx('⚠ 串口意外断开\n', 'warn');
          cleanupSerial();
          updateSerialButtonStates();
        }
      });
    }

    // ============================================================
    // 串口调试模式（独立连接，不走 esptool）
    // ============================================================
    function updateSerialButtonStates() {
      setBtn(serialConnectBtn, state.serialConnected ? '已连接' : '连接串口', state.serialConnected);
      setBtn(serialDisconnectBtn, '断开', !state.serialConnected);
      setBtn(serialSendBtn, '发送', !state.serialConnected);
      serialBaudInput.disabled = state.serialConnected;
      serialTxInput.disabled = !state.serialConnected;
    }

    function appendSerialRx(text, kind) {
      // kind: 'rx' | 'tx' | 'info' | 'warn' | 'error' | 'raw'
      const span = el('div', { class: 'flasher-log-line flasher-serial-' + (kind || 'raw') });
      if (kind === 'raw') span.style.whiteSpace = 'pre-wrap';
      else span.style.whiteSpace = 'pre-wrap';
      span.textContent = text;
      serialRx.appendChild(span);
      serialRx.scrollTop = serialRx.scrollHeight;
    }

    function bytesToHex(bytes) {
      return Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    }

    function parseHexInput(str) {
      // 允许 "AA BB CC" / "AABBCC" / "aa,bb,cc"
      const cleaned = str.replace(/0x/gi, '').replace(/[\s,]+/g, '');
      if (!/^[0-9a-fA-F]*$/.test(cleaned) || cleaned.length % 2 !== 0) {
        throw new Error('HEX 格式错误，必须是偶数位 16 进制（如 48 65 6C 6C 6F）');
      }
      const out = new Uint8Array(cleaned.length / 2);
      for (let i = 0; i < cleaned.length; i += 2) {
        out[i / 2] = parseInt(cleaned.substr(i, 2), 16);
      }
      return out;
    }

    function escapeNewlines(s) {
      return s.replace(/\r/g, '\\r').replace(/\n/g, '\\n');
    }

    async function startSerialReadLoop() {
      if (!state.serialPort || !state.serialPort.readable) return;
      state.serialReadActive = true;
      const decoder = new TextDecoder('utf-8');
      let reader;
      try {
        reader = state.serialPort.readable.getReader();
        state.serialReader = reader;
        while (state.serialReadActive) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;
          const hexOn = document.getElementById('serial-hex-rx').checked;
          if (hexOn) {
            appendSerialRx(bytesToHex(value) + ' ', 'rx');
          } else {
            // 按字符流式追加，遇到换行就 flush
            const text = decoder.decode(value, { stream: true });
            state.serialLineBuf += text;
            // 实时显示，行内不分段
            let idx;
            while ((idx = state.serialLineBuf.indexOf('\n')) >= 0) {
              const line = state.serialLineBuf.slice(0, idx + 1);
              state.serialLineBuf = state.serialLineBuf.slice(idx + 1);
              appendSerialRx(line, 'rx');
            }
            if (state.serialLineBuf.length > 0) {
              appendSerialRx(state.serialLineBuf, 'rx');
              state.serialLineBuf = '';
            }
          }
        }
      } catch (err) {
        if (state.serialReadActive) {
          appendSerialRx('✗ 读取错误：' + (err && err.message || err) + '\n', 'error');
        }
      } finally {
        if (reader) {
          try { reader.releaseLock(); } catch (e) { /* ignore */ }
        }
        state.serialReader = null;
        state.serialReadActive = false;
      }
    }

    function cleanupSerial() {
      state.serialReadActive = false;
      try { if (state.serialReader) state.serialReader.cancel().catch(() => {}); } catch (e) {}
      state.serialReader = null;
      try { if (state.serialWriter) state.serialWriter.close().catch(() => {}); } catch (e) {}
      state.serialWriter = null;
      try {
        if (state.serialPort) {
          state.serialPort.close().catch(() => {});
        }
      } catch (e) {}
      state.serialPort = null;
      state.serialConnected = false;
      state.serialLineBuf = '';
    }

    // 串口调试：连接
    serialConnectBtn.addEventListener('click', async () => {
      if (state.serialConnected) return;
      if (!serialSupported) {
        appendSerialRx('✗ 当前浏览器不支持 Web Serial API\n', 'error');
        return;
      }
      if (state.connected) {
        appendSerialRx('✗ 烧录连接还在占用串口，请先点上方「断开」\n', 'warn');
        return;
      }
      try {
        setStatus(serialStatus, '正在选择串口…', 'busy');
        appendSerialRx('→ 请在浏览器弹窗里选择串口\n', 'info');
        const port = await navigator.serial.requestPort();

        // already open 兜底
        try {
          await port.close();
          appendSerialRx('→ 检测到端口仍打开，已自动关闭后重连\n', 'info');
        } catch (e) { /* 未打开，忽略 */ }

        const baud = parseInt(serialBaudInput.value, 10) || 115200;
        setStatus(serialStatus, '正在打开串口（' + baud + '）…', 'busy');
        await port.open({ baudRate: baud });

        state.serialPort = port;
        state.serialConnected = true;

        // 启用 writer
        if (port.writable) {
          state.serialWriter = port.writable.getWriter();
        }

        appendSerialRx('✓ 已连接 @ ' + baud + ' 8N1\n', 'info');
        setStatus(serialStatus, '已连接 @ ' + baud + ' 8N1', 'ok');

        // 启动读取循环
        startSerialReadLoop();
      } catch (err) {
        appendSerialRx('✗ 连接失败：' + (err && err.message || err) + '\n', 'error');
        setStatus(serialStatus, '连接失败', 'error');
        cleanupSerial();
      } finally {
        updateSerialButtonStates();
      }
    });

    // 串口调试：断开
    serialDisconnectBtn.addEventListener('click', async () => {
      if (!state.serialConnected) return;
      try {
        appendSerialRx('→ 正在断开…\n', 'info');
        cleanupSerial();
        appendSerialRx('✓ 已断开\n', 'info');
        setStatus(serialStatus, '未连接', 'idle');
      } catch (err) {
        appendSerialRx('断开出错：' + (err && err.message || err) + '\n', 'warn');
      } finally {
        updateSerialButtonStates();
      }
    });

    // 串口调试：清空接收
    serialClearRxBtn.addEventListener('click', () => {
      serialRx.innerHTML = '';
      state.serialLineBuf = '';
    });

    // 串口调试：发送
    async function sendSerial() {
      if (!state.serialConnected || !state.serialWriter) return;
      const input = serialTxInput.value;
      if (!input) return;
      const newlineSel = serialNewlineSelect.value;
      const newlineStr = newlineSel.replace(/\\r/g, '\r').replace(/\\n/g, '\n');
      const hexTx = document.getElementById('serial-hex-tx').checked;
      const echo = document.getElementById('serial-echo').checked;

      let bytes;
      try {
        if (hexTx) {
          bytes = parseHexInput(input);
        } else {
          bytes = new TextEncoder().encode(input + newlineStr);
        }
      } catch (err) {
        appendSerialRx('✗ ' + (err.message || err) + '\n', 'error');
        return;
      }

      try {
        state.serialWriter.write(bytes);
        if (echo) {
          const display = hexTx ? ('→ TX [HEX]: ' + bytesToHex(bytes)) : ('→ TX: ' + input + escapeNewlines(newlineStr));
          appendSerialRx(display + '\n', 'tx');
        }
        serialTxInput.value = '';
      } catch (err) {
        appendSerialRx('✗ 发送失败：' + (err && err.message || err) + '\n', 'error');
      }
    }

    serialSendBtn.addEventListener('click', sendSerial);
    serialTxInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendSerial();
      }
    });

    updateSerialButtonStates();
    updateButtonStates();
  }

  function injectStyles() {
    if (document.getElementById('flasher-styles')) return;
    const style = document.createElement('style');
    style.id = 'flasher-styles';
    style.textContent = `
.flasher-root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; color: #2c3e50; max-width: 880px; margin: 1.5rem auto; padding: 1.25rem 1.5rem; border: 1px solid #ebeef5; border-radius: 10px; background: #fff; box-shadow: 0 2px 12px 0 rgba(0,0,0,.05); }
.flasher-warn { padding: .75rem 1rem; margin-bottom: 1rem; border-left: 4px solid #e6a23c; background: #fdf6ec; color: #b2781f; border-radius: 4px; font-size: 14px; }
.flasher-warn p { margin: .25rem 0; }
.flasher-warn-hint { font-size: 13px; color: #909399; }
.flasher-section { margin-bottom: 1rem; }
.flasher-label { display: block; margin-bottom: .4rem; font-size: 14px; color: #606266; font-weight: 600; }
.flasher-select, .flasher-input { width: 100%; max-width: 460px; padding: .5rem .6rem; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 14px; box-sizing: border-box; }
.flasher-select:focus, .flasher-input:focus { outline: none; border-color: #409eff; }
.flasher-row { margin: .6rem 0; }
.flasher-checkbox { display: inline-flex; align-items: center; gap: 4px; font-size: 14px; color: #606266; cursor: pointer; }
.flasher-meta { margin-top: .6rem; font-size: 13px; color: #606266; }
.flasher-meta-tbl { border-collapse: collapse; width: 100%; }
.flasher-meta-tbl th, .flasher-meta-tbl td { border: 1px solid #ebeef5; padding: .35rem .55rem; text-align: left; vertical-align: top; }
.flasher-meta-tbl th { width: 90px; background: #f5f7fa; font-weight: 500; color: #909399; }
.flasher-btnrow { display: flex; flex-wrap: wrap; gap: .5rem; margin: 1rem 0; }
.flasher-btn { padding: .5rem 1rem; font-size: 14px; border: 1px solid #dcdfe6; border-radius: 4px; background: #fff; cursor: pointer; transition: all .15s; color: #606266; }
.flasher-btn:hover:not(.is-disabled):not(:disabled) { border-color: #409eff; color: #409eff; }
.flasher-btn:disabled, .flasher-btn.is-disabled { opacity: .5; cursor: not-allowed; }
.flasher-btn-primary { background: #409eff; border-color: #409eff; color: #fff; }
.flasher-btn-primary:hover:not(:disabled) { background: #66b1ff; border-color: #66b1ff; color: #fff; }
.flasher-btn-success { background: #67c23a; border-color: #67c23a; color: #fff; }
.flasher-btn-success:hover:not(:disabled) { background: #85ce61; border-color: #85ce61; color: #fff; }
.flasher-btn-ghost { background: transparent; }
.flasher-btn-mini { padding: .25rem .55rem; font-size: 12px; }
.flasher-status { padding: .5rem .75rem; border-radius: 4px; font-size: 13px; margin-bottom: .75rem; }
.flasher-status-idle { background: #f4f4f5; color: #909399; }
.flasher-status-busy { background: #ecf5ff; color: #409eff; }
.flasher-status-ok { background: #f0f9eb; color: #67c23a; }
.flasher-status-error { background: #fef0f0; color: #f56c6c; }
.flasher-progress-wrap { margin: .5rem 0 1rem; }
.flasher-progress-label { font-size: 12px; color: #606266; margin-bottom: 4px; }
.flasher-progress-bar { width: 100%; height: 8px; background: #ebeef5; border-radius: 4px; overflow: hidden; }
.flasher-progress-fill { height: 100%; background: linear-gradient(90deg, #409eff, #67c23a); transition: width .15s; }
.flasher-term-title { display: flex; align-items: center; justify-content: space-between; margin: .5rem 0 .25rem; font-size: 13px; color: #909399; }
.flasher-term-box { background: #1e1e1e; color: #d4d4d4; border-radius: 6px; padding: .75rem; font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 12px; line-height: 1.5; max-height: 360px; overflow: auto; }
.flasher-terminal .flasher-log-line { white-space: pre-wrap; word-break: break-all; }
.flasher-log-info { color: #569cd6; }
.flasher-log-warn { color: #dcdcaa; }
.flasher-log-error { color: #f48771; }
.flasher-log-success { color: #89d185; }
.flasher-log-raw { color: #d4d4d4; }
@media (max-width: 720px) {
  .flasher-root { padding: .75rem; }
  .flasher-select, .flasher-input { max-width: 100%; }
  .flasher-serial-cfg { flex-direction: column; align-items: flex-start; }
}
.flasher-serial-section { margin-top: 1.5rem; padding-top: 1rem; border-top: 2px dashed #ebeef5; }
.flasher-section-title { font-size: 16px; font-weight: 600; color: #303133; margin-bottom: .4rem; }
.flasher-serial-hint { font-size: 12px; color: #909399; margin-bottom: .75rem; line-height: 1.5; }
.flasher-serial-cfg { display: flex; flex-wrap: wrap; gap: .75rem 1rem; align-items: center; margin-bottom: .6rem; }
.flasher-mini-label { font-size: 12px; color: #606266; display: block; margin-bottom: 2px; }
.flasher-mini-select { padding: .3rem .4rem; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 13px; background: #fff; }
.flasher-mini-checkbox { font-size: 12px; }
.flasher-serial-tx-row { display: flex; gap: .5rem; margin-top: .5rem; }
.flasher-serial-tx { flex: 1; max-width: none; font-family: "SF Mono", Menlo, Consolas, monospace; }
.flasher-serial-rx { color: #89d185; }
.flasher-serial-tx { color: #569cd6; }
.flasher-serial-info { color: #dcdcaa; }
.flasher-serial-warn { color: #dcdcaa; }
.flasher-serial-error { color: #f48771; }
.flasher-serial-raw { color: #d4d4d4; }
.flasher-mini-input { padding: .25rem .4rem; border: 1px solid #dcdfe6; border-radius: 4px; font-size: 12px; font-family: "SF Mono", Menlo, Consolas, monospace; width: 100px; }
`;
    document.head.appendChild(style);
  }

  // 等待 #flasher-app 出现并初始化
  function tryInit() {
    const el = document.getElementById('flasher-app');
    if (!el) return false;
    if (el.dataset.mounted === '1') return false;
    try {
      init();
    } catch (e) {
      console.error('[flasher] init() 失败:', e);
      el.dataset.mounted = '1'; // 防止反复抛异常
    }
    return true;
  }

  console.log('[flasher] 脚本已加载, readyState=', document.readyState, 'path=', location.pathname);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }

  // VuePress SPA 路由切换时 #flasher-app 会被销毁重建，
  // MutationObserver 在 Vue 虚拟 DOM diff 下可能不触发 childList，
  // 所以用 setInterval 轮询作为主方案，简单可靠。
  // 检测到未 mounted 的 #flasher-app 才 init，已 mounted 则跳过，开销极小。
  setInterval(() => {
    const el = document.getElementById('flasher-app');
    if (el && el.dataset.mounted !== '1') {
      console.log('[flasher] 检测到 #flasher-app 未挂载，重新 init');
      tryInit();
    }
  }, 300);

  // 路由事件兜底
  window.addEventListener('popstate', () => setTimeout(tryInit, 50));
  window.addEventListener('hashchange', () => setTimeout(tryInit, 50));
})();
