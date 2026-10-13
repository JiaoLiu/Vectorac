// Validate the embedded surface, not just volume or its bounding box.
// A spatial hash limits exact triangle tests to nearby, non-adjacent faces.
export function validSurface(p, indices, reference = null) {
  const cell = 0.24,
    buckets = new Map(),
    triangles = [];
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  const point = (data, v) => [data[v * 3], data[v * 3 + 1], data[v * 3 + 2]];
  const pierces = (a, b, t) => {
    const d = sub(b, a),
      e1 = sub(t[1], t[0]),
      e2 = sub(t[2], t[0]),
      h = cross(d, e2),
      det = dot(e1, h);
    if (Math.abs(det) < 1e-10) return false;
    const s = sub(a, t[0]),
      u = dot(s, h) / det;
    if (u < -1e-7 || u > 1 + 1e-7) return false;
    const q = cross(s, e1),
      v = dot(d, q) / det,
      w = dot(e2, q) / det;
    return v >= -1e-7 && u + v <= 1 + 1e-7 && w > 1e-6 && w < 1 - 1e-6;
  };
  for (let f = 0; f < indices.length; f += 3) {
    const ids = indices.slice(f, f + 3),
      t = ids.map(v => point(p, v));
    if (t.some(a => a.some(v => !Number.isFinite(v)))) return false;
    const area = Math.hypot(...cross(sub(t[1], t[0]), sub(t[2], t[0])));
    if (reference) {
      const r = ids.map(v => point(reference, v));
      const oldArea = Math.hypot(...cross(sub(r[1], r[0]), sub(r[2], r[0])));
      if (oldArea > 1e-9 && (area < oldArea * 0.08 || area > oldArea * 8))
        return false;
      for (let k = 0; k < 3; k++) {
        const oldLength = Math.hypot(...sub(r[k], r[(k + 1) % 3]));
        const length = Math.hypot(...sub(t[k], t[(k + 1) % 3]));
        if (
          oldLength > 1e-6 &&
          (length < oldLength * 0.15 || length > oldLength * 4)
        )
          return false;
      }
    }
    const lo = [0, 1, 2].map(c =>
        Math.floor(Math.min(...t.map(a => a[c])) / cell)
      ),
      hi = [0, 1, 2].map(c => Math.floor(Math.max(...t.map(a => a[c])) / cell));
    if (hi.reduce((n, v, c) => n * (v - lo[c] + 1), 1) > 512) return false;
    const checked = new Set();
    for (let x = lo[0]; x <= hi[0]; x++)
      for (let y = lo[1]; y <= hi[1]; y++)
        for (let z = lo[2]; z <= hi[2]; z++) {
          const key = `${x},${y},${z}`,
            neighbors = buckets.get(key) || [];
          for (const index of neighbors) {
            if (index === triangles.length || checked.has(index)) continue;
            checked.add(index);
            const other = triangles[index];
            if (ids.some(v => other.ids.includes(v))) continue;
            if (
              [0, 1, 2].some(
                c =>
                  Math.max(...t.map(a => a[c])) <
                    Math.min(...other.t.map(a => a[c])) - 1e-7 ||
                  Math.max(...other.t.map(a => a[c])) <
                    Math.min(...t.map(a => a[c])) - 1e-7
              )
            )
              continue;
            for (let k = 0; k < 3; k++)
              if (
                pierces(t[k], t[(k + 1) % 3], other.t) ||
                pierces(other.t[k], other.t[(k + 1) % 3], t)
              )
                return false;
          }
          neighbors.push(triangles.length);
          buckets.set(key, neighbors);
        }
    triangles.push({ ids, t });
  }
  return true;
}
