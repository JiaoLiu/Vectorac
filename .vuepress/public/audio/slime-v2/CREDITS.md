# Slime tactile sounds

All samples in this folder are **synthesized in-repo** by
`scripts/gen-slime-sounds.mjs` (seeded, deterministic). No third-party
recordings are used, so the sounds are project-owned and license-free.

Design notes:
- press / knead / stretch / mold: brown noise through an LFO-swept lowpass
  (putty folding over itself), a low "blub" of trapped air, sparse
  micro-crackles — the core slime voice.
- pop: pitch-dropping resonant chirp with a click transient.
- blow: soft crescendo of filtered noise for bubble forming.
- dab / thud / swipe / shimmer: short plips, low thups, whooshes and bright
  pings for interface actions and sprinkles.

Mono 44.1 kHz 16-bit WAV, normalized to -2.8 dBFS peak.
Re-generate with: `node scripts/gen-slime-sounds.mjs`
