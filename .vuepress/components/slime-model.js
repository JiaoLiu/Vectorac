import { meshVolume, preserveVolume } from "./slime-volume";
// Closed, shared-vertex surface. Positions and plastic offsets are in object space.
export const MATERIALS = {
  butter: {
    name: "黄油泥",
    spring: 5,
    damping: 13,
    memory: 0.065,
    plastic: 0.65,
    roughness: 0.65,
    transmission: 0,
    tip: "柔软哑光，指印慢慢恢复。"
  },
  crystal: {
    name: "水晶胶",
    spring: 16,
    damping: 10,
    memory: 0.25,
    plastic: 0.18,
    roughness: 0.12,
    transmission: 0.88,
    tip: "透光胶体，回弹更利落，试试转到侧面看。"
  },
  memory: {
    name: "超慢回弹",
    spring: 2.2,
    damping: 16,
    memory: 0.015,
    plastic: 1.1,
    roughness: 0.38,
    transmission: 0.12,
    tip: "深指印会停留很久，适合慢慢揉。"
  },
  liquid: {
    name: "流动胶",
    spring: 4,
    damping: 12,
    memory: 0.3,
    plastic: 0.3,
    roughness: 0.18,
    transmission: 0.5,
    tip: "逐渐向外摊开，模具轮廓也会慢慢融化。"
  },
  foam: {
    name: "起泡胶",
    spring: 7,
    damping: 12,
    memory: 0.1,
    plastic: 0.5,
    roughness: 0.32,
    transmission: 0.22,
    tip: "按住再松开能带出气泡，也可用起泡工具。"
  },
  clay: {
    name: "雕塑泥",
    spring: 5,
    damping: 17,
    memory: 0,
    plastic: 2.8,
    roughness: 0.82,
    transmission: 0,
    tip: "保留捏痕，配合刻线、捏起和抹平塑形。"
  }
};

