export function meshParts(model) {
  const seen = new Set(),
    parts = [];
  for (let v = 0; v < model.positions.length / 3; v++) {
    if (seen.has(v)) continue;
    const vertices = [v],
      min = [Infinity, Infinity, Infinity],
      max = [-Infinity, -Infinity, -Infinity];
    seen.add(v);
    for (let j = 0; j < vertices.length; j++) {
      const i = vertices[j];
      for (let c = 0; c < 3; c++) {
        min[c] = Math.min(min[c], model.positions[i * 3 + c]);
        max[c] = Math.max(max[c], model.positions[i * 3 + c]);
      }
      for (const n of model.neighbors[i])
        if (!seen.has(n)) {
          seen.add(n);
          vertices.push(n);
        }
    }
    parts.push({ vertices, min, max });
  }
  return parts;
}

export function partsTouch(parts) {
  for (let i = 0; i < parts.length; i++)
    for (let j = i + 1; j < parts.length; j++)
      if (
        [0, 1, 2].every(
          c =>
            parts[i].min[c] <= parts[j].max[c] + 0.025 &&
            parts[j].min[c] <= parts[i].max[c] + 0.025
        )
      )
        return true;
  return false;
}

// Surface proximity alone misses a small lump completely inside a larger one.
export function partsOverlap(positions, indices, a, b) {
  const inside = (from, into) => {
    const members = new Set(into.vertices);
    const faces = [];
    for (let i = 0; i < indices.length; i += 3)
      if (members.has(indices[i])) faces.push(indices.slice(i, i + 3));
    for (const vertex of from.vertices) {
      const x = positions[vertex * 3] + 1e-7,
        y = positions[vertex * 3 + 1] + 2e-7,
        z = positions[vertex * 3 + 2];
      if (
        x < into.min[0] ||
        x > into.max[0] ||
        y < into.min[1] ||
        y > into.max[1] ||
        z < into.min[2] ||
        z > into.max[2]
      )
        continue;
      const crossings = [];
      for (const [ia, ib, ic] of faces) {
        const a = ia * 3,
          b = ib * 3,
          c = ic * 3;
        const ax = positions[a],
          ay = positions[a + 1],
          bx = positions[b],
          by = positions[b + 1],
          cx = positions[c],
          cy = positions[c + 1];
        const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
        if (Math.abs(det) < 1e-10) continue;
        const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det,
          v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det;
        if (u < 0 || v < 0 || u + v > 1) continue;
        const height =
          u * positions[a + 2] +
          v * positions[b + 2] +
          (1 - u - v) * positions[c + 2];
        if (height > z + 1e-6) crossings.push(height);
      }
      crossings.sort((a, b) => a - b);
      if (
        crossings.filter(
          (v, i) => i === 0 || Math.abs(v - crossings[i - 1]) > 1e-6
        ).length %
          2 ===
        1
      )
        return true;
    }
    return false;
  };
  return inside(a, b) || inside(b, a);
}

export function surfacePartCount(indices, count) {
  const parent = Int32Array.from({ length: count }, (_, i) => i);
  const find = i => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let i = 0; i < indices.length; i += 3) {
    const a = find(indices[i]);
    parent[find(indices[i + 1])] = a;
    parent[find(indices[i + 2])] = a;
  }
  return new Set(indices.map(find)).size;
}

// Coarse voxel fields shed thin flakes near contact seams. The dominant
// component carries the shape, so it is kept whole (still a closed shell) and
// the caller can discard crumbs instead of rolling back the whole gesture.
export function largestPart(positions, indices, colors) {
  const parent = Int32Array.from(
    { length: positions.length / 3 },
    (_, i) => i
  );
  const find = i => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let i = 0; i < indices.length; i += 3) {
    const a = find(indices[i]);
    parent[find(indices[i + 1])] = a;
    parent[find(indices[i + 2])] = a;
  }
  const sizes = new Map();
  for (let i = 0; i < indices.length; i += 3) {
    const root = find(indices[i]);
    sizes.set(root, (sizes.get(root) || 0) + 1);
  }
  let best = 0,
    main = -1;
  sizes.forEach((faces, root) => {
    if (faces > best) {
      best = faces;
      main = root;
    }
  });
  const remap = new Map(),
    keptPositions = [],
    keptColors = [],
    keptIndices = [];
  const vertex = v => {
    if (!remap.has(v)) {
      remap.set(v, keptPositions.length / 3);
      keptPositions.push(
        positions[v * 3],
        positions[v * 3 + 1],
        positions[v * 3 + 2]
      );
      keptColors.push(colors[v * 3], colors[v * 3 + 1], colors[v * 3 + 2]);
    }
    return remap.get(v);
  };
  for (let i = 0; i < indices.length; i += 3)
    if (find(indices[i]) === main)
      keptIndices.push(
        vertex(indices[i]),
        vertex(indices[i + 1]),
        vertex(indices[i + 2])
      );
  return {
    positions: new Float32Array(keptPositions),
    indices: keptIndices,
    colors: new Float32Array(keptColors),
    kept: best / (indices.length / 3)
  };
}

