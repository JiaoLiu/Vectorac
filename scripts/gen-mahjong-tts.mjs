#!/usr/bin/env node
/**
 * 麻将语音生成器（豆包 / 火山引擎「语音合成大模型 2.0」）
 *
 * 用法：
 *   node scripts/gen-mahjong-tts.mjs list                     查看全部可生成条目
 *   node scripts/gen-mahjong-tts.mjs hu --out /tmp/hu.mp3     生成单条并指定输出（试听）
 *   node scripts/gen-mahjong-tts.mjs hu                       生成单条到默认音频目录
 *   node scripts/gen-mahjong-tts.mjs all                      生成全部条目
 *   node scripts/gen-mahjong-tts.mjs all --out-dir <目录>     批量输出到指定目录
 *   node scripts/gen-mahjong-tts.mjs --text "我胡了" --out /tmp/a.mp3   直接合成任意文本
 *   node scripts/gen-mahjong-tts.mjs <条目> --dialect sichuan  指定方言（默认 sichuan）
 *   node scripts/gen-mahjong-tts.mjs <条目> --dialect ""       不指定方言（普通话）
 *   node scripts/gen-mahjong-tts.mjs <条目> --speaker <id>     指定音色
 *
 * 鉴权（Key 不落盘）：
 *   1) 环境变量 DOUBAO_TTS_API_KEY（可选，用于脚本化调用）
 *   2) 未设置时在终端交互输入，输入不回显
 *
 * 说明：explicit_dialect 取值 sichuan / dongbei / shaanxi / beijing / henan /
 *      shanghai / tianjin / yue，但 speaker 必须是支持该方言的音色。
 *      支持四川话的 2.0 女声：Vivi 2.0（默认）、小何 2.0（zh_female_xiaohe_uranus_bigtts）。
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, '.vuepress', 'public', 'audio', 'mahjong')

const ENDPOINT = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional'
const RESOURCE_ID = 'seed-tts-2.0'
const SPEAKER = 'zh_female_vv_uranus_bigtts'

const RANKS = ['一', '二', '三', '四', '五', '六', '七', '八', '九']
const SUITS = [['wan', '万'], ['tong', '筒'], ['tiao', '条']]
// 与 ui.js 的 CHAT_PHRASES 索引严格对齐（顺序不能动）。这里的文案是「配音真正念的」，
// 允许与界面显示文案不同：界面要保持 3 字短标语（气泡和按钮宽度有限），
// 配音可以放开写长、写搞笑，长一点也只是音频时长，不影响布局。
const CHAT_PHRASES = ['快点儿，老子数到3', '等等，我想想', '别放炮哦', '这牌打得漂亮', '手气真好', '稳一手', '碰得好！', '承让承让']

/** key -> 待合成文本（key 与 /audio/mahjong/{key}.mp3 一一对应） */
function buildEntries() {
  const m = new Map()
  m.set('peng', '碰')
  m.set('gang', '杠')
  m.set('hu', '胡了')
  // 自摸：旧文案「自摸」两字 1.3s 太短促（用户反馈），改庆祝式长句，
  // 与「胡了」的语气衔接，时长约 2s（zimo.mp3 曾在满音量处被硬切，2026-10-02 已临时 ffmpeg 补淡出）
  m.set('zimo', '自摸，胡喽！')
  for (const [suit, name] of SUITS) {
    RANKS.forEach((r, i) => m.set(`${suit}${i + 1}`, r + name))
  }
  CHAT_PHRASES.forEach((t, i) => m.set(`phrase-${i}`, t))
  return m
}

async function loadApiKey() {
  const fromEnv = process.env.DOUBAO_TTS_API_KEY
  if (fromEnv && fromEnv.trim()) return fromEnv.trim()
  if (!process.stdin.isTTY) {
    throw new Error('未提供 API Key。非交互环境下请设置环境变量 DOUBAO_TTS_API_KEY。')
  }
  return promptHidden('请输入豆包 API Key（输入不回显，回车确认）：')
}

