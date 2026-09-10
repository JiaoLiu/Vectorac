// Duplicate seam vertices and cap both exposed boundaries. The resulting pieces
// share no vertices or springs, so separating them is a topology change.
export function tearSurface(positions, indices, point, direction) {
  const maps = [new Map(), new Map()],
    vertices = [],
    sourceMap = [],
    sides = [],
    triangles = [[], []];
  const copy = (old, side) => {
    if (!maps[side].has(old)) {
      maps[side].set(old, vertices.length / 3);
      vertices.push(...positions.slice(old * 3, old * 3 + 3));
      sourceMap.push(old);
      sides.push(side ? 1 : -1);
    }
    return maps[side].get(old);
  };
  for (let i = 0; i < indices.length; i += 3) {
    const face = indices.slice(i, i + 3);
    let distance = 0;
    face.forEach(v => {
      distance +=
        (positions[v * 3] - point.x) * direction.x +
        (positions[v * 3 + 1] - point.y) * direction.y;
    });
    const side = distance >= 0 ? 1 : 0;
    triangles[side].push(...face.map(v => copy(v, side)));
  }
  if (triangles.some(t => t.length < 30)) return null;
  triangles.forEach((faces, side) => {
    const edges = new Map();
    for (let i = 0; i < faces.length; i += 3) {
      for (let j = 0; j < 3; j++) {
        const a = faces[i + j],
          b = faces[i + ((j + 1) % 3)],
          key = a < b ? `${a},${b}` : `${b},${a}`;
        if (edges.has(key)) edges.delete(key);
        else edges.set(key, [a, b]);
      }
    }
    const next = new Map([...edges.values()]);
    while (next.size) {
      const first = next.keys().next().value,
        loop = [];
      let current = first;
      while (next.has(current)) {
        loop.push(current);
        const value = next.get(current);
        next.delete(current);
        current = value;
        if (current === first) break;
      }
      if (loop.length < 3 || current !== first)
        throw new Error("撕裂边界无法闭合，请换一个位置。");
      const center = [0, 0, 0];
      loop.forEach(v => {
        for (let c = 0; c < 3; c++)
          center[c] += vertices[v * 3 + c] / loop.length;
      });
      const index = vertices.length / 3;
      vertices.push(...center);
      sourceMap.push(sourceMap[loop[0]]);
      sides.push(side ? 1 : -1);
      for (let i = 0; i < loop.length; i++)
        faces.push(loop[(i + 1) % loop.length], loop[i], index);
    }
  });
  maps[0].forEach((left, old) => {
    if (!maps[1].has(old)) return;
    const roughness = Math.sin(old * 12.9898) * 0.018;
    [left, maps[1].get(old)].forEach(v => {
      vertices[v * 3] += direction.x * roughness;
      vertices[v * 3 + 1] += direction.y * roughness;
    });
  });
  return {
    positions: new Float32Array(vertices),
    indices: triangles.flat(),
    sourceMap,
    sides
  };
}

// Bend a connected half over a hinge at the upper surface. The finite hinge
// band distributes rotation rather than collapsing a row of triangles.
export function foldSurface(source, selected, center, direction, angle) {
  const result = source.slice();
  let hingeHeight = -Infinity;
  selected.forEach(v => {
    hingeHeight = Math.max(hingeHeight, source[v * 3 + 2]);
  });
  const hingeX = center.x,
    hingeY = center.y;
  selected.forEach(v => {
    const i = v * 3,
      x = source[i] - hingeX,
      y = source[i + 1] - hingeY;
    const along = x * direction.x + y * direction.y;
    if (along <= 0) return;
    const tangent = -x * direction.y + y * direction.x;
    const t = Math.min(1, along / 0.25),
      a = angle * t * t * (3 - 2 * t);
    const height = source[i + 2] - hingeHeight;
    const bent = along * Math.cos(a) - height * Math.sin(a);
    result[i] = hingeX + bent * direction.x - tangent * direction.y;
    result[i + 1] = hingeY + bent * direction.y + tangent * direction.x;
    result[i + 2] = Math.max(
      -0.25,
      hingeHeight + along * Math.sin(a) + height * Math.cos(a)
    );
  });
  return result;
}

export function connectedVertices(neighbors, vertex) {
  const selected = new Set([vertex]),
    queue = [vertex];
  for (let i = 0; i < queue.length; i++)
    for (const j of neighbors[queue[i]])
      if (!selected.has(j)) {
        selected.add(j);
        queue.push(j);
      }
  return [...selected];
}
