import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../.vuepress/components/slime-model.js", import.meta.url),
  "utf8"
);
const { default: SlimeModel } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
const sculptSource = await readFile(
  new URL("../.vuepress/components/slime-sculpt.js", import.meta.url),
  "utf8"
);
const { tearSurface, foldSurface, connectedVertices } = await import(
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
