import * as THREE from "three";
import SlimeModel, { MATERIALS } from "./slime-model";
import { tearSurface, foldSurface, connectedVertices } from "./slime-sculpt";
import SlimeSprinkles from "./SlimeSprinkles";

export default class SlimeStudio {
  constructor(canvas) {
    this.canvas = canvas;
    this.root = canvas.closest(".game-container");
    this.listeners = [];
    this.bubbles = [];
    this.undoStack = [];
    this.model = new SlimeModel();
    this.tool = "pump";
    this.radius = 0.24;
    this.color = new THREE.Color("#FF6B9D").convertSRGBToLinear();
    this.yaw = 0;
    this.elevation = 0.95;
    this.distance = 4.5;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#f2eef3");
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 30);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8c738a, 0.45));
    [
      [-3, 5, 3, 0xfff4ea, 1.5],
      [3, 2, -3, 0xd8edff, 0.65]
    ].forEach(([x, y, z, c, p]) => {
      const light = new THREE.DirectionalLight(c, p);
      light.position.set(x, y, z);
      this.scene.add(light);
    });
    const studio = new THREE.Scene();
    studio.background = new THREE.Color("#eee8ef");
    [
      [-4, 5, 3],
      [4, 3, -2],
      [0, 6, 0]
    ].forEach(([x, y, z]) => {
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(4, 4),
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
      );
      panel.position.set(x, y, z);
      panel.lookAt(0, 0, 0);
      studio.add(panel);
    });
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(studio, 0.04);
    this.scene.environment = this.environment.texture;
    pmrem.dispose();
    studio.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.model.positions, 3).setUsage(
        THREE.DynamicDrawUsage
      )
    );
    this.colors = new Float32Array(this.model.positions.length);
    this.geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage)
    );
    this.geometry.setIndex(this.model.indices);
    this.material = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      envMapIntensity: 0.45
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.32;
    this.scene.add(this.mesh);
    this.sprinkles = new SlimeSprinkles(this.mesh);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0xf2eef3, roughness: 0.9 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.04;
    this.scene.add(floor);
    const matCanvas = document.createElement("canvas");
    matCanvas.width = matCanvas.height = 256;
    const matContext = matCanvas.getContext("2d");
    matContext.fillStyle = "#eee5ef";
    matContext.fillRect(0, 0, 256, 256);
    matContext.strokeStyle = "#cdbed1";
    matContext.lineWidth = 1.5;
    for (let x = 0; x < 256; x += 32) {
      matContext.beginPath();
      matContext.moveTo(x, 0);
      matContext.lineTo(x, 256);
      matContext.moveTo(0, x);
      matContext.lineTo(256, x);
      matContext.stroke();
    }
    this.floorTexture = new THREE.CanvasTexture(matCanvas);
    this.floorTexture.encoding = THREE.sRGBEncoding;
    const mat = new THREE.Mesh(
      new THREE.PlaneGeometry(4.5, 4.5),
      new THREE.MeshStandardMaterial({
        map: this.floorTexture,
        roughness: 0.95
      })
    );
    mat.rotation.x = -Math.PI / 2;
    mat.position.y = -0.035;
    this.scene.add(mat);
    const image = document.createElement("canvas");
    image.width = image.height = 128;
    const ctx = image.getContext("2d"),
      gradient = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
    gradient.addColorStop(0, "rgba(60,30,60,.25)");
    gradient.addColorStop(1, "rgba(60,30,60,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    this.shadowTexture = new THREE.CanvasTexture(image);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 3.6),
      new THREE.MeshBasicMaterial({
        map: this.shadowTexture,
        transparent: true,
        depthWrite: false
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.03;
    this.scene.add(shadow);
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.pointers = new Map();
    this.resize = () => {
      const p = canvas.parentElement;
      if (this.root.classList.contains("slime-fs")) {
        this.renderer.setSize(
          Math.max(200, p.clientWidth),
          Math.max(240, p.clientHeight),
          false
        );
      } else {
        const w = p.clientWidth;
        this.renderer.setSize(w, Math.max(340, Math.min(560, w * 0.76)), false);
      }
      this.camera.aspect = canvas.width / canvas.height;
      this.camera.updateProjectionMatrix();
    };
    this.on(window, "resize", this.resize);
    this.resize();
    this.updateCamera();
    this.paintMold();
    this.setMaterial("butter");
    this.sync();
    this.bind();
    this.frame = time => {
      if (!canvas.isConnected) {
        this.destroy();
        return;
      }
      const dt =
        this.last === undefined ? 0 : Math.min((time - this.last) / 1000, 0.05);
      this.last = time;
      this.acc = (this.acc || 0) + dt;
      while (this.acc >= 1 / 120) {
        if (this.brush) {
          this.held += 1 / 120;
          this.brush.strength =
            this.pressure * (0.55 + Math.min(1, this.held * 0.8));
        }
        if (!this.manipulation) this.model.step(1 / 120, this.brush);
        this.acc -= 1 / 120;
      }
      if (this.brush && this.tool !== "smooth") this.mixColor(dt);
      this.sync();
      if (this.sprinkling) {
        this.sprayClock = (this.sprayClock || 0) + dt;
        if (this.sprayClock > 0.12) {
          this.sprinkles.sprinkle(
            this.tool,
            this.sprinkling,
            this.model,
            this.geometry.attributes.normal
          );
          this.sprayClock = 0;
        }
      }
      this.sprinkles.step(
        dt,
        this.model,
        this.geometry.attributes.normal,
        this.brush
      );
      this.bubbles.forEach(b => {
        b.age += dt;
        const i = b.vertex * 3,
          p = this.model.positions;
        b.mesh.position.set(p[i], p[i + 1], p[i + 2]);
        const normal = this.geometry.attributes.normal;
        b.mesh.position.x += normal.getX(b.vertex) * b.radius * 0.35;
        b.mesh.position.y += normal.getY(b.vertex) * b.radius * 0.35;
        b.mesh.position.z += normal.getZ(b.vertex) * b.radius * 0.35;
        b.mesh.scale.setScalar(Math.min(1, b.age * 3));
      });
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(this.frame);
    };
    this.raf = requestAnimationFrame(this.frame);
  }

  on(target, event, fn, options) {
    target.addEventListener(event, fn, options);
    this.listeners.push(() => target.removeEventListener(event, fn, options));
  }
  status(text) {
    this.root.querySelector("[data-slime-status]").textContent = text;
  }
  active(attr, value) {
    this.root
      .querySelectorAll(`[data-${attr}]`)
      .forEach(b => b.classList.toggle("active", b.dataset[attr] === value));
  }
  bind() {
    const c = this.canvas;
    this.on(c, "contextmenu", e => e.preventDefault());
    this.on(c, "pointerdown", e => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        this.beginPinch();
        return;
      }
      if (this.pointer !== undefined) return;
      this.rotating = this.tool === "rotate" || e.button === 2 || e.altKey;
      const hit = this.hit(e);
      if (
        !this.rotating &&
        !hit &&
        !(
          this.tool === "pop" &&
          this.raycaster.intersectObjects(
            this.bubbles.map(b => b.mesh),
            false
          ).length
        )
      ) {
        // 空白处按下：直接旋转视角，无需切换工具。
        this.rotating = true;
      }
      e.preventDefault();
      this.pointer = e.pointerId;
      this.previous = { x: e.clientX, y: e.clientY };
      this.held = 0;
      this.pressure =
        e.pointerType === "pen" ? Math.max(0.15, e.pressure) : 0.65;
      c.setPointerCapture(e.pointerId);
      if (!this.rotating) {
        this.saveUndo();
        if (this.tool === "pop") this.pop(e);
        else if (["tear", "fold", "move"].includes(this.tool))
          this.beginManipulation(hit, e);
        else if (["glitter", "foil"].includes(this.tool)) {
          this.sprinkling = this.mesh.worldToLocal(hit.point.clone());
          this.sprinkles.sprinkle(
            this.tool,
            this.sprinkling,
            this.model,
            this.geometry.attributes.normal
          );
        } else this.setBrush(hit);
      }
    });
    this.on(c, "pointermove", e => {
      if (this.pointers.has(e.pointerId))
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch) {
        this.movePinch();
        return;
      }
      if (e.pointerId !== this.pointer) return;
      if (this.rotating) {
        this.yaw -= (e.clientX - this.previous.x) * 0.009;
        this.elevation = THREE.MathUtils.clamp(
          this.elevation + (e.clientY - this.previous.y) * 0.007,
          0.12,
          1.55
        );
        this.updateCamera();
      } else if (this.tool === "pop") this.pop(e);
      else if (this.manipulation) this.dragManipulation(e);
      else if (["glitter", "foil"].includes(this.tool)) {
        const hit = this.hit(e);
        this.sprinkling = hit
          ? this.mesh.worldToLocal(hit.point.clone())
          : null;
      } else {
        const hit = this.hit(e);
        if (hit) this.setBrush(hit);
        else this.brush = null;
      }
      this.previous = { x: e.clientX, y: e.clientY };
    });
    const release = e => {
      this.pointers.delete(e.pointerId);
      if (this.pinch && this.pointers.size < 2) {
        this.pinch = null;
        this.previous = { x: e.clientX, y: e.clientY };
      }
      if (e.pointerId !== this.pointer) return;
      if (
        e.type === "pointerup" &&
        this.brush &&
        this.held > 0.25 &&
        (this.tool === "bubble" || this.model.material === "foam")
      )
        this.addBubble();
      this.pointer = undefined;
      this.brush = null;
      this.carvePoint = null;
      if (this.carveReference) this.carveReference.geometry.dispose();
      this.carveReference = null;
      this.sprinkling = null;
      if (this.manipulation) {
        this.model.bake();
        this.manipulation = null;
      }
    };
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(e =>
      this.on(c, e, release)
    );
    this.on(
      c,
      "wheel",
      e => {
        if (e.ctrlKey || e.metaKey) return;
        e.preventDefault();
        this.distance = THREE.MathUtils.clamp(
          this.distance + e.deltaY * 0.003,
          3,
          7
        );
        this.updateCamera();
      },
      { passive: false }
    );
    this.root.querySelectorAll(".color-btn").forEach(b =>
      this.on(b, "click", () => {
        this.color.set(b.dataset.color).convertSRGBToLinear();
        const colorInput = this.root.querySelector("[data-fs-color]");
        if (colorInput) colorInput.value = b.dataset.color;
        this.root
          .querySelectorAll(".color-btn")
          .forEach(x => x.classList.toggle("active", x === b));
        this.status("颜色会随揉捏混入表面。");
      })
    );
    this.root.querySelectorAll("[data-tool]").forEach(b =>
      this.on(b, "click", () => {
        this.tool = b.dataset.tool;
        this.active("tool", this.tool);
        this.status(b.title);
      })
    );
    this.root
      .querySelectorAll("[data-material]")
      .forEach(b =>
        this.on(b, "click", () => this.setMaterial(b.dataset.material))
      );
    this.root.querySelectorAll("[data-mold]").forEach(b =>
      this.on(b, "click", () => this.applyMold(b.dataset.mold))
    );
    this.on(this.root.querySelector("[data-sculpt]"), "change", e => {
      this.model.sculpt = e.target.checked;
      this.status(
        e.target.checked
          ? "保留捏痕已开启，形状不会自动复原。"
          : MATERIALS[this.model.material].tip
      );
    });
    this.on(this.root.querySelector("[data-radius]"), "input", e => {
      this.radius = Number(e.target.value);
    });
    this.on(this.root.querySelector("[data-reset]"), "click", () => {
      this.saveUndo();
      this.model.reset();
      this.clearBubbles();
      this.sprinkles.clear();
      this.paintMold();
      this.sync();
      this.status("已重新揉成当前模具形状。");
    });
    this.on(this.root.querySelector("[data-undo]"), "click", () => this.undo());
    this.on(this.root.querySelector("[data-view]"), "click", () => {
      this.yaw = 0;
      this.elevation = 0.95;
      this.distance = 4.5;
      this.updateCamera();
    });
    this.bindFullscreen();
  }
  applyMold(mold) {
    this.saveUndo();
    this.clearBubbles();
    this.sprinkles.clear();
    this.model.reset(mold);
    this.paintMold();
    this.sync();
    this.active("mold", this.model.mold);
    this.status("模具压好了！开启保留捏痕，开始雕塑。");
  }
  bindFullscreen() {
    const maxBtn = this.root.querySelector("[data-maximize]");
    if (!maxBtn) return;
    const toggleFsClass = on => {
      this.root.classList.toggle("slime-fs", on);
      if (!on) this.root.classList.remove("fs-gear");
      maxBtn.textContent = on ? "✕" : "⛶";
      maxBtn.title = on ? "退出全屏" : "全屏游玩";
      this.resize();
    };
    const gearBtn = this.root.querySelector("[data-gear]");
    if (gearBtn)
      this.on(gearBtn, "click", () =>
        this.root.classList.toggle("fs-gear")
      );
    // 全屏自定义下拉（trigger + menu + mask，同 usermgr product-dropdown 模式）
    let mask = this.root.querySelector(".fs-mask");
    if (!mask) {
      mask = document.createElement("button");
      mask.type = "button";
      mask.className = "fs-mask";
      mask.setAttribute("aria-label", "关闭菜单");
      this.root.appendChild(mask);
    }
    const closeMenus = () => {
      this.root
        .querySelectorAll(".fs-drop.open")
        .forEach(d => d.classList.remove("open"));
      mask.style.display = "none";
    };
    this.on(mask, "click", closeMenus);
    const dropdowns = [
      {
        key: "tool",
        options: [
          ["pump", "按压"],
          ["pinch", "捏起"],
          ["carve", "刻线"],
          ["tear", "撕裂"],
          ["fold", "翻折"],
          ["move", "挪动"],
          ["flatten", "压平"],
          ["smooth", "抹平"],
          ["bubble", "起泡"],
          ["pop", "戳泡"]
        ],
        apply: value => {
          this.tool = value;
          this.active("tool", this.tool);
          const btn = this.root.querySelector(`[data-tool="${this.tool}"]`);
          if (btn) this.status(btn.title);
        }
      },
      {
        key: "material",
        options: [
          ["butter", "黄油泥"],
          ["crystal", "水晶胶"],
          ["memory", "超慢回弹"],
          ["liquid", "流动胶"],
          ["foam", "起泡胶"],
          ["clay", "雕塑泥"]
        ],
        apply: value => this.setMaterial(value)
      },
      {
        key: "mold",
        options: [
          ["round", "◯ 原团"],
          ["star", "☆ 星星"],
          ["heart", "♡ 心形"],
          ["melody", "美乐蒂"]
        ],
        apply: value => this.applyMold(value)
      }
    ];
    dropdowns.forEach(({ key, options, apply }) => {
      const drop = this.root.querySelector(`[data-fs-drop="${key}"]`);
      if (!drop) return;
      drop.dataset.value = options[0][0];
      const trigger = drop.querySelector(".fs-trigger");
      const menu = drop.querySelector(".fs-menu");
      options.forEach(([value, label]) => {
        const item = document.createElement("button");
        item.type = "button";
        item.textContent = label;
        if (value === drop.dataset.value) item.classList.add("on");
        this.on(item, "click", e => {
          e.stopPropagation();
          closeMenus();
          if (drop.dataset.value === value) return;
          drop.dataset.value = value;
          menu
            .querySelectorAll(".on")
            .forEach(x => x.classList.remove("on"));
          item.classList.add("on");
          trigger.firstChild.textContent = label;
          apply(value);
        });
        menu.appendChild(item);
      });
      this.on(trigger, "click", e => {
        e.stopPropagation();
        const wasOpen = drop.classList.contains("open");
        closeMenus();
        if (!wasOpen) {
          drop.classList.add("open");
          mask.style.display = "block";
        }
      });
    });
    const colorInput = this.root.querySelector("[data-fs-color]");
    if (colorInput)
      this.on(colorInput, "input", () => {
        this.color.set(colorInput.value).convertSRGBToLinear();
        this.root
          .querySelectorAll(".color-btn")
          .forEach(x => x.classList.remove("active"));
        this.status("颜色会随揉捏混入表面。");
      });
    this.on(maxBtn, "click", () => {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(
          document
        );
      } else if (this.root.classList.contains("slime-fs")) {
        // iOS Safari 不支持元素全屏，用 CSS 假全屏兜底。
        toggleFsClass(false);
      } else {
        const request =
          this.root.requestFullscreen || this.root.webkitRequestFullscreen;
        if (request) {
          const result = request.call(this.root);
          if (result && result.catch)
            result.catch(() => toggleFsClass(true));
        } else toggleFsClass(true);
      }
    });
    const onChange = () =>
      toggleFsClass(
        !!(document.fullscreenElement || document.webkitFullscreenElement)
      );
    this.on(document, "fullscreenchange", onChange);
    this.on(document, "webkitfullscreenchange", onChange);
  }
  updateCamera() {
    this.camera.position.set(
      Math.sin(this.yaw) * Math.cos(this.elevation) * this.distance,
      Math.sin(this.elevation) * this.distance + 0.15,
      Math.cos(this.yaw) * Math.cos(this.elevation) * this.distance
    );
    this.camera.lookAt(0, 0.15, 0);
    this.camera.updateMatrixWorld();
  }
  beginPinch() {
    const [a, b] = [...this.pointers.values()];
    this.pinch = {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
      yaw: this.yaw,
      elevation: this.elevation,
      distance: this.distance
    };
    // 第二根手指落下意味着用户想调整视角，中断当前的塑形笔画。
    this.brush = null;
    this.sprinkling = null;
    if (this.manipulation) this.manipulation = null;
    this.rotating = false;
  }
  movePinch() {
    const [a, b] = [...this.pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const midX = (a.x + b.x) / 2,
      midY = (a.y + b.y) / 2;
    this.distance = THREE.MathUtils.clamp(
      this.pinch.distance * (this.pinch.dist / dist),
      3,
      7
    );
    this.yaw = this.pinch.yaw - (midX - this.pinch.midX) * 0.009;
    this.elevation = THREE.MathUtils.clamp(
      this.pinch.elevation + (midY - this.pinch.midY) * 0.007,
      0.12,
      1.55
    );
    this.updateCamera();
  }
  beginManipulation(hit, e) {
    const point = this.mesh.worldToLocal(hit.point.clone());
    const selected = connectedVertices(this.model.neighbors, hit.face.a);
    const center = new THREE.Vector3();
    selected.forEach(v => {
      center.x += this.model.positions[v * 3] / selected.length;
      center.y += this.model.positions[v * 3 + 1] / selected.length;
    });
    const direction = new THREE.Vector3(
      point.x - center.x,
      point.y - center.y,
      0
    );
    if (direction.length() < 0.2) direction.set(1, 0, 0);
    else direction.normalize();
    this.brush = null;
    this.manipulation = {
      point,
      selected,
      center,
      direction,
      source: this.model.positions.slice(),
      screenY: e.clientY
    };
  }
  dragManipulation(e) {
    const m = this.manipulation;
    this.hit(e);
    const ray = this.raycaster.ray
      .clone()
      .applyMatrix4(this.mesh.matrixWorld.clone().invert());
    const position = ray.intersectPlane(
      new THREE.Plane(new THREE.Vector3(0, 0, 1), -m.point.z),
      new THREE.Vector3()
    );
    if (!position) return;
    const delta = position.sub(m.point);
    delta.clampLength(0, 2.2);
    if (this.tool === "fold") {
      const angle = THREE.MathUtils.clamp(
        -delta.dot(m.direction) * 2.7 + (m.screenY - e.clientY) * 0.006,
        0,
        Math.PI * 0.94
      );
      this.model.positions.set(
        foldSurface(m.source, m.selected, m.center, m.direction, angle)
      );
      this.status("从外沿向中心拖动翻折，松手保留折叠形状。");
    } else if (this.tool === "move") {
      m.selected.forEach(v => {
        const i = v * 3;
        this.model.positions[i] = m.source[i] + delta.x;
        this.model.positions[i + 1] = m.source[i + 1] + delta.y;
      });
    } else if (this.tool === "tear") {
      if (!m.torn && delta.length() <= 0.35 && delta.length() > 0.01) {
        const direction = delta.clone().normalize();
        for (let i = 0; i < m.source.length; i += 3) {
          const side =
            Math.tanh(
              ((m.source[i] - m.point.x) * direction.x +
                (m.source[i + 1] - m.point.y) * direction.y) /
                0.16
            ) * 0.45;
          this.model.positions[i] = m.source[i] + delta.x * side;
          this.model.positions[i + 1] = m.source[i + 1] + delta.y * side;
        }
        this.status("正在拉伸，继续向外拖动撕开…");
      }
      if (!m.torn && delta.length() > 0.35) {
        if (this.model.positions.length > 24000) {
          this.status("碎块较多，请重新揉好再撕。");
          return;
        }
        m.direction.copy(delta).normalize();
        let result;
        try {
          result = tearSurface(
            m.source,
            this.model.indices,
            m.point,
            m.direction
          );
        } catch (error) {
          this.status(error.message);
          return;
        }
        if (!result) {
          this.status("这里太靠近边缘，请从稍靠内的位置撕开。");
          return;
        }
        const oldColors = this.colors,
          oldUV = this.geometry.attributes.uv.array;
        this.model.positions = result.positions;
        this.model.indices = result.indices;
        this.model.bake();
        this.model.reconnect();
        this.colors = new Float32Array(result.positions.length);
        const uv = new Float32Array(result.sourceMap.length * 2);
        result.sourceMap.forEach((old, i) => {
          this.colors.set(oldColors.slice(old * 3, old * 3 + 3), i * 3);
          uv.set(oldUV.slice(old * 2, old * 2 + 2), i * 2);
        });
        this.geometry.setAttribute(
          "color",
          new THREE.BufferAttribute(this.colors, 3).setUsage(
            THREE.DynamicDrawUsage
          )
        );
        this.geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
        this.sprinkles.remap(result.sourceMap);
        this.clearBubbles();
        m.source = result.positions.slice();
        m.sides = result.sides;
        m.torn = true;
      }
      if (m.torn) {
        const gap = Math.max(0.06, delta.dot(m.direction));
        m.sides.forEach((side, v) => {
          const i = v * 3;
          this.model.positions[i] =
            m.source[i] + m.direction.x * gap * side * 0.5;
          this.model.positions[i + 1] =
            m.source[i + 1] + m.direction.y * gap * side * 0.5;
        });
        this.status("已撕成独立碎块，继续拖动拉开；用「挪动」移动其中一块。");
      }
    }
    this.sync();
  }
  hit(e) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      (-(e.clientY - r.top) / r.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.ndc, this.camera);
    this.mesh.updateMatrixWorld(true);
    return this.raycaster.intersectObject(this.mesh, false)[0];
  }
  setBrush(hit) {
    if (this.tool === "carve") {
      if (!this.carveReference) {
        this.carveReference = new THREE.Mesh(
          this.geometry.clone(),
          this.material
        );
        this.carveReference.matrixAutoUpdate = false;
        this.carveReference.matrixWorld.copy(this.mesh.matrixWorld);
      }
      hit =
        this.raycaster.intersectObject(this.carveReference, false)[0] || hit;
    }
    const point = this.mesh.worldToLocal(hit.point.clone());
    const p = this.model.positions;
    const vertex = [hit.face.a, hit.face.b, hit.face.c].sort((a, b) => {
      const distance = i =>
        (p[i * 3] - point.x) ** 2 +
        (p[i * 3 + 1] - point.y) ** 2 +
        (p[i * 3 + 2] - point.z) ** 2;
      return distance(a) - distance(b);
    })[0];
    if (this.tool === "carve") {
      const normal = hit.face.normal.clone().normalize();
      const from = this.carvePoint || point;
      const steps = Math.min(
        50,
        Math.max(1, Math.ceil(from.distanceTo(point) / 0.025))
      );
      for (let j = 1; j <= steps; j++)
        this.model.carve(
          from.clone().lerp(point, j / steps),
          normal,
          Math.max(0.09, this.radius * 0.45)
        );
      this.carvePoint = point;
      this.brush = null;
      this.sync();
      return;
    }
    this.brush = {
      point,
      vertex,
      normal: hit.face.normal.clone().normalize(),
      radius:
        this.radius *
        (this.tool === "carve" ? 0.38 : this.tool === "flatten" ? 2.2 : 1),
      tool: this.tool,
      strength: this.pressure
    };
  }
  sync() {
    if (this.geometry.attributes.position.array !== this.model.positions) {
      this.geometry.deleteAttribute("normal");
      this.geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(this.model.positions, 3).setUsage(
          THREE.DynamicDrawUsage
        )
      );
      this.geometry.setIndex(this.model.indices);
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
    this.geometry.attributes.color.needsUpdate = true;
  }
  paintMold() {
    if (this.colors.length !== this.model.positions.length) {
      this.colors = new Float32Array(this.model.positions.length);
      this.geometry.setAttribute(
        "color",
        new THREE.BufferAttribute(this.colors, 3).setUsage(
          THREE.DynamicDrawUsage
        )
      );
    }
    const p = this.model.base,
      melody = this.model.mold === "melody";
    if (this.faceTexture) this.faceTexture.dispose();
    this.faceTexture = null;
    const uv = new Float32Array((p.length / 3) * 2);
    if (melody) {
      const image = document.createElement("canvas");
      image.width = image.height = 512;
      const ctx = image.getContext("2d");
      ctx.fillStyle = this.color
        .clone()
        .convertLinearToSRGB()
        .getStyle();
      ctx.fillRect(0, 0, 512, 512);
      const ellipse = (x, y, rx, ry, color) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(
          (0.5 + x / 3.2) * 512,
          (0.5 - y / 3.2) * 512,
          (rx / 3.2) * 512,
          (ry / 3.2) * 512,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
      };
      ellipse(0, -0.18, 0.68, 0.48, "#fff7ea");
      ellipse(-0.27, -0.16, 0.047, 0.062, "#352532");
      ellipse(0.27, -0.16, 0.047, 0.062, "#352532");
      ellipse(0, -0.27, 0.07, 0.043, "#edbc55");
      this.faceTexture = new THREE.CanvasTexture(image);
      this.faceTexture.encoding = THREE.sRGBEncoding;
    }
    for (let i = 0; i < p.length; i += 3) {
      uv[(i / 3) * 2] = p[i + 2] > 0 ? 0.5 + p[i] / 3.2 : 0.02;
      uv[(i / 3) * 2 + 1] = p[i + 2] > 0 ? 0.5 + p[i + 1] / 3.2 : 0.02;
      this.colors[i] = melody ? 1 : this.color.r;
      this.colors[i + 1] = melody ? 1 : this.color.g;
      this.colors[i + 2] = melody ? 1 : this.color.b;
    }
    this.geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    this.material.map = this.faceTexture;
    this.material.needsUpdate = true;
  }
  mixColor(dt) {
    const p = this.model.positions,
      b = this.brush;
    for (let i = 0; i < p.length; i += 3) {
      const d =
          (p[i] - b.point.x) ** 2 +
          (p[i + 1] - b.point.y) ** 2 +
          (p[i + 2] - b.point.z) ** 2,
        a = Math.exp(-d / (b.radius ** 2 * 0.5)) * dt * 0.7;
      this.colors[i] += (this.color.r - this.colors[i]) * a;
      this.colors[i + 1] += (this.color.g - this.colors[i + 1]) * a;
      this.colors[i + 2] += (this.color.b - this.colors[i + 2]) * a;
    }
  }
  setMaterial(name) {
    this.model.material = name;
    const m = MATERIALS[name];
    Object.assign(this.material, {
      roughness: m.roughness,
      transmission: m.transmission,
      thickness: 0.65,
      ior: 1.38,
      clearcoat: m.transmission > 0.3 ? 1 : 0.12,
      clearcoatRoughness: 0.15,
      needsUpdate: true
    });
    this.active("material", name);
    this.status(m.tip);
  }
  addBubble() {
    if (this.bubbles.length >= 24) {
      this.status("气泡满了，用戳泡工具戳掉一些。");
      return;
    }
    const nearest = this.brush.vertex;
    const radius = 0.09 + Math.min(0.1, this.held * 0.025);
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 20, 12),
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.08,
        transmission: 0.94,
        thickness: 0.025,
        ior: 1.12
      })
    );
    this.mesh.add(sphere);
    this.bubbles.push({ mesh: sphere, vertex: nearest, radius, age: 0 });
    this.status("捏出一个气泡！切换戳泡工具试试。");
  }
  pop(e) {
    this.hit(e);
    const hit = this.raycaster.intersectObjects(
      this.bubbles.map(b => b.mesh),
      false
    )[0];
    if (!hit) return;
    const body = this.raycaster.intersectObject(this.mesh, false)[0];
    if (body && body.distance < hit.distance) return;
    const s = hit.object;
    this.mesh.remove(s);
    s.geometry.dispose();
    s.material.dispose();
    this.bubbles = this.bubbles.filter(b => b.mesh !== s);
    this.status("啪！气泡戳破了。");
  }
  clearBubbles() {
    this.bubbles.forEach(b => {
      this.mesh.remove(b.mesh);
      b.mesh.geometry.dispose();
      b.mesh.material.dispose();
    });
    this.bubbles = [];
  }
  saveUndo() {
    this.undoStack.push({
      mold: this.model.mold,
      spread: this.model.spread,
      positions: this.model.positions.slice(),
      rest: this.model.rest.slice(),
      colors: this.colors.slice(),
      faceImage: this.faceTexture ? this.faceTexture.image : null,
      base: this.model.base.slice(),
      freeform: this.model.freeform,
      indices: this.model.indices.slice(),
      sprinkles: this.sprinkles.snapshot(),
      uv: this.geometry.attributes.uv.array.slice()
    });
    if (this.undoStack.length > 15) this.undoStack.shift();
    this.root.querySelector("[data-undo]").disabled = false;
  }
  undo() {
    const s = this.undoStack.pop();
    if (!s) return;
    this.model.reset(s.mold);
    this.model.positions = s.positions.slice();
    this.model.base = s.base.slice();
    this.model.indices = s.indices.slice();
    this.model.rest = s.rest.slice();
    this.model.velocity = new Float32Array(s.positions.length);
    this.model.reconnect();
    this.paintMold();
    this.model.spread = s.spread;
    this.model.freeform = s.freeform;
    if (s.faceImage) {
      if (this.faceTexture) this.faceTexture.dispose();
      this.faceTexture = new THREE.CanvasTexture(s.faceImage);
      this.faceTexture.encoding = THREE.sRGBEncoding;
      this.material.map = this.faceTexture;
      this.material.needsUpdate = true;
    }
    this.model.positions.set(s.positions);
    this.model.rest.set(s.rest);
    this.colors.set(s.colors);
    this.geometry.setAttribute("uv", new THREE.BufferAttribute(s.uv, 2));
    this.sprinkles.restore(s.sprinkles);
    this.clearBubbles();
    this.sync();
    this.active("mold", s.mold);
    this.root.querySelector("[data-undo]").disabled = !this.undoStack.length;
    this.status("已撤销上一步塑形，气泡已清空。");
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.carveReference) this.carveReference.geometry.dispose();
    cancelAnimationFrame(this.raf);
    this.listeners.forEach(remove => remove());
    this.clearBubbles();
    this.scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    this.shadowTexture.dispose();
    this.floorTexture.dispose();
    if (this.faceTexture) this.faceTexture.dispose();
    this.environment.dispose();
    this.renderer.dispose();
  }
}
