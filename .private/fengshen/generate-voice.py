"""Internal prototype voice assets via existing Edge TTS (no paid API key).

python3 .private/fengshen/generate-voice.py
Only card/skill names are sent; no project files, credentials or game saves.
"""
import asyncio
import json
import subprocess
from pathlib import Path
import edge_tts

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'assets' / 'audio'
VOICES = {'male': 'zh-CN-YunxiNeural', 'female': 'zh-CN-XiaoxiaoNeural'}

async def main():
    entries = json.loads(subprocess.check_output([
        'node', '--input-type=module', '-e',
        "import {AUDIO_ENTRIES} from './.private/fengshen/audio-manifest.mjs';console.log(JSON.stringify(AUDIO_ENTRIES))"
    ], cwd=ROOT.parent.parent, text=True))
    available = {v['ShortName']: v['Gender'] for v in await edge_tts.list_voices()}
    for sex, voice in VOICES.items():
        if available.get(voice, '').lower() != sex:
            raise RuntimeError(f'Voice not verified: {sex} {voice}')
        (OUT / sex).mkdir(parents=True, exist_ok=True)
    semaphore = asyncio.Semaphore(1)
    async def generate(sex, voice, entry):
        path = OUT / sex / (entry['key'] + '.mp3')
        if path.exists() and path.stat().st_size > 1000:
            return
        async with semaphore:
            for attempt in range(6):
                try:
                    await asyncio.sleep(0.6)
                    await edge_tts.Communicate(entry['text'] + '！', voice, rate='+8%').save(str(path))
                    if path.stat().st_size < 1000:
                        raise RuntimeError('Empty audio')
                    print(f"OK {sex}/{entry['key']} {entry['text']}", flush=True)
                    return
                except Exception:
                    if attempt == 5:
                        raise
                    print(f"RETRY {sex}/{entry['key']} {attempt + 1}", flush=True)
                    await asyncio.sleep(2 * (attempt + 1))
    await asyncio.gather(*(generate(sex, voice, entry) for sex, voice in VOICES.items() for entry in entries))
    manifest = {'provider': 'Edge TTS', 'voices': VOICES, 'entries': entries, 'files': [f"{sex}/{e['key']}.mp3" for sex in VOICES for e in entries]}
    (OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"DONE {len(manifest['files'])} files", flush=True)

if __name__ == '__main__':
    asyncio.run(main())
