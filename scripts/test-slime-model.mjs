import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

let source = await readFile(
  new URL("../.vuepress/components/slime-model.js", import.meta.url),
  "utf8"
);
const volumeSource = await readFile(
  new URL("../.vuepress/components/slime-volume.js", import.meta.url),
  "utf8"
);
const volumeURL = `data:text/javascript;base64,${Buffer.from(
  volumeSource
).toString("base64")}`;
const { meshVolume, preserveVolume } = await import(volumeURL);
source = source.replace(/(['"])\.\/slime-volume\1/, JSON.stringify(volumeURL));
const { default: SlimeModel } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
const sculptSource = await readFile(
  new URL("../.vuepress/components/slime-sculpt.js", import.meta.url),
  "utf8"
);
const {
  tearSurface,
  foldSurface,
  connectedVertices,
  bubbleRadius
} = await import(
  `data:text/javascript;base64,${Buffer.from(sculptSource).toString("base64")}`
);
const brush = {
  point: { x: 0, y: 0, z: 0.43 },
  normal: { x: 0, y: 0, z: 1 },
  radius: 0.24,
  strength: 0.65,
  tool: "pump"
};
const advance = (model, seconds, contact = null) => {
  for (let i = 0; i < Math.round(seconds * 120); i++)
    model.step(1 / 120, contact);
  assert.ok(
    [...model.positions, ...model.velocity, ...model.rest].every(
      Number.isFinite
    )
  );
};

// All molds must stay closed: every shared edge belongs to exactly two triangles.
for (const mold of ["round", "star", "heart", "melody"]) {
  const model = new SlimeModel(mold);
  const edges = new Map();
  for (let i = 0; i < model.indices.length; i += 3) {
    const triangle = model.indices.slice(i, i + 3);
    for (let j = 0; j < 3; j++) {
      const key = [triangle[j], triangle[(j + 1) % 3]]
        .sort((a, b) => a - b)
        .join(",");
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  assert.ok(
    [...edges.values()].every(count => count === 2),
    `${mold} has an open edge`
  );
  assert.ok([...model.base].every(Number.isFinite));
}

const results = {};
for (const material of ["butter", "crystal", "memory", "clay"]) {
  const model = new SlimeModel();
  model.material = material;
  advance(model, 2, brush);
  const pressed = model.positions[2];
  assert.ok(pressed < 0.33, `${material} did not indent`);
  advance(model, 5);
  results[material] = { pressed, recovered: model.positions[2] };
}
assert.ok(results.crystal.recovered > results.butter.recovered);
assert.ok(results.butter.recovered > results.memory.recovered);
assert.ok(
  results.clay.recovered < 0.3,
  "Clay should retain a substantial impression"
);

const liquid = new SlimeModel("star");
liquid.material = "liquid";
advance(liquid, 8);
assert.ok(liquid.spread > 1.3);
assert.ok(liquid.positions[2] < 0.32, "Flowing slime should become thinner");
const pinch = new SlimeModel();
advance(pinch, 1, { ...brush, tool: "pinch" });
assert.ok(pinch.positions[2] > 0.48, "Pinching should raise the surface");
pinch.reset("heart");
assert.deepEqual(pinch.positions, pinch.base);
assert.ok(pinch.velocity.every(v => v === 0));
for (const mold of ["round", "star", "heart", "melody"]) {
  const model = new SlimeModel(mold);
  const torn = tearSurface(
    model.positions,
    model.indices,
    { x: 0.1, y: 0 },
    { x: 1, y: 0 }
  );
  assert.ok(torn, `${mold} should tear`);
  model.positions = torn.positions;
  model.indices = torn.indices;
  model.bake();
  model.reconnect();
  const component = connectedVertices(model.neighbors, 0);
  assert.ok(
    component.length < model.positions.length / 3,
    "Pieces must no longer share springs"
  );
  const edges = new Map();
  for (let i = 0; i < model.indices.length; i += 3)
    for (let j = 0; j < 3; j++) {
      const key = [model.indices[i + j], model.indices[i + ((j + 1) % 3)]]
        .sort((a, b) => a - b)
        .join(",");
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  assert.ok(
    [...edges.values()].every(n => n === 2),
    "Torn pieces must have closed tear faces"
  );
  model.reset("round");
  assert.equal(model.positions.length, model.templateCount * 3);
  assert.equal(
    connectedVertices(model.neighbors, 0).length,
    model.templateCount
  );
}
const folding = new SlimeModel();
const original = folding.positions.slice();
const folded = foldSurface(
  original,
  connectedVertices(folding.neighbors, 0),
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  2.8
);
assert.ok(
  folded.some((v, i) => i % 3 === 2 && v > 0.8),
  "Fold must produce an overlapping raised layer"
);
assert.ok([...folded].every(Number.isFinite));
folding.positions.set(folded);
preserveVolume(
  folding.positions,
  folding.indices,
  folding.massBodies[0].vertices,
  folding.massBodies[0].volume
);
folded.set(folding.positions);
folding.bake();
advance(folding, 3);
assert.ok(
  Math.max(...folding.positions.map((v, i) => Math.abs(v - folded[i]))) < 0.001,
  "Committed fold should not spring back"
);
const engraving = new SlimeModel();
engraving.carve({ x: 0, y: 0, z: 0.43 }, { x: 0, y: 0, z: 1 }, 0.13);
assert.ok(
  engraving.positions[2] < 0.37,
  "Carve must immediately create a visible groove"
);
console.log(
  "PASS: torn topology and sealed faces, mold reset, committed fold, direct engraving"
);
console.log(
  "PASS: closed molds, indentation, distinct recovery, plasticity, flow, pinch and reset",
  results
);

// Repeated folding must not compound height, and release must settle the body.
const repeated = new SlimeModel(),
  selected = connectedVertices(repeated.neighbors, 0);
for (let n = 0; n < 12; n++) {
  const previous = repeated.positions.slice();
  repeated.positions.set(
    foldSurface(
      repeated.positions,
      selected,
      { x: 0, y: 0 },
      { x: n % 2 ? -1 : 1, y: 0 },
      2.8
    )
  );
  assert.ok(
    Math.max(...selected.map(v => repeated.positions[v * 3 + 2])) < 0.93
  );
  const valid = preserveVolume(
    repeated.positions,
    repeated.indices,
    selected,
    repeated.massBodies[0].volume
  );
  if (!valid) repeated.positions.set(previous);
  repeated.bake();
  repeated.startSettling(selected);
  advance(repeated, 4);
  assert.ok(
    Math.abs(
      meshVolume(repeated.positions, repeated.indices) /
        repeated.massBodies[0].volume -
        1
    ) < 0.001,
    "Repeated folds conserve volume"
  );
}
assert.ok(bubbleRadius(4, "foam", 1) > bubbleRadius(0.1, "foam", 1) * 4);
assert.notEqual(bubbleRadius(1, "butter", 0.8), bubbleRadius(1, "butter", 1.2));
const heights = {};
for (const material of ["clay", "memory", "butter", "liquid"]) {
  const m = new SlimeModel();
  m.material = material;
  const body = m.massBodies[0];
  m.positions.set(
    foldSurface(m.positions, body.vertices, { x: 0, y: 0 }, { x: 1, y: 0 }, 2.8)
  );
  preserveVolume(m.positions, m.indices, body.vertices, body.volume);
  m.bake();
  const before = m.positions.slice();
  m.startSettling(body.vertices);
  advance(m, 2);
  heights[material] = Math.max(
    ...body.vertices.map(v => m.positions[v * 3 + 2])
  );
  assert.ok(
    Math.abs(meshVolume(m.positions, m.indices) / body.volume - 1) < 0.001
  );
  if (material === "clay")
    assert.ok(
      m.positions.every((v, i) => Math.abs(v - before[i]) < 0.001),
      "Hard clay retains folded shape"
    );
}
assert.ok(
  heights.clay > heights.memory &&
    heights.memory > heights.butter &&
    heights.butter > heights.liquid,
  "Material-specific settling order"
);
console.log(
  "PASS: hard clay holds shape, memory slower than butter, liquid fastest",
  heights
);
const fusionSource = await readFile(
  new URL("../.vuepress/components/slime-fusion.js", import.meta.url),
  "utf8"
);
const { fuseSurface, surfacePartCount, largestPart } = await import(
  `data:text/javascript;base64,${Buffer.from(fusionSource).toString("base64")}`
);
for (const distance of [1, 2.6]) {
  const a = new SlimeModel(),
    b = new SlimeModel();
  const positions = new Float32Array([
    ...a.positions,
    ...b.positions.map((v, i) => v + (i % 3 === 0 ? distance : 0))
  ]);
  const colors = new Float32Array(positions.length);
  for (let i = 0; i < colors.length; i += 3)
    colors[i + (i < a.positions.length ? 0 : 2)] = 1;
  const result = fuseSurface(
    positions,
    a.indices.concat(b.indices.map(v => v + a.positions.length / 3)),
    colors
  );
  assert.equal(
    surfacePartCount(result.indices, result.positions.length / 3),
    distance === 1 ? 1 : 2
  );
  assert.ok(
    result.colors.some((v, i) => i % 3 === 0 && v > 0.9) &&
      result.colors.some((v, i) => i % 3 === 2 && v > 0.9)
  );
  const edges = new Map();
  for (let i = 0; i < result.indices.length; i += 3)
    for (let j = 0; j < 3; j++) {
      const key = [result.indices[i + j], result.indices[i + ((j + 1) % 3)]]
        .sort((a, b) => a - b)
        .join(",");
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  assert.ok(
    [...edges.values()].every(n => n === 2),
    "Fused surface must be closed"
  );
  assert.ok([...result.positions, ...result.colors].every(Number.isFinite));
}
console.log(
  "PASS: repeated fold settling, bubble size range, touching-only fusion, closed seams and preserved colors"
);

// Exercise the real append implementation without allocating a WebGL renderer.
const moduleURL = text =>
  `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
const threeURL = import.meta.resolve("three");
const THREE = await import(threeURL);
const sprinklesSource = await readFile(
  new URL("../.vuepress/components/SlimeSprinkles.js", import.meta.url),
  "utf8"
);
let studioSource = await readFile(
  new URL("../.vuepress/components/SlimeStudio.js", import.meta.url),
  "utf8"
);
const dependencies = {
  "./slime-safety": moduleURL(
    await readFile(
      new URL("../.vuepress/components/slime-safety.js", import.meta.url),
      "utf8"
    )
  ),
  three: threeURL,
  "./slime-model": moduleURL(source),
  "./slime-sculpt": moduleURL(sculptSource),
  "./slime-fusion": moduleURL(fusionSource),
  "./slime-volume": volumeURL,
  "./SlimeSprinkles": moduleURL(
    sprinklesSource.replace('"three"', JSON.stringify(threeURL))
  ),
  // No worker bundler in Node: construction throws, the studio falls back to
  // the synchronous rebuild path.
  "./slime-rebuild.worker": moduleURL("export default null;")
};
studioSource = studioSource.replace(
  /from "([^"]+)"/g,
  (match, name) => `from ${JSON.stringify(dependencies[name] || name)}`
);
const { default: Studio } = await import(moduleURL(studioSource));
const { validSurface } = await import(dependencies["./slime-safety"]);
assert.equal(
  validSurface(
    new Float32Array([
      -1,
      -1,
      0,
      1,
      -1,
      0,
      0,
      1,
      0,
      0,
      -0.5,
      -1,
      0,
      -0.5,
      1,
      0,
      0.5,
      0
    ]),
    [0, 1, 2, 3, 4, 5]
  ),
  false,
  "Crossing triangles are rejected"
);
const safeOriginal = new SlimeModel();
assert.equal(
  validSurface(safeOriginal.positions, safeOriginal.indices),
  true,
  "Undeformed clay has no surface crossings"
);
assert.equal(
  validSurface(
    foldSurface(
      safeOriginal.positions,
      safeOriginal.massBodies[0].vertices,
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      2.8
    ),
    safeOriginal.indices,
    safeOriginal.positions
  ),
  false,
  "Previously accepted intersecting fold is rejected"
);
const studio = Object.create(Studio.prototype);
studio.model = new SlimeModel();
advance(studio.model, 0.2, brush);
studio.geometry = new THREE.BufferGeometry();
studio.geometry.setAttribute(
  "uv",
  new THREE.BufferAttribute(
    new Float32Array((studio.model.positions.length / 3) * 2).fill(0.3),
    2
  )
);
studio.colors = new Float32Array(studio.model.positions.length).fill(0.5);
studio.color = new THREE.Color("#4ECDC4");
studio.distance = 5;
for (const method of ["saveUndo", "sync", "updateCamera", "active", "status"])
  studio[method] = () => {};
const snapshots = {};
for (const key of ["positions", "base", "rest", "velocity"])
  snapshots[key] = studio.model[key].slice();
studio.addClay();
for (const key of Object.keys(snapshots))
  assert.deepEqual(
    studio.model[key].slice(0, snapshots[key].length),
    snapshots[key],
    `Adding clay preserves old ${key}`
  );
assert.equal(studio.model.massBodies.length, 2);
console.log(
  "PASS: adding clay preserves every old position, rest offset, base and velocity"
);

// Fully nested clay must become ONE connected mesh, not two overlapping shells.
const oldCount = snapshots.positions.length / 3;
for (let v = oldCount; v < studio.model.positions.length / 3; v++) {
  studio.model.positions[v * 3] -= 1.85;
  studio.model.positions[v * 3 + 2] += 0.04;
}
studio.model.bake();
studio.model.reconnect();
studio.mesh = new THREE.Mesh();
studio.material = new THREE.MeshPhysicalMaterial();
studio.sprinkles = { items: [] };
studio.bubbles = [];
studio.pointer = 1;
const totalMass = studio.model.massBodies.reduce((s, b) => s + b.volume, 0);
assert.equal(
  studio.tryFuse(true),
  true,
  "Contained solids trigger real fusion"
);
studio.completeFusion();
clearTimeout(studio.fusionTimer);
assert.equal(
  studio.model.massBodies.length,
  1,
  "Dragging after fusion selects one connected body"
);
assert.ok(
  Math.abs(
    meshVolume(studio.model.positions, studio.model.indices) / totalMass - 1
  ) < 0.001
);
advance(studio.model, 5);
assert.ok([...studio.model.positions].every(Number.isFinite));
assert.ok(Math.max(...studio.model.positions.map(Math.abs)) < 3.5);
const collapsed = new SlimeModel();
for (let i = 2; i < collapsed.positions.length; i += 3)
  collapsed.positions[i] *= 1e-6;
const tiny = collapsed.positions.slice();
assert.equal(
  preserveVolume(
    collapsed.positions,
    collapsed.indices,
    collapsed.massBodies[0].vertices,
    collapsed.massBodies[0].volume
  ),
  false
);
assert.deepEqual(
  collapsed.positions,
  tiny,
  "Near-zero volume never causes giant scale correction"
);
console.log(
  "PASS: contained solids weld to one body, mass preserved, no pressure explosion"
);

const fresh = new SlimeModel();
const pieces = tearSurface(
  fresh.positions,
  fresh.indices,
  { x: 0.1, y: 0 },
  { x: 1, y: 0 }
);
for (let v = 0; v < pieces.sides.length; v++)
  pieces.positions[v * 3] -= pieces.sides[v] * 0.16;
studio.installSurface({
  positions: pieces.positions,
  indices: pieces.indices,
  colors: new Float32Array(pieces.positions.length).fill(0.5)
});
assert.ok(studio.model.massBodies.length > 1);
assert.equal(studio.tryFuse(true), true, "Overlapping torn fragments fuse");
studio.completeFusion();
clearTimeout(studio.fusionTimer);
assert.equal(studio.model.massBodies.length, 1);
for (let n = 0; n < 25; n++) {
  const body = studio.model.massBodies[0],
    before = studio.model.positions.slice();
  studio.model.positions.set(
    foldSurface(
      before,
      body.vertices,
      { x: 0, y: 0 },
      { x: n % 2 ? 1 : -1, y: 0 },
      2.8
    )
  );
  if (
    !preserveVolume(
      studio.model.positions,
      body.indices,
      body.vertices,
      body.volume
    )
  )
    studio.model.positions.set(before);
  studio.model.bake();
  studio.model.startSettling(body.vertices);
  advance(studio.model, 0.3);
  assert.ok(studio.model.positions.every(Number.isFinite));
  assert.ok(
    Math.max(...studio.model.positions.map(Math.abs)) <= 3.501,
    "Folded/fused geometry stays on table"
  );
}
console.log(
  "PASS: torn fragments reunite and survive 25 alternating folds without exploding"
);

for (const material of ["butter", "crystal", "liquid", "clay"]) {
  studio.model = new SlimeModel();
  studio.model.material = material;
  studio.colors = new Float32Array(studio.model.positions.length).fill(0.6);
  let acceptedFolds = 0;
  for (let n = 0; n < 8; n++) {
    const body = studio.model.massBodies[0],
      start = studio.model.positions.slice();
    const center = { x: 0, y: 0 };
    for (const v of body.vertices) {
      center.x += start[v * 3] / body.vertices.length;
      center.y += start[v * 3 + 1] / body.vertices.length;
    }
    const direction = { x: Math.cos(n * 2.4), y: Math.sin(n * 2.4) };
    let accepted = null;
    for (let angle = 0.15; angle < 2.8; angle += 0.3) {
      const candidate = foldSurface(
        start,
        body.vertices,
        center,
        direction,
        angle
      );
      if (
        !preserveVolume(candidate, body.indices, body.vertices, body.volume) ||
        !validSurface(candidate, body.indices, start)
      )
        break;
      accepted = candidate;
    }
    if (!accepted) continue;
    acceptedFolds++;
    studio.model.positions.set(accepted);
    const gesture = {
      source: start,
      selected: body.vertices.slice(),
      massBody: body,
      lastValid: accepted
    };
    studio.rebuildFold(gesture);
    studio.model.bake();
    studio.model.startSettling(gesture.selected);
    assert.ok(
      validSurface(studio.model.positions, studio.model.indices),
      "Retessellated fold is intersection-free"
    );
    advance(studio.model, 0.3);
    assert.ok(
      validSurface(studio.model.positions, studio.model.indices),
      "Released fold stays intersection-free"
    );
  }
  assert.ok(acceptedFolds >= 3, "Safety must still allow real deformation");
  console.log(
    "PASS: repeated multi-direction folds validated for intersections:",
    material,
    acceptedFolds
  );
}

// A full-angle UI fold (no angle pre-filter) must survive release: the voxel
// field's contact-seam flakes are dropped, the gesture is NOT rolled back.
{
  studio.model = new SlimeModel();
  studio.model.material = "butter";
  studio.colors = new Float32Array(studio.model.positions.length).fill(0.6);
  const body = studio.model.massBodies[0],
    start = studio.model.positions.slice();
  const folded = foldSurface(
    start,
    body.vertices,
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    Math.PI * 0.94
  );
  studio.model.positions.set(folded);
  const gesture = {
    source: start,
    selected: body.vertices.slice(),
    massBody: body,
    lastValid: folded
  };
  studio.rebuildFold(gesture);
  const peak = Math.max(
    ...studio.model.positions.filter((_, i) => i % 3 === 2)
  );
  assert.ok(
    peak > 0.55,
    `Full fold must keep its raised layer on release, peak ${peak}`
  );
  const edges = new Map();
  for (let i = 0; i < studio.model.indices.length; i += 3)
    for (let j = 0; j < 3; j++) {
      const key = [
        studio.model.indices[i + j],
        studio.model.indices[i + ((j + 1) % 3)]
      ]
        .sort((a, b) => a - b)
        .join(",");
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  assert.ok(
    [...edges.values()].every(n => n === 2),
    "Rebuilt fold surface stays closed after dropping flakes"
  );
  studio.model.bake();
  studio.model.startSettling(gesture.selected);
  advance(studio.model, 1);
  const volume =
    meshVolume(studio.model.positions, studio.model.indices) /
    studio.model.massBodies[0].volume;
  assert.ok(
    Math.abs(volume - 1) < 0.001,
    `Fold keeps its volume while settling, ratio ${volume}`
  );
  console.log(
    "PASS: full butter fold survives release, seam flakes dropped, peak",
    peak
  );
}

// The worker path: release bakes the fold instantly (no freeze), the swapped
// surface starts settling, and stale results are discarded.
{
  studio.model = new SlimeModel();
  studio.model.material = "butter";
  studio.colors = new Float32Array(studio.model.positions.length).fill(0.6);
  const sent = [];
  studio.foldWorker = { postMessage: msg => sent.push(msg), terminate() {} };
  const body = studio.model.massBodies[0],
    start = studio.model.positions.slice();
  const folded = foldSurface(
    start,
    body.vertices,
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    Math.PI * 0.94
  );
  studio.model.positions.set(folded);
  const gesture = {
    source: start,
    selected: body.vertices.slice(),
    massBody: body,
    lastValid: folded
  };
  assert.equal(studio.startFoldRebuild(gesture), true, "Async rebuild starts");
  assert.ok(studio.rebuilding, "Rebuild is pending");
  assert.deepEqual(
    studio.model.base,
    studio.model.positions,
    "Fold is baked at release, holding its shape immediately"
  );
  assert.equal(sent.length, 1, "Worker received exactly one job");
  assert.ok(
    studio.startFoldRebuild(gesture) === false,
    "A second gesture cannot queue while rebuilding"
  );
  studio.finishFoldRebuild({ ok: false, jobId: sent[0].jobId }); // Rejected: baked fold must survive.
  assert.equal(studio.rebuilding, null);
  assert.ok(studio.model.settling, "Rejected rebuild still settles the fold");
  studio.model.settling = null;
  assert.deepEqual(
    studio.model.positions,
    folded,
    "Rejected async rebuild keeps the baked fold instead of rolling back"
  );
  assert.equal(studio.startFoldRebuild(gesture), true);
  const pendingNew = studio.rebuilding,
    timeoutNew = studio.rebuildTimeout;
  const beforeStale = studio.model.positions.slice();
  studio.finishFoldRebuild({ ok: true, jobId: sent[0].jobId });
  studio.finishFoldRebuild({ ok: false, jobId: sent[0].jobId });
  assert.equal(
    studio.rebuilding,
    pendingNew,
    "Old success/error must not consume a newer job"
  );
  assert.equal(
    studio.rebuildTimeout,
    timeoutNew,
    "Old responses must not clear the newer timeout"
  );
  assert.equal(timeoutNew._destroyed, false);
  assert.deepEqual(studio.model.positions, beforeStale);
  assert.equal(
    studio.tryFuse(),
    false,
    "Fusion is blocked during worker rebuild"
  );
  let rebuilt = fuseSurface(sent[1].positions, sent[1].indices, sent[1].colors);
  rebuilt = largestPart(rebuilt.positions, rebuilt.indices, rebuilt.colors);
  const all = Array.from({ length: rebuilt.positions.length / 3 }, (_, i) => i);
  preserveVolume(rebuilt.positions, rebuilt.indices, all, sent[1].volume);
  studio.finishFoldRebuild({ ok: true, ...rebuilt, jobId: sent[1].jobId });
  assert.equal(studio.rebuilding, null);
  assert.ok(studio.model.settling, "Accepted rebuild starts settling");
  const asyncPeak = Math.max(
    ...studio.model.positions.filter((_, i) => i % 3 === 2)
  );
  assert.ok(
    asyncPeak > 0.55,
    `Async fold keeps its raised layer, peak ${asyncPeak}`
  );
  studio.finishFoldRebuild({ ok: true, ...rebuilt, jobId: sent[1].jobId }); // Stale: nothing pending.
  const before = studio.model.positions.slice();
  advance(studio.model, 0.5);
  assert.ok(studio.model.positions.every(Number.isFinite));
  assert.ok(
    Math.max(...studio.model.positions.map((v, i) => Math.abs(v - before[i]))) >
      0,
    "Settling proceeds after the async install"
  );
  // Cancel A (reset/undo), begin B, then deliver A's late result.
  const makeGesture = () => ({
    selected: studio.model.massBodies[0].vertices.slice(),
    massBody: studio.model.massBodies[0]
  });
  assert.equal(studio.startFoldRebuild(makeGesture()), true);
  const canceled = sent.at(-1),
    canceledTimer = studio.rebuildTimeout;
  let terminated = 0;
  studio.foldWorker.terminate = () => terminated++;
  studio.cancelFoldRebuild();
  assert.equal(terminated, 1);
  assert.equal(canceledTimer._destroyed, true);
  studio.foldWorker = {
    postMessage: msg => sent.push(msg),
    terminate: () => terminated++
  };
  assert.equal(studio.startFoldRebuild(makeGesture()), true);
  const afterReset = studio.rebuilding;
  assert.ok(afterReset.jobId > canceled.jobId);
  studio.finishFoldRebuild({ ok: true, jobId: canceled.jobId, ...rebuilt });
  assert.equal(
    studio.rebuilding,
    afterReset,
    "Reset then new fold ignores old result"
  );
  // Exercise the actual timeout callback; it must release AND terminate worker.
  studio.rebuildTimeout._onTimeout();
  assert.equal(studio.rebuilding, null);
  assert.equal(studio.foldWorker, null);
  assert.equal(terminated, 2);
  studio.foldWorker = { postMessage: msg => sent.push(msg), terminate() {} };
  assert.equal(studio.startFoldRebuild(makeGesture()), true);
  const afterTimeout = studio.rebuilding;
  studio.finishFoldRebuild({ ok: false, jobId: afterReset.jobId });
  assert.equal(
    studio.rebuilding,
    afterTimeout,
    "Timeout then new fold ignores old result"
  );
  studio.cancelFoldRebuild();
  studio.fusion = {};
  assert.equal(
    studio.startFoldRebuild(makeGesture()),
    false,
    "Worker rebuild cannot start during fusion"
  );
  studio.fusion = null;
  clearTimeout(studio.fusionTimer);
  console.log(
    "PASS: worker fold path bakes instantly, installs, settles, drops stale results, peak",
    asyncPeak
  );
}
