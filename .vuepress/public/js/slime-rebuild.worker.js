(() => {
  // .vuepress/components/slime-fusion.js
  function largestPart(positions, indices, colors) {
    const parent = Int32Array.from(
      { length: positions.length / 3 },
      (_, i) => i
    );
    const find = (i) => {
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
    const sizes = /* @__PURE__ */ new Map();
    for (let i = 0; i < indices.length; i += 3) {
      const root = find(indices[i]);
      sizes.set(root, (sizes.get(root) || 0) + 1);
    }
    let best = 0, main = -1;
    sizes.forEach((faces, root) => {
      if (faces > best) {
        best = faces;
        main = root;
      }
    });
    const remap = /* @__PURE__ */ new Map(), keptPositions = [], keptColors = [], keptIndices = [];
    const vertex = (v) => {
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
  function fuseSurface(positions, indices, colors) {
    const roots = Int32Array.from({ length: positions.length / 3 }, (_, i) => i);
    const root = (i) => {
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
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i++) {
      const c = i % 3;
      min[c] = Math.min(min[c], positions[i]);
      max[c] = Math.max(max[c], positions[i]);
    }
    const step = Math.max(0.085, Math.max(...max.map((x, c) => x - min[c])) / 64);
    const origin = min.map((v) => v - step * 2.173);
    const dims = max.map((v, c) => Math.ceil((v - origin[c]) / step) + 3), [nx, ny, nz] = dims;
    const columns = Array.from({ length: nx * ny }, () => []), plane = nx * ny;
    const id = (x, y, z) => x + nx * y + plane * z;
    for (let f = 0; f < indices.length; f += 3) {
      const a = indices[f] * 3, b = indices[f + 1] * 3, c = indices[f + 2] * 3;
      const ax = positions[a], ay = positions[a + 1], bx = positions[b], by = positions[b + 1], cx = positions[c], cy = positions[c + 1];
      const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(det) < 1e-10) continue;
      const x0 = Math.max(
        0,
        Math.ceil((Math.min(ax, bx, cx) - origin[0]) / step)
      ), x1 = Math.min(
        nx - 1,
        Math.floor((Math.max(ax, bx, cx) - origin[0]) / step)
      );
      const y0 = Math.max(
        0,
        Math.ceil((Math.min(ay, by, cy) - origin[1]) / step)
      ), y1 = Math.min(
        ny - 1,
        Math.floor((Math.max(ay, by, cy) - origin[1]) / step)
      );
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const px = origin[0] + x * step, py = origin[1] + y * step;
          const u = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det, v = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det, w = 1 - u - v;
          if (u < 0 || v < 0 || w < 0) continue;
          const z = u * positions[a + 2] + v * positions[b + 2] + w * positions[c + 2];
          columns[x + nx * y].push([z, root(indices[f])]);
        }
    }
    let field = new Float32Array(plane * nz);
    columns.forEach((events, column) => {
      const components = /* @__PURE__ */ new Map();
      events.forEach(([z, part]) => {
        if (!components.has(part)) components.set(part, []);
        components.get(part).push(z);
      });
      components.forEach((crossings) => {
        crossings.sort((a, b) => a - b);
        const unique = crossings.filter(
          (z, i) => i === 0 || Math.abs(z - crossings[i - 1]) > 1e-6
        );
        for (let j = 0; j + 1 < unique.length; j += 2) {
          const lower = (unique[j] - origin[2]) / step, upper = (unique[j + 1] - origin[2]) / step, lo = Math.max(1, Math.floor(lower - 0.5)), hi = Math.min(nz - 2, Math.ceil(upper + 0.5));
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
            next[i] = (field[i] * 4 + field[i - 1] + field[i + 1] + field[i - nx] + field[i + nx] + field[i - plane] + field[i + plane]) / 10;
          }
      field = next;
    }
    const out = [], faces = [], cache = /* @__PURE__ */ new Map(), weld = /* @__PURE__ */ new Map(), iso = 0.437123;
    const coord = (i) => [
      origin[0] + i % nx * step,
      origin[1] + Math.floor(i / nx) % ny * step,
      origin[2] + Math.floor(i / plane) * step
    ];
    const edge = (a, b) => {
      const key2 = a < b ? `${a},${b}` : `${b},${a}`;
      if (cache.has(key2)) return cache.get(key2);
      const t = (iso - field[a]) / (field[b] - field[a]), p = coord(a), q = coord(b), v = p.map((x, c) => x + (q[c] - x) * t), wkey = v.map((x) => Math.round(x * 1e6)).join(",");
      let index = weld.get(wkey);
      if (index === void 0) {
        index = out.length / 3;
        out.push(...v);
        weld.set(wkey, index);
      }
      cache.set(key2, index);
      return index;
    };
    const face = (a, b, c, inside) => {
      if (a === b || b === c || a === c) return;
      const u = [0, 1, 2].map((k) => out[b * 3 + k] - out[a * 3 + k]), v = [0, 1, 2].map((k) => out[c * 3 + k] - out[a * 3 + k]);
      const normal = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0]
      ];
      if (normal.reduce((sum, n, k) => sum + n * (inside[k] - out[a * 3 + k]), 0) > 0)
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
          const i = id(x, y, z), cube = [
            i,
            i + 1,
            i + nx,
            i + nx + 1,
            i + plane,
            i + plane + 1,
            i + plane + nx,
            i + plane + nx + 1
          ];
          if (cube.every((v) => field[v] < iso) || cube.every((v) => field[v] >= iso))
            continue;
          for (const t of tetra) {
            const inside = t.map((k) => cube[k]).filter((v) => field[v] >= iso), outside = t.map((k) => cube[k]).filter((v) => field[v] < iso);
            if (!inside.length || !outside.length) continue;
            const center = [0, 0, 0];
            inside.forEach(
              (v) => coord(v).forEach((x2, c) => {
                center[c] += x2 / inside.length;
              })
            );
            if (inside.length === 1) {
              const q = outside.map((v) => edge(inside[0], v));
              face(...q, center);
            } else if (inside.length === 3) {
              const q = inside.map((v) => edge(v, outside[0]));
              face(...q, center);
            } else {
              const [a, b] = inside, [c, d] = outside, q = [edge(a, c), edge(a, d), edge(b, d), edge(b, c)];
              face(q[0], q[1], q[2], center);
              face(q[0], q[2], q[3], center);
            }
          }
        }
    if (!faces.length) throw new Error("\u878D\u5408\u8868\u9762\u4E3A\u7A7A");
    const buckets = /* @__PURE__ */ new Map(), cell = step * 2, key = (x, y, z) => `${x},${y},${z}`;
    for (let i = 0; i < positions.length; i += 3) {
      const k = key(...[0, 1, 2].map((c) => Math.floor(positions[i + c] / cell)));
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(i / 3);
    }
    const newColors = new Float32Array(out.length);
    for (let i = 0; i < out.length; i += 3) {
      const bin = [0, 1, 2].map((c) => Math.floor(out[i + c] / cell));
      let candidates = [];
      for (let r = 1; r <= 3 && !candidates.length; r++)
        for (let z = -r; z <= r; z++)
          for (let y = -r; y <= r; y++)
            for (let x = -r; x <= r; x++)
              candidates.push(
                ...buckets.get(key(bin[0] + x, bin[1] + y, bin[2] + z)) || []
              );
      candidates.sort(
        (a, b) => [0, 1, 2].reduce(
          (s, c) => s + (positions[a * 3 + c] - out[i + c]) ** 2 - (positions[b * 3 + c] - out[i + c]) ** 2,
          0
        )
      );
      let total = 0;
      candidates.slice(0, 3).forEach((v) => {
        const weight = 1 / (1e-3 + [0, 1, 2].reduce(
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

  // .vuepress/components/slime-safety.js
  function validSurface(p, indices, reference = null) {
    const cell = 0.24, buckets = /* @__PURE__ */ new Map(), triangles = [];
    const cross = (a, b) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
    const sub = (a, b) => a.map((v, i) => v - b[i]);
    const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
    const point = (data, v) => [data[v * 3], data[v * 3 + 1], data[v * 3 + 2]];
    const pierces = (a, b, t) => {
      const d = sub(b, a), e1 = sub(t[1], t[0]), e2 = sub(t[2], t[0]), h = cross(d, e2), det = dot(e1, h);
      if (Math.abs(det) < 1e-10) return false;
      const s = sub(a, t[0]), u = dot(s, h) / det;
      if (u < -1e-7 || u > 1 + 1e-7) return false;
      const q = cross(s, e1), v = dot(d, q) / det, w = dot(e2, q) / det;
      return v >= -1e-7 && u + v <= 1 + 1e-7 && w > 1e-6 && w < 1 - 1e-6;
    };
    for (let f = 0; f < indices.length; f += 3) {
      const ids = indices.slice(f, f + 3), t = ids.map((v) => point(p, v));
      if (t.some((a) => a.some((v) => !Number.isFinite(v)))) return false;
      const area = Math.hypot(...cross(sub(t[1], t[0]), sub(t[2], t[0])));
      if (reference) {
        const r = ids.map((v) => point(reference, v));
        const oldArea = Math.hypot(...cross(sub(r[1], r[0]), sub(r[2], r[0])));
        if (oldArea > 1e-9 && (area < oldArea * 0.08 || area > oldArea * 8))
          return false;
        for (let k = 0; k < 3; k++) {
          const oldLength = Math.hypot(...sub(r[k], r[(k + 1) % 3]));
          const length = Math.hypot(...sub(t[k], t[(k + 1) % 3]));
          if (oldLength > 1e-6 && (length < oldLength * 0.15 || length > oldLength * 4))
            return false;
        }
      }
      const lo = [0, 1, 2].map(
        (c) => Math.floor(Math.min(...t.map((a) => a[c])) / cell)
      ), hi = [0, 1, 2].map((c) => Math.floor(Math.max(...t.map((a) => a[c])) / cell));
      if (hi.reduce((n, v, c) => n * (v - lo[c] + 1), 1) > 512) return false;
      const checked = /* @__PURE__ */ new Set();
      for (let x = lo[0]; x <= hi[0]; x++)
        for (let y = lo[1]; y <= hi[1]; y++)
          for (let z = lo[2]; z <= hi[2]; z++) {
            const key = `${x},${y},${z}`, neighbors = buckets.get(key) || [];
            for (const index of neighbors) {
              if (index === triangles.length || checked.has(index)) continue;
              checked.add(index);
              const other = triangles[index];
              if (ids.some((v) => other.ids.includes(v))) continue;
              if ([0, 1, 2].some(
                (c) => Math.max(...t.map((a) => a[c])) < Math.min(...other.t.map((a) => a[c])) - 1e-7 || Math.max(...other.t.map((a) => a[c])) < Math.min(...t.map((a) => a[c])) - 1e-7
              ))
                continue;
              for (let k = 0; k < 3; k++)
                if (pierces(t[k], t[(k + 1) % 3], other.t) || pierces(other.t[k], other.t[(k + 1) % 3], t))
                  return false;
            }
            neighbors.push(triangles.length);
            buckets.set(key, neighbors);
          }
      triangles.push({ ids, t });
    }
    return true;
  }

  // .vuepress/components/slime-volume.js
  function meshVolume(positions, indices) {
    if (!indices.length) return 0;
    const origin = indices[0] * 3;
    let sum = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
      const ax = positions[a] - positions[origin], ay = positions[a + 1] - positions[origin + 1], az = positions[a + 2] - positions[origin + 2];
      const bx = positions[b] - positions[origin], by = positions[b + 1] - positions[origin + 1], bz = positions[b + 2] - positions[origin + 2];
      const cx = positions[c] - positions[origin], cy = positions[c + 1] - positions[origin + 1], cz = positions[c + 2] - positions[origin + 2];
      sum += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
    }
    return Math.abs(sum / 6);
  }
  function preserveVolume(positions, indices, vertices, target) {
    const volume = meshVolume(positions, indices);
    if (!Number.isFinite(volume) || volume < 1e-7 || target < 1e-7) return false;
    const factor = Math.sqrt(target / volume);
    if (factor > 2 || factor < 0.5) return false;
    if (Math.abs(factor - 1) < 1e-6) return true;
    let x = 0, y = 0;
    vertices.forEach((v) => {
      x += positions[v * 3] / vertices.length;
      y += positions[v * 3 + 1] / vertices.length;
    });
    if (vertices.some(
      (v) => !Number.isFinite(positions[v * 3 + 2]) || Math.abs((positions[v * 3] - x) * factor) > 3.5 || Math.abs((positions[v * 3 + 1] - y) * factor) > 3.5
    ))
      return false;
    vertices.forEach((v) => {
      positions[v * 3] = x + (positions[v * 3] - x) * factor;
      positions[v * 3 + 1] = y + (positions[v * 3 + 1] - y) * factor;
    });
    return true;
  }

  // .vuepress/components/slime-rebuild.worker.js
  self.onmessage = (event) => {
    const { jobId, positions, indices, colors, volume } = event.data;
    try {
      let rebuilt = fuseSurface(positions, indices, colors);
      rebuilt = largestPart(rebuilt.positions, rebuilt.indices, rebuilt.colors);
      const vertices = Array.from(
        { length: rebuilt.positions.length / 3 },
        (_, i) => i
      );
      const ok = rebuilt.kept >= 0.85 && preserveVolume(rebuilt.positions, rebuilt.indices, vertices, volume) && validSurface(rebuilt.positions, rebuilt.indices);
      self.postMessage(
        ok ? {
          ok: true,
          jobId,
          positions: rebuilt.positions,
          indices: rebuilt.indices,
          colors: rebuilt.colors
        } : { ok: false, jobId }
      );
    } catch (error) {
      self.postMessage({ ok: false, jobId });
    }
  };
})();
