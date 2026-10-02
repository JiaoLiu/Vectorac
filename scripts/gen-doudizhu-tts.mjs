#!/usr/bin/env node
/**
 * 斗地主报牌语音生成器（豆包 / 火山引擎「语音合成大模型 2.0」）
 *
 * 用法：
 *   node scripts/gen-doudizhu-tts.mjs list                     查看全部可生成条目
 *   node scripts/gen-doudizhu-tts.mjs bomb --out /tmp/b.mp3    生成单条并指定输出（试听）
 *   node scripts/gen-doudizhu-tts.mjs bomb                     生成单条到默认音频目录
 *   node scripts/gen-doudizhu-tts.mjs all                      生成全部条目
 *   node scripts/gen-doudizhu-tts.mjs all --out-dir <目录>     批量输出到指定目录
 *   node scripts/gen-doudizhu-tts.mjs --text "王炸" --out /tmp/a.mp3   直接合成任意文本
 *   node scripts/gen-doudizhu-tts.mjs <条目> --speaker <id>     指定音色
 *
 * 鉴权（Key 不落盘）：
 *   1) 环境变量 DOUBAO_TTS_API_KEY（可选，用于脚本化调用）
 *   2) 未设置时在终端交互输入，输入不回显
 *
 * 说明：默认普通话（不指定方言）。条目 key 与 /audio/doudizhu/{key}.mp3
 *      一一对应，ui.js 报牌时按相同 key 请求，缺失时回退浏览器 TTS。
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, '.vuepress', 'public', 'audio', 'doudizhu')

const ENDPOINT = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional'
const RESOURCE_ID = 'seed-tts-2.0'
const SPEAKER = 'zh_female_vv_uranus_bigtts'

// 点数口播：rank 3..15 = 3..2，16/17 = 小王/大王
const SPOKEN = ['三', '四', '五', '六', '七', '八', '九', '十', '勾', '圈', '凯', '尖', '二']

/** key -> 待合成文本（key 与 /audio/doudizhu/{key}.mp3 一一对应） */
function buildEntries() {
  const m = new Map()
  // 单张：s-3 .. s-15，另有 s-16 小王 / s-17 大王
  SPOKEN.forEach((t, i) => m.set(`s-${i + 3}`, t))
  m.set('s-16', '小王')
  m.set('s-17', '大王')
  // 对子：p-3 .. p-15
  SPOKEN.forEach((t, i) => m.set(`p-${i + 3}`, '对' + t))
  // 三张：t-3 .. t-15
  SPOKEN.forEach((t, i) => m.set(`t-${i + 3}`, '三个' + t))
  // 牌型固定词
  m.set('trio-solo', '三带一')
  m.set('trio-pair', '三带二')
  m.set('straight', '顺子')
  m.set('pair-seq', '连对')
  m.set('plane', '飞机')
  m.set('plane-wings', '飞机带翅膀')
  m.set('quad', '四带二')
  m.set('bomb', '炸弹')
  m.set('rocket', '王炸')
  // 不出 / 叫分
  m.set('pass', '不要')
  m.set('bid-0', '不叫')
  m.set('bid-1', '一分')
  m.set('bid-2', '两分')
  m.set('bid-3', '三分')
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
      if (chunk === '') { // Ctrl+C
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
      if (chunk === '' || chunk === '\b') {
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

async function synth(text, apiKey, speaker) {
  const reqParams = {
    text,
    speaker,
    audio_params: { format: 'mp3', sample_rate: 24000 },
  }

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
  const speaker = flag('--speaker', SPEAKER)
  const customText = flag('--text')
  const out = flag('--out')
  const outDir = path.resolve(ROOT, flag('--out-dir', OUT_DIR))

  if (!argv.length || positional[0] === 'list') {
    console.log(`可生成条目（共 ${entries.size} 条，默认写入 ${path.relative(ROOT, OUT_DIR)}）：`)
    for (const [k, v] of entries) console.log(`  ${k.padEnd(12)} ${v}`)
    console.log('\n示例：node scripts/gen-doudizhu-tts.mjs bomb --out /tmp/bomb.mp3')
    return
  }

  const want = positional[0]
  if (out && want === 'all') {
    throw new Error('--out 只能指定单个文件，批量生成请改用 --out-dir <目录>。')
  }

  const apiKey = await loadApiKey()

  if (customText) {
    const file = out || path.join(outDir, 'custom.mp3')
    await writeAudio(file, await synth(customText, apiKey, speaker))
    return
  }

  const targets = want === 'all' ? [...entries] : [[want, entries.get(want)]]

  if (!targets[0][1]) {
    throw new Error(`未知条目「${want}」。用 list 查看全部条目。`)
  }

  for (const [key, text] of targets) {
    const file = out || path.join(outDir, `${key}.mp3`)
    process.stdout.write(`… ${key} (${text})\n`)
    await writeAudio(file, await synth(text, apiKey, speaker))
  }

  // 刷新语音清单：audio.js 只对清单内条目请求 mp3，其余走浏览器 TTS
  const files = await fs.readdir(outDir).catch(() => [])
  const keys = files.filter(f => f.endsWith('.mp3')).map(f => f.replace(/\.mp3$/, '')).sort()
  await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(keys, null, 1) + '\n')
  console.log(`✓ manifest.json（${keys.length} 条）`)
}

main().catch((e) => {
  console.error('✗ ' + e.message)
  process.exitCode = 1
})