// Rasterize each closed component's vertical intervals into a solid union, then reconstruct a
// welded surface. Overlapping interiors disappear, creating shared topology.
export function fuseSurface(positions, indices, colors) {
  const roots = Int32Array.from({ length: positions.length / 3 }, (_, i) => i);
  const root = i => {
    while (roots[i] !== i) {
      roots[i] = roots[roots[i]];
      i = roots[i];
    }
    return i;
  };
  for (let i = 0; i < indices.length; i += 3) {
    const a = root(indices[i]);
    roots[root(indices[i + 1])] = a;
    roots[root(indices[i + 2])] = a;
  }
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    const c = i % 3;
    min[c] = Math.min(min[c], positions[i]);
    max[c] = Math.max(max[c], positions[i]);
  }
  const step = Math.max(0.085, Math.max(...max.map((x, c) => x - min[c])) / 64);
  const origin = min.map(v => v - step * 2.173);
  const dims = max.map((v, c) => Math.ceil((v - origin[c]) / step) + 3),
    [nx, ny, nz] = dims;
  const columns = Array.from({ length: nx * ny }, () => []),
    plane = nx * ny;
  const id = (x, y, z) => x + nx * y + plane * z;
  for (let f = 0; f < indices.length; f += 3) {
    const a = indices[f] * 3,
      b = indices[f + 1] * 3,
      c = indices[f + 2] * 3;
    const ax = positions[a],
      ay = positions[a + 1],
      bx = positions[b],
      by = positions[b + 1],
      cx = positions[c],
      cy = positions[c + 1];
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-10) continue;
    const x0 = Math.max(
        0,
        Math.ceil((Math.min(ax, bx, cx) - origin[0]) / step)
      ),
      x1 = Math.min(
        nx - 1,
        Math.floor((Math.max(ax, bx, cx) - origin[0]) / step)
      );
    const y0 = Math.max(
        0,
        Math.ceil((Math.min(ay, by, cy) - origin[1]) / step)
      ),
      y1 = Math.min(
        ny - 1,
        Math.floor((Math.max(ay, by, cy) - origin[1]) / step)
      );
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const px = origin[0] + x * step,
          py = origin[1] + y * step;
        const u = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det,
          v = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det,
          w = 1 - u - v;
        if (u < 0 || v < 0 || w < 0) continue;
        const z =
          u * positions[a + 2] + v * positions[b + 2] + w * positions[c + 2];
        columns[x + nx * y].push([z, root(indices[f])]);
      }
  }
  let field = new Float32Array(plane * nz);
  columns.forEach((events, column) => {
    const components = new Map();
    events.forEach(([z, part]) => {
      if (!components.has(part)) components.set(part, []);
      components.get(part).push(z);
    });
    components.forEach(crossings => {
      crossings.sort((a, b) => a - b);
      const unique = crossings.filter(
        (z, i) => i === 0 || Math.abs(z - crossings[i - 1]) > 1e-6
      );
      for (let j = 0; j + 1 < unique.length; j += 2) {
        const lower = (unique[j] - origin[2]) / step,
          upper = (unique[j + 1] - origin[2]) / step,
          lo = Math.max(1, Math.floor(lower - 0.5)),
          hi = Math.min(nz - 2, Math.ceil(upper + 0.5));
        // Fractional boundary occupancy preserves sub-voxel surface height;
        // binary fill creates visible concentric terraces on smooth clay.
        for (let z = lo; z <= hi; z++) {
          const density = Math.max(
            0,
            Math.min(1, 0.5 + Math.min(z - lower, upper - z))
          );
          field[column + plane * z] = Math.max(
            field[column + plane * z],
            density
          );
        }
      }
    });
  });
  for (let pass = 0; pass < 2; pass++) {
    const next = field.slice();
    for (let z = 1; z < nz - 1; z++)
      for (let y = 1; y < ny - 1; y++)
        for (let x = 1; x < nx - 1; x++) {
          const i = id(x, y, z);
          next[i] =
            (field[i] * 4 +
              field[i - 1] +
              field[i + 1] +
              field[i - nx] +
              field[i + nx] +
              field[i - plane] +
              field[i + plane]) /
            10;
        }
    field = next;
  }
  const out = [],
    faces = [],
    cache = new Map(),
    weld = new Map(),
    iso = 0.437123;
  const coord = i => [
    origin[0] + (i % nx) * step,
    origin[1] + (Math.floor(i / nx) % ny) * step,
    origin[2] + Math.floor(i / plane) * step
  ];
  const edge = (a, b) => {
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    if (cache.has(key)) return cache.get(key);
    const t = (iso - field[a]) / (field[b] - field[a]),
      p = coord(a),
      q = coord(b),
      v = p.map((x, c) => x + (q[c] - x) * t),
      wkey = v.map(x => Math.round(x * 1e6)).join(",");
    let index = weld.get(wkey);
    if (index === undefined) {
      index = out.length / 3;
      out.push(...v);
      weld.set(wkey, index);
    }
    cache.set(key, index);
    return index;
  };
  const face = (a, b, c, inside) => {
    if (a === b || b === c || a === c) return;
    const u = [0, 1, 2].map(k => out[b * 3 + k] - out[a * 3 + k]),
      v = [0, 1, 2].map(k => out[c * 3 + k] - out[a * 3 + k]);
    const normal = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0]
    ];
    if (
      normal.reduce((sum, n, k) => sum + n * (inside[k] - out[a * 3 + k]), 0) >
      0
    )
      faces.push(a, c, b);
    else faces.push(a, b, c);
  };
  const tetra = [
    [0, 1, 3, 7],
    [0, 3, 2, 7],
    [0, 2, 6, 7],
    [0, 6, 4, 7],
    [0, 4, 5, 7],
    [0, 5, 1, 7]
  ];
  for (let z = 0; z < nz - 1; z++)
    for (let y = 0; y < ny - 1; y++)
      for (let x = 0; x < nx - 1; x++) {
        const i = id(x, y, z),
          cube = [
            i,
            i + 1,
            i + nx,
            i + nx + 1,
            i + plane,
            i + plane + 1,
            i + plane + nx,
            i + plane + nx + 1
          ];
        if (cube.every(v => field[v] < iso) || cube.every(v => field[v] >= iso))
          continue;
        for (const t of tetra) {
          const inside = t.map(k => cube[k]).filter(v => field[v] >= iso),
            outside = t.map(k => cube[k]).filter(v => field[v] < iso);
          if (!inside.length || !outside.length) continue;
          const center = [0, 0, 0];
          inside.forEach(v =>
            coord(v).forEach((x, c) => {
              center[c] += x / inside.length;
            })
          );
          if (inside.length === 1) {
            const q = outside.map(v => edge(inside[0], v));
            face(...q, center);
          } else if (inside.length === 3) {
            const q = inside.map(v => edge(v, outside[0]));
            face(...q, center);
          } else {
            const [a, b] = inside,
              [c, d] = outside,
              q = [edge(a, c), edge(a, d), edge(b, d), edge(b, c)];
            face(q[0], q[1], q[2], center);
            face(q[0], q[2], q[3], center);
          }
        }
      }
  if (!faces.length) throw new Error("融合表面为空");
  const buckets = new Map(),
    cell = step * 2,
    key = (x, y, z) => `${x},${y},${z}`;
  for (let i = 0; i < positions.length; i += 3) {
    const k = key(...[0, 1, 2].map(c => Math.floor(positions[i + c] / cell)));
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(i / 3);
  }
  const newColors = new Float32Array(out.length);
  for (let i = 0; i < out.length; i += 3) {
    const bin = [0, 1, 2].map(c => Math.floor(out[i + c] / cell));
    let candidates = [];
    for (let r = 1; r <= 3 && !candidates.length; r++)
      for (let z = -r; z <= r; z++)
        for (let y = -r; y <= r; y++)
          for (let x = -r; x <= r; x++)
            candidates.push(
              ...(buckets.get(key(bin[0] + x, bin[1] + y, bin[2] + z)) || [])
            );
    candidates.sort((a, b) =>
      [0, 1, 2].reduce(
        (s, c) =>
          s +
          (positions[a * 3 + c] - out[i + c]) ** 2 -
          (positions[b * 3 + c] - out[i + c]) ** 2,
        0
      )
    );
    let total = 0;
    candidates.slice(0, 3).forEach(v => {
      const weight =
        1 /
        (0.001 +
          [0, 1, 2].reduce(
            (s, c) => s + (positions[v * 3 + c] - out[i + c]) ** 2,
            0
          ));
      total += weight;
      for (let c = 0; c < 3; c++)
        newColors[i + c] += colors[v * 3 + c] * weight;
    });
    for (let c = 0; c < 3; c++)
      newColors[i + c] = total ? newColors[i + c] / total : colors[c];
  }
  return {
    positions: new Float32Array(out),
    indices: faces,
    colors: newColors
  };
}
