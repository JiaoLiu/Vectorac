# Slime sound kit v5 — qubodup for tools, existing pops preserved

All tool, interface, release and held-loop samples are cropped from **Slime**
by **qubodup**: https://freesound.org/people/qubodup/sounds/127449/

Only `pop_01`, `pop_02`, `pop_03` retain the previously accepted bubble-pop
recording, byte-for-byte identical to v4, from **rubberduck9999**:
https://freesound.org/people/rubberduck9999/sounds/680446/

Both source pages designate their sounds CC0 1.0:
https://creativecommons.org/publicdomain/zero/1.0/
The public MP3 previews are used, not the login-only FLAC originals.
See `manifest.json` for source URLs, SHA-256 checksums and exact excerpt times.

Processing: mono 22.05 kHz PCM16, 85 Hz high-pass / 6.2 kHz low-pass,
fixed gain normalization, gentle edge fades and a 160 ms loop crossfade.
The quiet qubodup clips target RMS 0.14 (tools), 0.11 (soft taps), or 0.085
(held loop), capped at peak 0.8 for headroom. Natural dynamics are retained;
peak-limited clips can have a lower RMS. No synthesis or added animal sounds.
Tools and the held loop play at original pitch; pops keep their existing behavior.

Rebuild with ffmpeg installed:
`node scripts/prepare-slime-recordings.mjs /path/to/sources`
Input folder: `slime.mp3` and `bubbles.mp3`, downloaded from manifest URLs.
The script verifies source hashes. Earlier kits remain for cached old pages.
