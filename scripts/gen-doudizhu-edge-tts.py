#!/usr/bin/env python3
"""斗地主报牌语音生成器（微软 Edge TTS，免费、无需 API Key）

用法：
  python3 scripts/gen-doudizhu-edge-tts.py            生成全部条目（已存在的跳过）
  python3 scripts/gen-doudizhu-edge-tts.py --force    全部重新生成
  python3 scripts/gen-doudizhu-edge-tts.py --voice zh-CN-XiaoyiNeural   换音色

依赖：pip install edge-tts
产物：.vuepress/public/audio/doudizhu/{key}.mp3 + manifest.json（audio.js 的加载清单，
      清单内条目播 mp3，清单外回退浏览器 speechSynthesis）。
"""
import argparse
import asyncio
import json
import sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / '.vuepress' / 'public' / 'audio' / 'doudizhu'

# 点数口播：rank 3..15 = 3..2（与 ui.js / gen-doudizhu-tts.mjs 条目一致）
# Q/K 直接用英文字母：Edge TTS 中文音色读字母 Q 为 /kju:/、K 为 /keɪ/，
# 早期写成「圈/凯」被用户吐槽（要读字母本音）
SPOKEN = ['三', '四', '五', '六', '七', '八', '九', '十', '勾', 'Q', 'K', '尖', '二']


def build_entries():
    m = {}
    for i, t in enumerate(SPOKEN):
        m[f's-{i + 3}'] = t
    m['s-16'] = '小王'
    m['s-17'] = '大王'
    for i, t in enumerate(SPOKEN):
        m[f'p-{i + 3}'] = '对' + t
    for i, t in enumerate(SPOKEN):
        m[f't-{i + 3}'] = '三个' + t
    m['trio-solo'] = '三带一'
    m['trio-pair'] = '三带二'
    m['straight'] = '顺子'
    m['pair-seq'] = '连对'
    m['plane'] = '飞机'
    m['plane-wings'] = '飞机带翅膀'
    m['quad'] = '四带二'
    m['bomb'] = '炸弹'
    m['rocket'] = '王炸'
    m['pass'] = '不要'
    m['bid-0'] = '不叫'
    m['bid-1'] = '一分'
    m['bid-2'] = '两分'
    m['bid-3'] = '三分'
    # 抢地主 / 加倍阶段表态（QQ 经典环节）
    m['rob'] = '抢地主'
    m['no-rob'] = '不抢'
    m['double'] = '加倍'
    m['super-double'] = '超级加倍'
    m['no-double'] = '不加倍'
    return m


# 斗地主联机快捷语（与 doudizhu/remote.js 的 DDZ_PHRASES 顺序严格对齐，
# 序号即服务端白名单 0-7）。产物写 /audio/gamehall/ddz/phrase-N.mp3，
# 与棋类共享的 /audio/gamehall/phrase-N.mp3（「好棋」等）分开。
DDZ_CHAT_PHRASES = [
    '快点吧，我等到花儿都谢了',
    '不要走，决战到天亮',
    '你的牌打得太好了',
    '炸得好！',
    '别吵，我在想牌',
    '大家好，很高兴见到各位',
    '你的手气太好了',
    '不服，再来！',
]


def build_phrase_entries():
    return {f'phrase-{i}': t for i, t in enumerate(DDZ_CHAT_PHRASES)}


async def gen_one(key, text, voice, rate, force, out_dir=None):
    out = (out_dir or OUT_DIR) / f'{key}.mp3'
    if out.exists() and not force:
        return 'skip'
    communicate = edge_tts.Communicate(text, voice=voice, rate=rate)
    await communicate.save(str(out))
    return 'ok'


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--force', action='store_true', help='覆盖已存在的 mp3')
    ap.add_argument('--voice', default='zh-CN-XiaoxiaoNeural', help='Edge TTS 音色')
    ap.add_argument('--rate', default='+8%', help='语速（报牌短词稍快更利落）')
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # 快捷语输出目录：联机聊天面板的斗地主专属语音（与棋类共享目录分开）
    phrase_dir = ROOT / '.vuepress' / 'public' / 'audio' / 'gamehall' / 'ddz'
    phrase_dir.mkdir(parents=True, exist_ok=True)
    entries = build_entries()
    phrase_entries = build_phrase_entries()
    ok = skip = 0
    for key, text in entries.items():
        try:
            r = await gen_one(key, text, args.voice, args.rate, args.force)
        except Exception as e:
            print(f'[fail] {key} {text}: {e}', file=sys.stderr)
            continue
        if r == 'ok':
            ok += 1
            print(f'[ok] {key}: {text}')
        else:
            skip += 1
    for key, text in phrase_entries.items():
        try:
            r = await gen_one(key, text, args.voice, '+0%', args.force, out_dir=phrase_dir)
        except Exception as e:
            print(f'[fail] ddz/{key} {text}: {e}', file=sys.stderr)
            continue
        if r == 'ok':
            ok += 1
            print(f'[ok] ddz/{key}: {text}')
        else:
            skip += 1
    # manifest 以磁盘实际产物为准：只列真实存在的 mp3，浏览器零 404
    keys = sorted(p.stem for p in OUT_DIR.glob('*.mp3') if not p.stem.startswith('bgm-'))
    (OUT_DIR / 'manifest.json').write_text(json.dumps(keys, ensure_ascii=False), encoding='utf-8')
    print(f'完成：新生成 {ok}，跳过 {skip}，manifest 共 {len(keys)} 条')


if __name__ == '__main__':
    asyncio.run(main())