/** 终端交互读取一行并不回显，避免 Key 留在屏幕或 shell 历史里 */
function promptHidden(label) {
  return new Promise((resolve) => {
    const stdin = process.stdin
    process.stdout.write(label)
    stdin.setRawMode(true)
    stdin.setEncoding('utf8')
    stdin.resume()
    let buf = ''
    const finish = () => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.off('data', onData)
      process.stdout.write('\n')
      resolve(buf.trim())
    }
    const onData = (chunk) => {
      if (chunk === '\u0003') { // Ctrl+C
        process.stdout.write('\n')
        process.exit(130)
      }
      // 粘贴时可能一次送入多个字符，且末尾带换行
      const nl = chunk.search(/[\r\n]/)
      if (nl >= 0) {
        buf += chunk.slice(0, nl)
        finish()
        return
      }
      if (chunk === '\u007f' || chunk === '\b') {
        buf = buf.slice(0, -1)
        return
      }
      buf += chunk
    }
    stdin.on('data', onData)
  })
}

/** 从流式响应里按大括号配对切出完整 JSON 对象 */
async function* iterateJson(body) {
  const reader = body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (value) buf += dec.decode(value, { stream: true })
    let end
    while ((end = scanJsonEnd(buf)) > 0) {
      const obj = JSON.parse(buf.slice(0, end))
      buf = buf.slice(end)
      yield obj
    }
    if (done) break
  }
}

/** 返回第一个完整 JSON 对象的结束下标；未闭合返回 0 */
function scanJsonEnd(s) {
  const start = s.search(/\S/)
  if (start < 0 || s[start] !== '{') return 0
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
    } else if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return i + 1
  }
  return 0
}

async function synth(text, apiKey, speaker, dialect) {
  const reqParams = {
    text,
    speaker,
    audio_params: { format: 'mp3', sample_rate: 24000 },
  }
  // 留空则不指定方言（普通话）
  // 注意：explicit_dialect 是 additions 的子字段，且 additions 须传 JSON 序列化后的字符串
  if (dialect) reqParams.additions = JSON.stringify({ explicit_dialect: dialect })

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
      'X-Api-Resource-Id': RESOURCE_ID,
      'X-Api-Request-Id': crypto.randomUUID(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ req_params: reqParams }),
  })

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}：${await res.text()}`)
  }

  const parts = []
  for await (const obj of iterateJson(res.body)) {
    // 20000000 是「音频合成结束」的成功哨兵码（官方定义为 ok），不是错误
    if (obj.code === 20000000) break
    if (obj.code != null && obj.code !== 0) {
      throw new Error(`合成失败 code=${obj.code} message=${obj.message}`)
    }
    if (obj.data) parts.push(Buffer.from(obj.data, 'base64'))
  }
  if (!parts.length) throw new Error('服务端未返回音频数据')
  return Buffer.concat(parts)
}

async function writeAudio(file, bytes) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, bytes)
  console.log(`✓ ${path.relative(ROOT, file)}  (${(bytes.length / 1024).toFixed(1)} KB)`)
}

async function main() {
  const argv = process.argv.slice(2)
  const flag = (name, def) => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : def
  }
  const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')))

  const entries = buildEntries()
  const dialect = flag('--dialect', 'sichuan')
  const speaker = flag('--speaker', SPEAKER)
  const customText = flag('--text')
  const out = flag('--out')
  const outDir = path.resolve(ROOT, flag('--out-dir', OUT_DIR))

  if (!argv.length || positional[0] === 'list') {
    console.log('可生成条目（默认写入 ' + path.relative(ROOT, OUT_DIR) + '）：')
    for (const [k, v] of entries) console.log(`  ${k.padEnd(9)} ${v}`)
    console.log('\n示例：node scripts/gen-mahjong-tts.mjs hu --out /tmp/hu.mp3')
    return
  }

  const want = positional[0]
  if (out && want === 'all') {
    throw new Error('--out 只能指定单个文件，批量生成请改用 --out-dir <目录>。')
  }

  const apiKey = await loadApiKey()

  if (customText) {
    const file = out || path.join(outDir, 'custom.mp3')
    await writeAudio(file, await synth(customText, apiKey, speaker, dialect))
    return
  }

  const targets = want === 'all' ? [...entries] : [[want, entries.get(want)]]

  if (!targets[0][1]) {
    throw new Error(`未知条目「${want}」。用 list 查看全部条目。`)
  }

  for (const [key, text] of targets) {
    const file = out || path.join(outDir, `${key}.mp3`)
    process.stdout.write(`… ${key} (${text})\n`)
    await writeAudio(file, await synth(text, apiKey, speaker, dialect))
  }
}

main().catch((e) => {
  console.error('✗ ' + e.message)
  process.exitCode = 1
})
