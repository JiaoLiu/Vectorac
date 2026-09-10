import * as THREE from "three";

export default class SlimeSprinkles {
  constructor(parent) {
    this.parent = parent;
    this.items = [];
    this.limit = 600;
    this.object = new THREE.Object3D();
    this.normal = new THREE.Vector3();
    this.layers = {};
    ["glitter", "foil"].forEach(type => {
      const geometry =
        type === "foil"
          ? new THREE.BoxGeometry(1, 0.65, 0.04)
          : new THREE.OctahedronGeometry(0.55, 0);
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(
          type === "foil" ? 0xeabb60 : 0xd28bdc
        ).convertSRGBToLinear(),
        metalness: 1,
        roughness: type === "foil" ? 0.22 : 0.13,
        envMapIntensity: 1.4
      });
      const mesh = new THREE.InstancedMesh(geometry, material, this.limit);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      parent.add(mesh);
      this.layers[type] = mesh;
    });
  }
  sprinkle(type, point, model, normals) {
    const p = model.positions,
      candidates = [];
    for (let i = 0; i < p.length; i += 3) {
      if (
        (p[i] - point.x) ** 2 +
          (p[i + 1] - point.y) ** 2 +
          (p[i + 2] - point.z) ** 2 <
          0.24 &&
        normals.getZ(i / 3) > 0.15
      )
        candidates.push(i / 3);
    }
    if (!candidates.length) return;
    for (let n = 0; n < 18 && this.items.length < this.limit; n++) {
      const vertex = candidates[Math.floor(Math.random() * candidates.length)],
        i = vertex * 3;
      this.items.push({
        type,
        vertex,
        size:
          type === "foil"
            ? 0.035 + Math.random() * 0.03
            : 0.014 + Math.random() * 0.02,
        position: [p[i], p[i + 1], p[i + 2] + 0.6 + Math.random() * 0.5],
        speed: 0,
        age: 0,
        embed: 0,
        landed: false,
        spin: Math.random() * Math.PI * 2
      });
    }
  }
  step(dt, model, normals, brush) {
    const counts = { glitter: 0, foil: 0 },
      p = model.positions;
    this.items.forEach(item => {
      const i = item.vertex * 3;
      if (i >= p.length) return;
      item.age += dt;
      this.normal.fromBufferAttribute(normals, item.vertex);
      if (!item.landed) {
        item.speed += dt * 3.8;
        item.position[2] -= item.speed * dt;
        if (item.position[2] <= p[i + 2] + 0.012) item.landed = true;
      }
      if (item.landed) {
        if (brush) {
          const d =
            (p[i] - brush.point.x) ** 2 +
            (p[i + 1] - brush.point.y) ** 2 +
            (p[i + 2] - brush.point.z) ** 2;
          item.embed = Math.min(
            0.1,
            item.embed + dt * 0.085 * Math.exp(-d / brush.radius ** 2)
          );
        }
        const offset = 0.01 - item.embed;
        item.position = [
          p[i] + this.normal.x * offset,
          p[i + 1] + this.normal.y * offset,
          p[i + 2] + this.normal.z * offset
        ];
      }
      const o = this.object;
      o.position.fromArray(item.position);
      o.scale.setScalar(item.size);
      o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.normal);
      o.rotateZ(item.spin + (item.landed ? 0 : item.age * 5));
      if (!item.landed) o.rotateX(item.age * 4);
      else o.rotateX(Math.sin(item.spin) * 0.22);
      o.updateMatrix();
      this.layers[item.type].setMatrixAt(counts[item.type]++, o.matrix);
    });
    Object.keys(counts).forEach(type => {
      this.layers[type].count = counts[type];
      this.layers[type].instanceMatrix.needsUpdate = true;
    });
  }
  remap(sourceMap) {
    const reverse = new Map();
    sourceMap.forEach((old, i) => {
      if (!reverse.has(old)) reverse.set(old, i);
    });
    this.items.forEach(item => {
      item.vertex = reverse.get(item.vertex);
    });
    this.items = this.items.filter(item => item.vertex !== undefined);
  }
  snapshot() {
    return this.items.map(item => ({
      ...item,
      position: item.position.slice()
    }));
  }
  restore(items) {
    this.items = items.map(item => ({
      ...item,
      position: item.position.slice()
    }));
  }
  clear() {
    this.items = [];
    Object.values(this.layers).forEach(mesh => {
      mesh.count = 0;
    });
  }
}
