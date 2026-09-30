Full-body source renders for registered extraction. Every source keeps the same 1:2 master canvas and anatomical anchors.

Rebuild: `SHARP_PATH=<sharp module> node scripts/prepare-wardrobe-v5.mjs`.
Prompt set: `scripts/wardrobe-v5-art.json`. The script uses retained source WebPs when the original generated PNG paths are not present.
Source images are original built-in image generation, not downloaded character artwork. Clothes, shoes and socks were rendered worn on the master before extraction.
