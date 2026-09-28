# Slime sound kit v4 — edited CC0 recordings

These sounds are excerpts of **real recordings**, not AI or procedural synthesis.

- **Slime**, qubodup: https://freesound.org/people/qubodup/sounds/127449/
- **slime - bubble blowing recordings**, rubberduck9999:
  https://freesound.org/people/rubberduck9999/sounds/680446/

Both source pages label the audio **CC0 1.0**:
https://creativecommons.org/publicdomain/zero/1.0/
License checked 2026-09-28. Attribution retained for provenance, although not required by CC0.

The publicly available MP3 previews were used, not the login-only FLAC originals.
Exact source URLs, SHA-256 checksums and excerpt times are in `manifest.json`.

Processing: mono 22.05 kHz PCM16 WAV, 85 Hz high-pass / 6.2 kHz low-pass,
fixed gain normalization with peak headroom, gentle edge fades. The held sound
uses a 160 ms overlap crossfade. No generated oscillators, noise, or metallic pings.
Gameplay still controls voice gain, filters and small playback-rate variations.

To rebuild, save the two manifest download URLs as `slime.mp3` and `bubbles.mp3`
in a local folder, then run:

`node scripts/prepare-slime-recordings.mjs /path/to/sources`

Requires ffmpeg. Inputs are checksum-verified; the script does not delete old kits.
v3 remains available for previously cached pages; the current game uses v4.
