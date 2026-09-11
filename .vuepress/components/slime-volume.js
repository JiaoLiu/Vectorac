// Signed tetrahedra give the enclosed volume of a consistently oriented shell.
export function meshVolume(positions, indices) {
  if (!indices.length) return 0;
  const origin = indices[0] * 3;
  let sum = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3,
      b = indices[i + 1] * 3,
      c = indices[i + 2] * 3;
    const ax = positions[a] - positions[origin],
      ay = positions[a + 1] - positions[origin + 1],
      az = positions[a + 2] - positions[origin + 2];
    const bx = positions[b] - positions[origin],
      by = positions[b + 1] - positions[origin + 1],
      bz = positions[b + 2] - positions[origin + 2];
    const cx = positions[c] - positions[origin],
      cy = positions[c + 1] - positions[origin + 1],
      cz = positions[c + 2] - positions[origin + 2];
    sum +=
      ax * (by * cz - bz * cy) +
      ay * (bz * cx - bx * cz) +
      az * (bx * cy - by * cx);
  }
  return Math.abs(sum / 6);
}

export function preserveVolume(positions, indices, vertices, target) {
  const volume = meshVolume(positions, indices);
  if (!Number.isFinite(volume) || volume < 1e-7 || target < 1e-7) return false;
  const factor = Math.sqrt(target / volume);
  // A folded/self-intersecting shell can have nearly zero signed volume.
  // Never turn that cancellation into an unbounded world-space scale.
  if (factor > 2 || factor < 0.5) return false;
  if (Math.abs(factor - 1) < 1e-6) return true;
  let x = 0,
    y = 0;
  vertices.forEach(v => {
    x += positions[v * 3] / vertices.length;
    y += positions[v * 3 + 1] / vertices.length;
  });
  if (
    vertices.some(
      v =>
        !Number.isFinite(positions[v * 3 + 2]) ||
        Math.abs((positions[v * 3] - x) * factor) > 3.5 ||
        Math.abs((positions[v * 3 + 1] - y) * factor) > 3.5
    )
  )
    return false;
  vertices.forEach(v => {
    positions[v * 3] = x + (positions[v * 3] - x) * factor;
    positions[v * 3 + 1] = y + (positions[v * 3 + 1] - y) * factor;
  });
  return true;
}
