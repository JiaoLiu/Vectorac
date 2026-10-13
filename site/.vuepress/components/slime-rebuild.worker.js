import { fuseSurface, largestPart } from "./slime-fusion";
import { validSurface } from "./slime-safety";
import { preserveVolume } from "./slime-volume";

// Fold retessellation off the main thread. The studio bakes the folded preview
// immediately and swaps in this result when it arrives, so release never freezes.
self.onmessage = event => {
  const { jobId, positions, indices, colors, volume } = event.data;
  try {
    let rebuilt = fuseSurface(positions, indices, colors);
    rebuilt = largestPart(rebuilt.positions, rebuilt.indices, rebuilt.colors);
    const vertices = Array.from(
      { length: rebuilt.positions.length / 3 },
      (_, i) => i
    );
    const ok =
      rebuilt.kept >= 0.85 &&
      preserveVolume(rebuilt.positions, rebuilt.indices, vertices, volume) &&
      validSurface(rebuilt.positions, rebuilt.indices);
    self.postMessage(
      ok
        ? {
            ok: true,
            jobId,
            positions: rebuilt.positions,
            indices: rebuilt.indices,
            colors: rebuilt.colors
          }
        : { ok: false, jobId }
    );
  } catch (error) {
    self.postMessage({ ok: false, jobId });
  }
};