export function moldRadius(angle, mold) {
  if (mold === "star") {
    const sector = Math.PI / 5;
    const phase =
      (((angle - Math.PI / 2) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const k = Math.floor(phase / sector),
      t = phase - k * sector;
    const a = k % 2 === 0 ? 1.25 : 0.64,
      b = k % 2 === 0 ? 0.64 : 1.25;
    return (
      (a * b * Math.sin(sector)) / (b * Math.sin(sector - t) + a * Math.sin(t))
    );
  }
  if (mold === "heart") {
    let low = 0,
      high = 1.5;
    for (let j = 0; j < 18; j++) {
      const r = (low + high) / 2,
        x = r * Math.cos(angle),
        y = r * Math.sin(angle);
      if ((x * x + y * y - 1) ** 3 - x * x * y ** 3 <= 0) low = r;
      else high = r;
    }
    return low * 0.95;
  }
  if (mold === "melody") {
    // Hooded bunny silhouette: rounded face and two long, softly bent ears.
    let radius = 0.8;
    for (let r = 0.01; r < 1.55; r += 0.008) {
      const x = r * Math.cos(angle),
        y = r * Math.sin(angle);
      const head = (x / 1.04) ** 2 + ((y + 0.15) / 0.82) ** 2 < 1;
      const left =
        ((x + 0.48 + (y - 0.65) * 0.12) / 0.27) ** 2 +
          ((y - 0.73) / 0.78) ** 2 <
        1;
      const right =
        ((x - 0.47 - (y - 0.65) * 0.18) / 0.29) ** 2 + ((y - 0.75) / 0.7) ** 2 <
        1;
      if (head || left || right) radius = r;
    }
    return radius * 0.88;
  }
  return 1.1;
}

export default class SlimeModel {
  constructor(mold = "round", segments = 80, rings = 40) {
    this.segments = segments;
    this.rings = rings;
    this.material = "butter";
    this.sculpt = false;
    this.spread = 1;
    const count = (rings - 1) * segments + 2;
    this.positions = new Float32Array(count * 3);
    this.base = new Float32Array(count * 3);
    this.rest = new Float32Array(count * 3);
    this.velocity = new Float32Array(count * 3);
    this.neighbors = Array.from({ length: count }, () => new Set());
    const indices = [];
    const vertex = (r, s) =>
      1 + (r - 1) * segments + ((s + segments) % segments);
    const tri = (a, b, c) => {
      indices.push(a, b, c);
      this.neighbors[a].add(b).add(c);
      this.neighbors[b].add(a).add(c);
      this.neighbors[c].add(a).add(b);
    };
    for (let s = 0; s < segments; s++) {
      tri(0, vertex(1, s), vertex(1, s + 1));
      for (let r = 1; r < rings - 1; r++) {
        tri(vertex(r, s), vertex(r + 1, s), vertex(r + 1, s + 1));
        tri(vertex(r, s), vertex(r + 1, s + 1), vertex(r, s + 1));
      }
      tri(vertex(rings - 1, s + 1), vertex(rings - 1, s), count - 1);
    }
    this.indices = indices;
    this.templateIndices = indices.slice();
    this.templateCount = count;
    this.neighbors = this.neighbors.map(n => [...n]);
    this.reset(mold);
  }

  reset(mold = this.mold) {
    this.settling = null;
    if (
      this.positions.length !== this.templateCount * 3 ||
      this.indices.length !== this.templateIndices.length
    ) {
      this.positions = new Float32Array(this.templateCount * 3);
      this.base = new Float32Array(this.positions.length);
      this.rest = new Float32Array(this.positions.length);
      this.velocity = new Float32Array(this.positions.length);
      this.indices = this.templateIndices.slice();
      this.reconnect();
    }
    this.mold = mold;
    this.freeform = false;
    this.spread = 1;
    this.rest.fill(0);
    this.velocity.fill(0);
    const n = this.positions.length;
    this.base.fill(0);
    this.base[2] = 0.43;
    this.base[n - 1] = -0.25;
    for (let r = 1; r < this.rings; r++) {
      const theta = (r / this.rings) * Math.PI;
      for (let s = 0; s < this.segments; s++) {
        const angle = (s / this.segments) * Math.PI * 2;
        const radius = moldRadius(angle, mold) * Math.sin(theta);
        const i = (1 + (r - 1) * this.segments + s) * 3;
        this.base[i] = radius * Math.cos(angle);
        this.base[i + 1] = radius * Math.sin(angle);
        this.base[i + 2] = Math.cos(theta) * (r < this.rings / 2 ? 0.43 : 0.25);
      }
    }
    this.positions.set(this.base);
    this.captureVolumes();
  }

  reconnect() {
    const neighbors = Array.from(
      { length: this.positions.length / 3 },
      () => new Set()
    );
    for (let i = 0; i < this.indices.length; i += 3) {
      const [a, b, c] = this.indices.slice(i, i + 3);
      neighbors[a].add(b).add(c);
      neighbors[b].add(a).add(c);
      neighbors[c].add(a).add(b);
    }
    this.neighbors = neighbors.map(n => [...n]);
    this.captureVolumes();
  }

  captureVolumes() {
    const labels = new Int32Array(this.positions.length / 3).fill(-1),
      groups = [];
    for (let v = 0; v < labels.length; v++) {
      if (labels[v] >= 0) continue;
      const vertices = [v],
        label = groups.length;
      labels[v] = label;
      for (let j = 0; j < vertices.length; j++)
        for (const n of this.neighbors[vertices[j]])
          if (labels[n] < 0) {
            labels[n] = label;
            vertices.push(n);
          }
      groups.push({ vertices, indices: [], volume: 0 });
    }
    for (let i = 0; i < this.indices.length; i += 3)
      groups[labels[this.indices[i]]].indices.push(
        ...this.indices.slice(i, i + 3)
      );
    groups.forEach(g => {
      g.volume = meshVolume(this.positions, g.indices);
    });
    this.massBodies = groups;
  }

  bake() {
    this.freeform = true;
    this.base = this.positions.slice();
    this.rest = new Float32Array(this.positions.length);
    this.velocity = new Float32Array(this.positions.length);
    this.spread = 1;
  }

  startSettling(vertices) {
    if (this.material === "clay") {
      this.settling = null;
      return;
    }
    this.settling = { vertices: vertices.slice(), speed: 0, age: 0 };
  }

  settle(dt) {
    const state = this.settling;
    if (!state) return;
    const p = this.positions,
      floor = -0.25;
    let low = Infinity,
      high = -Infinity,
      cx = 0,
      cy = 0;
    state.vertices.forEach(v => {
      low = Math.min(low, p[v * 3 + 2]);
      high = Math.max(high, p[v * 3 + 2]);
      cx += p[v * 3] / state.vertices.length;
      cy += p[v * 3 + 1] / state.vertices.length;
    });
    const rates = {
      clay: 0,
      liquid: 3.5,
      crystal: 0.9,
      butter: 0.45,
      memory: 0.12,
      foam: 0.35
    };
    const rate = rates[this.material];
    if (!rate) {
      this.settling = null;
      return;
    }
    state.speed += rate * 2.2 * dt;
    const drop = Math.min(Math.max(0, low - floor), state.speed * dt);
    const height = high - low;
    const heights = {
      liquid: 0.4,
      crystal: 0.62,
      butter: 0.72,
      memory: 0.82,
      foam: 0.74
    };
    const restingHeight = heights[this.material];
    const factor =
      1 -
      (Math.max(0, height - restingHeight) / Math.max(0.01, height)) *
        (1 - Math.exp(-dt * rate));
    // The fold is volume-corrected before settling; a lower slab must spread
    // sideways by the reciprocal square root to retain the same volume.
    const spread = 1 / Math.sqrt(factor);
    state.vertices.forEach(v => {
      const i = v * 3,
        target = [
          cx + (p[i] - cx) * spread,
          cy + (p[i + 1] - cy) * spread,
          low + (p[i + 2] - low) * factor - drop
        ];
      for (let c = 0; c < 3; c++) {
        this.base[i + c] += target[c] - p[i + c];
        p[i + c] = target[c];
      }
    });
    state.age += dt;
    if (
      (height <= restingHeight + 0.003 && low - floor < 0.003) ||
      state.age > 60
    )
      this.settling = null;
  }

  carve(point, normal, radius) {
    // A stroke is an immediate plastic groove, not a tiny per-frame spring force.
    for (let i = 0; i < this.positions.length; i += 3) {
      const dx = this.positions[i] - point.x,
        dy = this.positions[i + 1] - point.y,
        dz = this.positions[i + 2] - point.z;
      const planeDistance = dx * normal.x + dy * normal.y + dz * normal.z;
      if (Math.abs(planeDistance) > 0.19) continue;
      const tangent2 = Math.max(
        0,
        dx * dx + dy * dy + dz * dz - planeDistance * planeDistance
      );
      const weight = Math.exp(-tangent2 / (radius * radius * 0.5));
      if (weight < 0.01) continue;
      const depth = Math.min(0.07, Math.max(0, planeDistance + 0.075)) * weight;
      for (let c = 0; c < 3; c++) {
        const delta = -[normal.x, normal.y, normal.z][c] * depth;
        this.positions[i + c] += delta;
        this.rest[i + c] += delta;
        this.velocity[i + c] = 0;
      }
    }
  }

  step(dt, brush) {
    const previous = this.positions.slice();
    const m = MATERIALS[this.material],
      p = this.positions;
    const flowing = this.material === "liquid" && !this.sculpt;
    if (flowing) this.spread += (1.38 - this.spread) * dt * 0.32;
    const preserve = this.sculpt || this.material === "clay";
    for (let i = 0; i < p.length; i += 3) {
      const dx = brush ? p[i] - brush.point.x : 0;
      const dy = brush ? p[i + 1] - brush.point.y : 0;
      const dz = brush ? p[i + 2] - brush.point.z : 0;
      const d2 = dx * dx + dy * dy + dz * dz;
      const weight = brush
        ? Math.exp(-d2 / (brush.radius * brush.radius * 0.5))
        : 0;
      const restDecay = preserve ? 1 : Math.exp(-dt * m.memory);
      for (let c = 0; c < 3; c++) {
        const k = i + c;
        let base = this.base[k];
        if (this.spread > 1) {
          // Move toward a round puddle as the mold loses definition.
          if (c < 2 && this.freeform) {
            base *= this.spread;
          } else if (c < 2) {
            const length = Math.hypot(this.base[i], this.base[i + 1]);
            const round =
              length > 0
                ? (base / length) *
                  Math.sin(
                    Math.acos(
                      Math.max(
                        -1,
                        Math.min(
                          1,
                          this.base[i + 2] /
                            (this.base[i + 2] > 0 ? 0.43 : 0.25)
                        )
                      )
                    )
                  ) *
                  1.1
                : 0;
            base =
              (base + (round - base) * Math.min(1, (this.spread - 1) * 2.6)) *
              this.spread;
          } else base /= this.spread ** 2;
        }
        this.rest[k] *= restDecay;
        let target = base + this.rest[k];
        let force = 0;
        if (brush && weight > 0.001) {
          const normal = [brush.normal.x, brush.normal.y, brush.normal.z][c];
          if (brush.tool === "smooth") {
            const neighbors = this.neighbors[i / 3];
            let avg = 0;
            for (const j of neighbors) avg += p[j * 3 + c];
            force = (avg / neighbors.length - p[k]) * weight * 100;
          } else {
            const direction =
              brush.tool === "pinch" || brush.tool === "bubble" ? 1 : -1;
            const rim =
              direction < 0
                ? 0.22 * Math.exp(-d2 / (brush.radius ** 2 * 1.8))
                : 0;
            force = normal * (direction * weight + rim) * brush.strength * 22;
            if (brush.tool === "pinch") force -= [dx, dy, dz][c] * weight * 10;
            if (brush.tool === "flatten") force *= 0.55;
          }
          this.rest[k] +=
            (p[k] - base - this.rest[k]) *
            dt *
            (preserve ? 4 : m.plastic) *
            weight;
          target = base + this.rest[k];
        }
        // Surface coupling of displacement, preserving the mold's original curvature.
        let lap = 0;
        for (const j of this.neighbors[i / 3])
          lap += p[j * 3 + c] - this.base[j * 3 + c] - (p[k] - this.base[k]);
        lap /= this.neighbors[i / 3].length;
        this.velocity[k] +=
          ((target - p[k]) * m.spring +
            force +
            lap * (preserve ? 0.3 : 1.4) -
            this.velocity[k] * m.damping) *
          dt;
      }
    }
    for (let i = 0; i < p.length; i++) {
      p[i] += this.velocity[i] * dt;
      // Bound deformation so repeated carving cannot invert the thin body.
      const c = i % 3,
        limit = c === 2 ? 0.3 : 0.48;
      const min = this.base[i] - limit,
        max = this.base[i] + limit;
      if (p[i] < min || p[i] > max) {
        p[i] = Math.max(min, Math.min(max, p[i]));
        this.velocity[i] = 0;
      }
      this.rest[i] = Math.max(-limit, Math.min(limit, this.rest[i]));
    }
    this.settle(dt);
    if (this.massBodies)
      for (const body of this.massBodies) {
        const before = this.positions.slice();
        const valid = preserveVolume(
          this.positions,
          body.indices,
          body.vertices,
          body.volume
        );
        for (const v of body.vertices)
          for (let c = 0; c < 3; c++) {
            const i = v * 3 + c;
            if (!valid || !Number.isFinite(this.positions[i])) {
              this.positions[i] = previous[i];
              this.velocity[i] = 0;
            } else {
              // Pressure correction must move the reference surface too, otherwise
              // springs fight it next frame and amplify remeshing into sharp spikes.
              this.base[i] += this.positions[i] - before[i];
            }
          }
      }
    this.constrainToTable();
  }

  constrainToTable() {
    for (const body of this.massBodies || []) {
      for (let c = 0; c < 2; c++) {
        let lo = Infinity,
          hi = -Infinity;
        for (const v of body.vertices) {
          lo = Math.min(lo, this.positions[v * 3 + c]);
          hi = Math.max(hi, this.positions[v * 3 + c]);
        }
        const shift = lo < -3.5 ? -3.5 - lo : hi > 3.5 ? 3.5 - hi : 0;
        if (shift)
          for (const v of body.vertices) {
            this.positions[v * 3 + c] += shift;
            this.base[v * 3 + c] += shift;
          }
      }
    }
  }
}
