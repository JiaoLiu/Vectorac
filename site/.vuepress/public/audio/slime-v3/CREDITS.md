# Slime tactile sounds (v3)

All samples in this folder are **synthesized in-repo** by
`scripts/gen-slime-sounds.mjs` (seeded, deterministic). No third-party
recordings are used, so the sounds are project-owned and license-free.

Design notes — each action owns a distinct timbre, then variations within it:
- press / pinch / flatten / mold: brown noise through an LFO-swept lowpass
  (putty folding over itself) with a low "blub" of trapped air; pinch is
  shorter and brighter, flatten deeper, mold slowest.
- tear / fold: dense micro-crackle beds; fold adds a deeper trapped-air blub.
- drag: low, slow, blub-heavy squish for moving lumps.
- smooth / carve: whooshes; carve adds a scraped gritty band.
- pop: pitch-dropping resonant chirp with a click transient.
- blow: soft crescendo of filtered noise for bubble forming.
- glitter / foil: bright glassy pings vs. lower, longer metallic pings.
- dab / thud: short plips and low thups for interface taps and releases.
- bed_01: seamless 2.1s squish loop (tail crossfaded into head) that sustains
  long holds and swells while rubbing.

Mono 22.05 kHz 16-bit WAV (all voices are lowpassed under 8 kHz), normalized
to -2.8 dBFS peak. ~830 KB for the whole kit.
Re-generate with: `node scripts/gen-slime-sounds.mjs`

v2 (CC0 recordings) is kept alongside for pages cached before this release.
