// ============================================================
// 大厅/房间共用选择控件（gamehall/controls.js）
// ------------------------------------------------------------
// 替代系统 <select>（手机端系统弹窗太小、风格也不统一）：
//   · segHtml     分段 chips —— 与大厅筛选 tab、五子棋「我先手/AI先手」同款
//   · stepperHtml −/＋ 步进器 —— 与麻将大厅 scmj-stepper 同款交互
// 当前值存在控件的 data-value 上；点击走 handleCtlClick，挂在各处既有的
// 事件委托里即可（返回 true 表示该次点击已被控件消费）。
// ============================================================

/** 思考时长档位（秒） */
export const TIMEOUT_VALUES = [10, 15, 20, 30, 45, 60]
export const fmtTimeout = v => v + ' 秒'
const FMT = { turnTimeoutSeconds: fmtTimeout, capFan: v => v + ' 番' }

/** 分段 chips：options [{value,label}]，current 当前值，disabled 只读（非房主） */
export function segHtml(name, options, current, disabled) {
  const cur = options.some(o => o.value === current) ? current : options[0].value
  return (
    '<span class="gh-seg' + (disabled ? ' is-disabled' : '') + '" data-ctl="' + name + '" data-value="' + cur + '">' +
    options
      .map(
        o =>
          '<button type="button" data-opt="' + o.value + '" class="' + (o.value === cur ? 'active' : '') + '"' +
          (disabled ? ' disabled' : '') + '>' + o.label + '</button>'
      )
      .join('') +
    '</span>'
  )
}

/** −/＋ 步进器：values 档位数组，current 当前值（不在档位里取就近档），fmt 显示格式化 */
export function stepperHtml(name, values, current, fmt, disabled) {
  let i = values.indexOf(current)
  if (i < 0) {
    i = values.findIndex(v => v >= current)
    if (i < 0) i = values.length - 1
  }
  const show = fmt || (v => String(v))
  return (
    '<span class="gh-stepper' + (disabled ? ' is-disabled' : '') + '" data-ctl="' + name +
    '" data-values="' + values.join(',') + '" data-value="' + values[i] + '">' +
    '<button type="button" data-step="-1"' + (disabled || i === 0 ? ' disabled' : '') + ' aria-label="减一">−</button>' +
    '<span class="gh-stepper-val">' + show(values[i]) + '</span>' +
    '<button type="button" data-step="1"' + (disabled || i === values.length - 1 ? ' disabled' : '') + ' aria-label="加一">＋</button>' +
    '</span>'
  )
}

/** 读控件当前值（字符串；数字自行 Number()） */
export function ctlValue(root, name) {
  const el = root.querySelector('[data-ctl="' + name + '"]')
  return el ? el.getAttribute('data-value') : undefined
}

/**
 * 在既有事件委托里调用：处理 chips 点选与步进器 −/＋。
 * @param {Event} ev 点击事件
 * @param {(name:string, value:string)=>void} [onChange] 值已变化回调（如即发 UPDATE_RULES）
 * @returns {boolean} 本次点击是否已被控件消费
 */
export function handleCtlClick(ev, onChange) {
  const t = ev.target
  if (!t || !t.closest) return false

  const chip = t.closest('.gh-seg [data-opt]')
  if (chip) {
    const seg = chip.closest('[data-ctl]')
    if (!seg || seg.classList.contains('is-disabled') || chip.disabled) return true
    seg.setAttribute('data-value', chip.getAttribute('data-opt'))
    for (const b of seg.querySelectorAll('[data-opt]')) b.classList.toggle('active', b === chip)
    if (onChange) onChange(seg.getAttribute('data-ctl'), seg.getAttribute('data-value'))
    return true
  }

  const stepBtn = t.closest('.gh-stepper [data-step]')
  if (stepBtn) {
    if (stepBtn.disabled) return true
    const box = stepBtn.closest('[data-ctl]')
    if (!box || box.classList.contains('is-disabled')) return true
    const values = box.getAttribute('data-values').split(',')
    let i = values.indexOf(box.getAttribute('data-value'))
    if (i < 0) i = 0
    i = Math.max(0, Math.min(values.length - 1, i + Number(stepBtn.getAttribute('data-step'))))
    box.setAttribute('data-value', values[i])
    const valEl = box.querySelector('.gh-stepper-val')
    const fmt = FMT[box.getAttribute('data-ctl')]
    if (valEl) valEl.textContent = fmt ? fmt(values[i]) : values[i]
    const dec = box.querySelector('[data-step="-1"]')
    const inc = box.querySelector('[data-step="1"]')
    if (dec) dec.disabled = i === 0
    if (inc) inc.disabled = i === values.length - 1
    if (onChange) onChange(box.getAttribute('data-ctl'), values[i])
    return true
  }

  return false
}
