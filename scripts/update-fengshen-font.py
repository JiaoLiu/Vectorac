#!/usr/bin/env python3
"""Regenerate the licensed calligraphy subset; inspect the output cmap, not CSS."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument("source", type=Path, help="Official MaShanZheng-Regular.ttf (OFL)")
parser.add_argument("--version", default="v2", help="Increment for a new, cache-safe font URL")
args = parser.parse_args()
font_dir = root / "site/.vuepress/components/fengshen/assets/fonts"
names = json.loads(subprocess.check_output([
    "node", "--input-type=module", "-e",
    "import {CARDS_BY_TYPE,HEROES} from './site/.vuepress/components/fengshen/theme.mjs';"
    "console.log(JSON.stringify(Object.values(CARDS_BY_TYPE).map(c=>c.name)"
    ".concat(HEROES.flatMap(h=>[h.name,h.title,...Object.values(h.skillNames)]))))"
], cwd=root, text=True))
codepoints = set(TTFont(font_dir / "msz.woff2").getBestCmap())
codepoints.update(map(ord, "".join(names)))
font = TTFont(args.source)
missing = codepoints - set(font.getBestCmap())
if missing:
    raise SystemExit("Full source font missing: " + "".join(map(chr, sorted(missing))))
options = subset.Options()
options.flavor = "woff2"
worker = subset.Subsetter(options=options)
worker.populate(unicodes=codepoints)
worker.subset(font)
font.flavor = "woff2"
target = font_dir / ("msz-" + args.version + ".woff2")
font.save(target)
actual = sorted(TTFont(target).getBestCmap())
if codepoints - set(actual):
    raise SystemExit("Generated font has missing glyphs")
manifest = {
    "file": "assets/fonts/" + target.name,
    "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
    "codepoints": actual,
    "source": "https://github.com/google/fonts/tree/main/ofl/mashanzheng",
    "sourceSha256": hashlib.sha256(args.source.read_bytes()).hexdigest(),
    "license": "SIL Open Font License 1.1; assets/fonts/OFL.txt",
}
(font_dir / "coverage.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print(f"Generated {target.name}: {len(actual)} mapped characters, {target.stat().st_size} bytes")
print("Update style.css @font-face URL to", manifest["file"], "then run the UI checks.")
