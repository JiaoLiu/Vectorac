import * as THREE from "three";
import SlimeModel, { MATERIALS } from "./slime-model";
import {
  tearSurface,
  foldSurface,
  connectedVertices,
  bubbleRadius
} from "./slime-sculpt";
import {
  meshParts,
  partsOverlap,
  fuseSurface,
  surfacePartCount,
  largestPart
} from "./slime-fusion";
import SlimeSprinkles from "./SlimeSprinkles";
import FoldWorker from "./slime-rebuild.worker";
import { validSurface } from "./slime-safety";
import { meshVolume, preserveVolume } from "./slime-volume";

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
      new THREE.PlaneGeometry(7, 7),
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
    this.contactShadow = shadow;
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
        if (!this.manipulation && !this.fusion && !this.rebuilding)
          this.model.step(1 / 120, this.brush);
        this.acc -= 1 / 120;
      }
      if (this.brush && this.tool !== "smooth") this.mixColor(dt);
      if (this.fusion) this.advanceFusion(dt);
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
        if (b === this.growingBubble)
          b.radius = bubbleRadius(this.held, this.model.material, b.seed);
        const i = b.vertex * 3,
          p = this.model.positions;
        b.mesh.position.set(p[i], p[i + 1], p[i + 2]);
        const normal = this.geometry.attributes.normal;
        b.mesh.position.x += normal.getX(b.vertex) * b.radius * 0.35;
        b.mesh.position.y += normal.getY(b.vertex) * b.radius * 0.35;
        b.mesh.position.z += normal.getZ(b.vertex) * b.radius * 0.35;
        b.mesh.scale.setScalar(b.radius * Math.min(1, b.age * 6));
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
    const drop = this.root.querySelector(`[data-fs-drop="${attr}"]`);
    if (drop) {
      const item = drop.querySelector(`[data-option="${value}"]`);
      if (item) {
        drop.dataset.value = value;
        drop.querySelector(".fs-trigger").firstChild.textContent =
          item.textContent;
        drop
          .querySelectorAll("[data-option]")
          .forEach(b => b.classList.toggle("on", b === item));
      }
    }
  }
  bind() {
    const c = this.canvas;
    this.on(c, "contextmenu", e => e.preventDefault());
    this.on(c, "pointerdown", e => {
      if (this.fusion) this.completeFusion();
      // Picking must not perform mesh unions. Fusion starts after release only.
      clearTimeout(this.fusionTimer);
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
      if (!this.rotating && this.rebuilding) {
        // The baked fold is being retessellated in a worker; clay tools wait.
        this.status("正在整理折叠表面，请稍候…");
        return;
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
        } else {
          this.setBrush(hit);
          if (
            this.brush &&
            (this.tool === "bubble" ||
              (this.model.material === "foam" &&
                ["pump", "pinch"].includes(this.tool)))
          )
            this.addBubble();
        }
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
      this.growingBubble = null;
      this.pointer = undefined;
      this.brush = null;
      this.carvePoint = null;
      if (this.carveReference) this.carveReference.geometry.dispose();
      this.carveReference = null;
      this.sprinkling = null;
      if (this.manipulation) {
        this.finishManipulation();
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
    this.root
      .querySelectorAll("[data-mold]")
      .forEach(b => this.on(b, "click", () => this.applyMold(b.dataset.mold)));
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
      this.cancelFoldRebuild();
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
      this.geometry.computeBoundingSphere();
      const sphere = this.geometry.boundingSphere;
      this.distance = Math.max(
        4.5,
        (sphere.radius + sphere.center.length()) * 2.6
      );
      this.updateCamera();
    });
    this.root
      .querySelectorAll("[data-add-clay]")
      .forEach(button => this.on(button, "click", () => this.addClay()));
    this.bindFullscreen();
  }
  applyMold(mold) {
    this.saveUndo();
    this.cancelFoldRebuild();
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
      this.on(gearBtn, "click", () => this.root.classList.toggle("fs-gear"));
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
        item.dataset.option = value;
        item.type = "button";
        item.textContent = label;
        if (value === drop.dataset.value) item.classList.add("on");
        this.on(item, "click", e => {
          e.stopPropagation();
          closeMenus();
          if (drop.dataset.value === value) return;
          drop.dataset.value = value;
          menu.querySelectorAll(".on").forEach(x => x.classList.remove("on"));
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
          if (result && result.catch) result.catch(() => toggleFsClass(true));
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
    this.growingBubble = null;
    if (this.manipulation) this.finishManipulation();
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
    this.model.settling = null;
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
      massBody: this.model.massBodies.find(body =>
        body.vertices.includes(hit.face.a)
      ),
      screenY: e.clientY
    };
  }
  finishManipulation() {
    const m = this.manipulation,
      tool = this.tool;
    if (tool === "fold" && m.lastValid && this.startFoldRebuild(m)) {
      // Async rebuild: the fold is already baked and held; settling starts
      // when the worker's surface lands.
      this.manipulation = null;
    } else {
      if (tool === "fold" && m.lastValid) this.rebuildFold(m);
      this.model.bake();
      this.manipulation = null;
      if (tool === "fold") this.model.startSettling(m.selected);
    }
    if (tool !== "tear") {
      clearTimeout(this.fusionTimer);
      this.fusionTimer = setTimeout(() => {
        if (!this.destroyed && this.pointer === undefined) this.tryFuse();
      }, 30);
    }
  }
  rebuildFold(m) {
    // Retessellate only the folded body; keep all other clay exactly unchanged.
    this.bakePaint();
    const old = this.model.positions,
      selected = m.selected,
      map = new Map(selected.map((v, i) => [v, i]));
    const input = new Float32Array(selected.length * 3),
      color = new Float32Array(input.length);
    selected.forEach((v, i) => {
      input.set(old.slice(v * 3, v * 3 + 3), i * 3);
      color.set(this.colors.slice(v * 3, v * 3 + 3), i * 3);
    });
    const indices = m.massBody.indices.map(v => map.get(v));
    let rebuilt;
    try {
      rebuilt = fuseSurface(input, indices, color);
    } catch (error) {
      this.model.positions.set(m.source);
      return;
    }
    // Voxel retessellation sheds thin flakes near the fold's contact seam.
    // Commit the dominant component; only a genuinely fragmented result (no
    // part holding most faces) rolls the whole gesture back.
    rebuilt = largestPart(rebuilt.positions, rebuilt.indices, rebuilt.colors);
    const vertices = Array.from(
      { length: rebuilt.positions.length / 3 },
      (_, i) => i
    );
    if (
      rebuilt.kept < 0.85 ||
      !preserveVolume(
        rebuilt.positions,
        rebuilt.indices,
        vertices,
        m.massBody.volume
      ) ||
      !validSurface(rebuilt.positions, rebuilt.indices)
    ) {
      this.model.positions.set(m.source);
      return;
    }
    m.selected = this.commitFoldSurface(selected, rebuilt);
  }
  // Swap the folded body's surface for the retessellated one, remapping
  // sprinkles and bubbles. Returns the folded body's new vertex indices.
  commitFoldSurface(selected, rebuilt) {
    const old = this.model.positions,
      map = new Map(selected.map((v, i) => [v, i]));
    const preserved = Array.from(
        { length: old.length / 3 },
        (_, i) => i
      ).filter(v => !map.has(v)),
      oldToNew = new Map(preserved.map((v, i) => [v, i]));
    const positions = new Float32Array(
        preserved.length * 3 + rebuilt.positions.length
      ),
      colors = new Float32Array(positions.length),
      faces = [];
    preserved.forEach((v, i) => {
      positions.set(old.slice(v * 3, v * 3 + 3), i * 3);
      colors.set(this.colors.slice(v * 3, v * 3 + 3), i * 3);
    });
    for (let i = 0; i < this.model.indices.length; i += 3)
      if (oldToNew.has(this.model.indices[i]))
        faces.push(
          ...this.model.indices.slice(i, i + 3).map(v => oldToNew.get(v))
        );
    positions.set(rebuilt.positions, preserved.length * 3);
    colors.set(rebuilt.colors, preserved.length * 3);
    faces.push(...rebuilt.indices.map(v => v + preserved.length));
    const nearest = v => {
      if (oldToNew.has(v)) return oldToNew.get(v);
      let best = 0,
        distance = Infinity;
      for (let j = 0; j < rebuilt.positions.length; j += 3) {
        const d =
          (old[v * 3] - rebuilt.positions[j]) ** 2 +
          (old[v * 3 + 1] - rebuilt.positions[j + 1]) ** 2 +
          (old[v * 3 + 2] - rebuilt.positions[j + 2]) ** 2;
        if (d < distance) {
          distance = d;
          best = j / 3;
        }
      }
      return best + preserved.length;
    };
    this.sprinkles.items.forEach(item => {
      item.vertex = nearest(item.vertex);
    });
    this.bubbles.forEach(item => {
      item.vertex = nearest(item.vertex);
    });
    this.installSurface({ positions, colors, indices: faces, preserved });
    return Array.from(
      { length: rebuilt.positions.length / 3 },
      (_, i) => i + preserved.length
    );
  }
  // Retessellate in a worker so release never freezes the page. The previewed
  // fold is baked at once and physics pauses until the result lands.
  startFoldRebuild(m) {
    if (this.rebuilding || this.fusion) return false;
    if (!this.foldWorker) {
      let worker;
      try {
        worker = new FoldWorker();
      } catch (error) {
        // No worker support (tests/SSR): the caller uses the sync path.
        return false;
      }
      worker.onmessage = e => {
        if (this.foldWorker === worker) this.finishFoldRebuild(e.data);
      };
      worker.onerror = () => {
        if (this.foldWorker !== worker) return;
        // A broken worker must not wedge the studio: settle the baked fold.
        const pending = this.rebuilding;
        this.cancelFoldRebuild();
        if (pending && !this.destroyed) {
          this.model.startSettling(pending.selected);
          this.status("折叠已保留，直接缓慢摊落。");
          this.queueFusionAfterRebuild();
        }
      };
      this.foldWorker = worker;
    }
    this.bakePaint();
    const old = this.model.positions,
      selected = m.selected,
      map = new Map(selected.map((v, i) => [v, i]));
    const input = new Float32Array(selected.length * 3),
      color = new Float32Array(input.length);
    selected.forEach((v, i) => {
      input.set(old.slice(v * 3, v * 3 + 3), i * 3);
      color.set(this.colors.slice(v * 3, v * 3 + 3), i * 3);
    });
    this.model.bake();
    const jobId = (this.rebuildSequence = (this.rebuildSequence || 0) + 1);
    const pending = (this.rebuilding = { selected, jobId });
    try {
      this.foldWorker.postMessage({
        jobId,
        positions: input,
        indices: m.massBody.indices.map(v => map.get(v)),
        colors: color,
        volume: m.massBody.volume
      });
    } catch (error) {
      this.cancelFoldRebuild();
      return false;
    }
    this.status("正在整理折叠表面…");
    // Safety net: if the worker never responds (load failure, internal error),
    // release the lock after 3s so the studio stays usable.
    clearTimeout(this.rebuildTimeout);
    this.rebuildTimeout = setTimeout(() => {
      if (this.rebuilding === pending) {
        console.warn(
          "[SlimeStudio] Worker timeout, falling back to sync settle"
        );
        this.cancelFoldRebuild();
        if (!this.destroyed) {
          this.model.startSettling(pending.selected);
          this.status("折叠已保留，直接缓慢摊落。");
          this.queueFusionAfterRebuild();
        }
      }
    }, 3000);
    return true;
  }
  finishFoldRebuild(result) {
    const pending = this.rebuilding;
    // Validate BEFORE clearing the new job's timeout or touching its mesh.
    if (!pending || !result || result.jobId !== pending.jobId) return;
    clearTimeout(this.rebuildTimeout);
    this.rebuilding = null;
    if (this.destroyed) return;
    if (!result.ok) {
      // Retessellation rejected the fold; the already-baked fold stays as is.
      this.model.startSettling(pending.selected);
      this.status("折叠已保留，直接缓慢摊落。");
      this.queueFusionAfterRebuild();
      return;
    }
    this.model.startSettling(this.commitFoldSurface(pending.selected, result));
    this.queueFusionAfterRebuild();
  }
  cancelFoldRebuild() {
    clearTimeout(this.rebuildTimeout);
    this.rebuilding = null;
    if (this.foldWorker) {
      this.foldWorker.terminate();
      this.foldWorker = null;
    }
  }
  queueFusionAfterRebuild() {
    clearTimeout(this.fusionTimer);
    this.fusionTimer = setTimeout(() => {
      if (!this.destroyed && this.pointer === undefined && !this.manipulation)
        this.tryFuse();
    }, 30);
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
      // The live preview only bends vertices (O(n)). Triangle intersections,
      // volume correction and retessellation belong to release, not pointermove.
      // In particular, temporarily overlapping layers are expected during a fold.
      m.lastValid = this.model.positions.slice();
      this.status("从外沿向中心拖动翻折，松手后整理折叠表面。");
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
    this.model.constrainToTable();
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
    // A painted dark disk looked like grey matter inside transmissive clay.
    this.contactShadow.visible = m.transmission < 0.4;
    Object.assign(this.material, {
      roughness: m.roughness,
      transmission: m.transmission,
      thickness: m.transmission > 0.4 ? 0.18 : 0.65,
      side: THREE.FrontSide,
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
    const seed = 0.75 + Math.random() * 0.5;
    const radius = bubbleRadius(this.held, this.model.material, seed);
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.08,
        transmission: 0.94,
        thickness: 0.025,
        ior: 1.12
      })
    );
    this.mesh.add(sphere);
    const bubble = { mesh: sphere, vertex: nearest, radius, age: 0, seed };
    this.bubbles.push(bubble);
    this.growingBubble = bubble;
    this.status("按住让气泡长大，松手定型；短按小泡，长按大泡。 ");
  }
  bakePaint() {
    if (!this.faceTexture) return;
    const image = this.faceTexture.image,
      data = image
        .getContext("2d")
        .getImageData(0, 0, image.width, image.height).data;
    const uv = this.geometry.attributes.uv.array,
      color = new THREE.Color();
    for (let v = 0; v < this.colors.length / 3; v++) {
      const x = Math.max(
          0,
          Math.min(image.width - 1, Math.floor(uv[v * 2] * image.width))
        ),
        y = Math.max(
          0,
          Math.min(
            image.height - 1,
            Math.floor((1 - uv[v * 2 + 1]) * image.height)
          )
        ),
        i = (y * image.width + x) * 4;
      color
        .setRGB(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255)
        .convertSRGBToLinear();
      this.colors[v * 3] *= color.r;
      this.colors[v * 3 + 1] *= color.g;
      this.colors[v * 3 + 2] *= color.b;
    }
    this.faceTexture.dispose();
    this.faceTexture = null;
    this.material.map = null;
    this.material.needsUpdate = true;
  }
  installSurface(result) {
    const previous = {
      base: this.model.base,
      rest: this.model.rest,
      velocity: this.model.velocity
    };
    this.model.settling = null;
    this.model.positions = result.positions;
    this.model.indices = result.indices;
    this.model.bake();
    this.model.reconnect();
    if (result.preserved)
      result.preserved.forEach((old, v) => {
        for (let c = 0; c < 3; c++) {
          this.model.base[v * 3 + c] = previous.base[old * 3 + c];
          this.model.rest[v * 3 + c] = previous.rest[old * 3 + c];
          this.model.velocity[v * 3 + c] = previous.velocity[old * 3 + c];
        }
      });
    this.colors = result.colors;
    this.geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage)
    );
    this.geometry.setAttribute(
      "uv",
      new THREE.BufferAttribute(
        result.uv || new Float32Array((this.colors.length / 3) * 2),
        2
      )
    );
    this.sync();
  }
  addClay() {
    if (this.rebuilding) {
      this.status("正在整理折叠表面，请稍候…");
      return;
    }
    if (this.fusion) this.completeFusion();
    const parts = meshParts(this.model);
    if (parts.length >= 8) {
      this.status("桌上已有八块泥，先挪近融合，再继续添加。");
      return;
    }
    const sites = [
      [1.85, 0],
      [-1.85, 0],
      [0, 1.85],
      [0, -1.85],
      [1.85, 1.85],
      [-1.85, 1.85],
      [1.85, -1.85],
      [-1.85, -1.85]
    ];
    const site = sites.find(([x, y]) =>
      parts.every(
        p =>
          x + 0.7 < p.min[0] ||
          x - 0.7 > p.max[0] ||
          y + 0.7 < p.min[1] ||
          y - 0.7 > p.max[1]
      )
    );
    if (!site) {
      this.status("周围空间不足，先把已有泥团挪近融合。");
      return;
    }
    this.saveUndo();
    const blob = new SlimeModel("round", 40, 24),
      old = this.model.positions,
      offset = old.length / 3;
    const positions = new Float32Array(old.length + blob.positions.length),
      colors = new Float32Array(positions.length);
    positions.set(old);
    colors.set(this.colors);
    for (let i = 0; i < blob.positions.length; i += 3) {
      positions[old.length + i] = blob.positions[i] * 0.6 + site[0];
      positions[old.length + i + 1] = blob.positions[i + 1] * 0.6 + site[1];
      positions[old.length + i + 2] =
        (blob.positions[i + 2] + 0.25) * 0.75 - 0.25;
      colors[old.length + i] = this.color.r;
      colors[old.length + i + 1] = this.color.g;
      colors[old.length + i + 2] = this.color.b;
    }
    // Append only: changing the topology must not bake/zero the existing clay's
    // velocity, plastic offsets, UVs or recovery state.
    const oldBodies = this.model.massBodies;
    const base = new Float32Array(positions),
      rest = new Float32Array(positions.length),
      velocity = new Float32Array(positions.length);
    base.set(this.model.base);
    rest.set(this.model.rest);
    velocity.set(this.model.velocity);
    const uv = new Float32Array((positions.length / 3) * 2).fill(0.995);
    uv.set(this.geometry.attributes.uv.array);
    this.model.positions = positions;
    this.model.base = base;
    this.model.rest = rest;
    this.model.velocity = velocity;
    this.model.indices = this.model.indices.concat(
      blob.indices.map(v => v + offset)
    );
    this.model.reconnect();
    oldBodies.forEach((body, i) => {
      this.model.massBodies[i].volume = body.volume;
    });
    this.colors = colors;
    this.geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage)
    );
    this.geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    // Reserve an unused white texel for new clay, keeping the existing painted
    // character texture completely intact instead of converting it to vertices.
    if (this.faceTexture) {
      const previous = this.faceTexture.image,
        image = document.createElement("canvas");
      image.width = previous.width;
      image.height = previous.height;
      const ctx = image.getContext("2d");
      ctx.drawImage(previous, 0, 0);
      ctx.fillStyle = "#fff";
      ctx.fillRect(image.width - 6, 0, 6, 6);
      this.faceTexture.dispose();
      this.faceTexture = new THREE.CanvasTexture(image);
      this.faceTexture.encoding = THREE.sRGBEncoding;
      this.material.map = this.faceTexture;
      this.material.needsUpdate = true;
    }
    this.sync();
    this.distance = Math.max(this.distance, 6.5);
    this.updateCamera();
    this.tool = "move";
    this.active("tool", "move");
    this.status("新泥已按当前颜色加入。拖到另一块上，松手后自动融合。");
  }
  tryFuse(overlapOnly = false) {
    if (this.rebuilding || this.fusion) return false;
    const parts = meshParts(this.model),
      old = this.model.positions;
    let pair = null,
      contact = null,
      best = Infinity;
    for (let a = 0; a < parts.length; a++)
      for (let b = a + 1; b < parts.length; b++) {
        if (
          ![0, 1, 2].every(
            c =>
              parts[a].min[c] <= parts[b].max[c] + 0.14 &&
              parts[b].min[c] <= parts[a].max[c] + 0.14
          )
        )
          continue;
        for (const va of parts[a].vertices)
          for (const vb of parts[b].vertices) {
            const d =
              (old[va * 3] - old[vb * 3]) ** 2 +
              (old[va * 3 + 1] - old[vb * 3 + 1]) ** 2 +
              (old[va * 3 + 2] - old[vb * 3 + 2]) ** 2;
            const score = d - 0.001 * (old[va * 3 + 2] + old[vb * 3 + 2]);
            if (score < best) {
              best = score;
              pair = [parts[a], parts[b]];
              contact = [va, vb];
            }
          }
      }
    if (!pair) return false;
    const overlapping = partsOverlap(old, this.model.indices, pair[0], pair[1]);
    if (overlapOnly && !overlapping) return false;
    if (best > 0.14 ** 2 && !overlapping) return false;
    this.bakePaint();
    const selected = pair.flatMap(p => p.vertices),
      map = new Map(selected.map((v, i) => [v, i]));
    const source = new Float32Array(selected.length * 3),
      sourceColors = new Float32Array(source.length),
      sourceIndices = [];
    selected.forEach((v, i) => {
      source.set(old.slice(v * 3, v * 3 + 3), i * 3);
      sourceColors.set(this.colors.slice(v * 3, v * 3 + 3), i * 3);
    });
    for (let i = 0; i < this.model.indices.length; i += 3)
      if (map.has(this.model.indices[i]))
        sourceIndices.push(
          ...this.model.indices.slice(i, i + 3).map(v => map.get(v))
        );
    const targetMass = this.model.massBodies
      .filter(b => map.has(b.vertices[0]))
      .reduce((sum, b) => sum + b.volume, 0);
    const a = new THREE.Vector3().fromArray(old, contact[0] * 3),
      b = new THREE.Vector3().fromArray(old, contact[1] * 3),
      mid = a
        .clone()
        .add(b)
        .multiplyScalar(0.5);
    const direction = b.clone().sub(a);
    if (direction.length() < 0.001) direction.set(1, 0, 0);
    direction.normalize();
    const tint = new THREE.Color()
      .fromArray(this.colors, contact[0] * 3)
      .lerp(new THREE.Color().fromArray(this.colors, contact[1] * 3), 0.5);
    const neck = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 12),
      new THREE.MeshPhysicalMaterial({
        color: tint,
        roughness: this.material.roughness,
        transmission: this.material.transmission,
        thickness: 0.2
      })
    );
    neck.position.copy(mid);
    neck.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction);
    neck.scale.set(a.distanceTo(b) * 0.5 + 0.14, 0.14, 0.14);
    neck.updateMatrix();
    const fullScale = neck.scale.clone(),
      extra = neck.geometry.attributes.position,
      sourceWithNeck = new Float32Array(source.length + extra.count * 3),
      colorsWithNeck = new Float32Array(sourceWithNeck.length);
    sourceWithNeck.set(source);
    colorsWithNeck.set(sourceColors);
    for (let i = 0; i < extra.count; i++) {
      const point = new THREE.Vector3()
        .fromBufferAttribute(extra, i)
        .applyMatrix4(neck.matrix);
      sourceWithNeck.set(point.toArray(), source.length + i * 3);
      colorsWithNeck.set(tint.toArray(), source.length + i * 3);
    }
    let merged;
    try {
      merged = fuseSurface(
        overlapping ? source : sourceWithNeck,
        overlapping
          ? sourceIndices
          : sourceIndices.concat(
              Array.from(neck.geometry.index.array, v => v + selected.length)
            ),
        overlapping ? sourceColors : colorsWithNeck
      );
    } catch (error) {
      neck.geometry.dispose();
      neck.material.dispose();
      console.error(error);
      return false;
    }
    if (surfacePartCount(merged.indices, merged.positions.length / 3) !== 1) {
      neck.geometry.dispose();
      neck.material.dispose();
      return false;
    }
    // Smooth voxel stair-steps, then restore the original sum of clay volumes.
    const adjacent = Array.from(
      { length: merged.positions.length / 3 },
      () => new Set()
    );
    for (let i = 0; i < merged.indices.length; i += 3) {
      const [a, b, c] = merged.indices.slice(i, i + 3);
      adjacent[a].add(b).add(c);
      adjacent[b].add(a).add(c);
      adjacent[c].add(a).add(b);
    }
    for (const strength of Array.from({ length: 32 }, (_, i) =>
      i % 2 ? -0.51 : 0.5
    )) {
      const next = merged.positions.slice();
      adjacent.forEach((neighbors, v) => {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          neighbors.forEach(n => {
            sum += merged.positions[n * 3 + c];
          });
          next[v * 3 + c] +=
            (sum / neighbors.size - merged.positions[v * 3 + c]) * strength;
        }
      });
      merged.positions = next;
    }
    preserveVolume(
      merged.positions,
      merged.indices,
      Array.from({ length: merged.positions.length / 3 }, (_, i) => i),
      targetMass
    );
    const preserved = Array.from(
        { length: old.length / 3 },
        (_, i) => i
      ).filter(i => !map.has(i)),
      oldToNew = new Map(preserved.map((v, i) => [v, i]));
    const positions = new Float32Array(
        preserved.length * 3 + merged.positions.length
      ),
      colors = new Float32Array(positions.length),
      indices = [];
    preserved.forEach((v, i) => {
      positions.set(old.slice(v * 3, v * 3 + 3), i * 3);
      colors.set(this.colors.slice(v * 3, v * 3 + 3), i * 3);
    });
    for (let i = 0; i < this.model.indices.length; i += 3)
      if (oldToNew.has(this.model.indices[i]))
        indices.push(
          ...this.model.indices.slice(i, i + 3).map(v => oldToNew.get(v))
        );
    positions.set(merged.positions, preserved.length * 3);
    colors.set(merged.colors, preserved.length * 3);
    indices.push(...merged.indices.map(v => v + preserved.length));
    const goal = old.slice();
    selected.forEach(v => {
      const distances = [];
      for (let j = 0; j < merged.positions.length; j += 3) {
        const d =
          (old[v * 3] - merged.positions[j]) ** 2 +
          (old[v * 3 + 1] - merged.positions[j + 1]) ** 2 +
          (old[v * 3 + 2] - merged.positions[j + 2]) ** 2;
        if (distances.length < 3 || d < distances[2][0]) {
          distances.push([d, j]);
          distances.sort((a, b) => a[0] - b[0]);
          if (distances.length > 3) distances.pop();
        }
      }
      distances.sort((a, b) => a[0] - b[0]);
      let weight = 0,
        target = [0, 0, 0];
      distances.slice(0, 3).forEach(([d, j]) => {
        const w = 1 / (d + 0.0001);
        weight += w;
        for (let c = 0; c < 3; c++) target[c] += merged.positions[j + c] * w;
      });
      for (let c = 0; c < 3; c++)
        goal[v * 3 + c] =
          old[v * 3 + c] +
          THREE.MathUtils.clamp(
            target[c] / weight - old[v * 3 + c],
            -0.25,
            0.25
          );
    });
    const durations = {
      liquid: 0.65,
      crystal: 1,
      butter: 1.6,
      memory: 2.7,
      foam: 1.5,
      clay: 2.5
    };
    this.fusion = {
      source: old.slice(),
      goal,
      selected,
      age: 0,
      duration: durations[this.model.material],
      neck,
      fullScale,
      result: { positions, colors, indices, preserved },
      oldToNew
    };
    neck.scale.copy(fullScale).multiplyScalar(0.05);
    this.mesh.add(neck);
    this.status("边缘正在吸附，接触处慢慢连在一起…");
    return true;
  }
  advanceFusion(dt) {
    const f = this.fusion;
    f.age += dt;
    const t = Math.min(1, f.age / f.duration),
      ease = t * t * (3 - 2 * t);
    f.neck.scale
      .copy(f.fullScale)
      .multiplyScalar(0.05 + 0.95 * Math.min(1, t * 2.5));
    f.selected.forEach(v => {
      for (let c = 0; c < 3; c++)
        this.model.positions[v * 3 + c] =
          f.source[v * 3 + c] +
          (f.goal[v * 3 + c] - f.source[v * 3 + c]) * ease;
    });
    for (const body of this.model.massBodies)
      preserveVolume(
        this.model.positions,
        body.indices,
        body.vertices,
        body.volume
      );
    if (t >= 1) this.completeFusion();
  }
  completeFusion() {
    const f = this.fusion;
    if (!f) return;
    this.fusion = null;
    const old = this.model.positions;
    const nearest = v => {
      if (f.oldToNew.has(v)) return f.oldToNew.get(v);
      let best = 0,
        distance = Infinity;
      for (
        let j = f.result.preserved.length * 3;
        j < f.result.positions.length;
        j += 3
      ) {
        const d =
          (old[v * 3] - f.result.positions[j]) ** 2 +
          (old[v * 3 + 1] - f.result.positions[j + 1]) ** 2 +
          (old[v * 3 + 2] - f.result.positions[j + 2]) ** 2;
        if (d < distance) {
          distance = d;
          best = j / 3;
        }
      }
      return best;
    };
    this.sprinkles.items.forEach(item => {
      item.vertex = nearest(item.vertex);
    });
    this.bubbles.forEach(b => {
      b.vertex = nearest(b.vertex);
    });
    this.mesh.remove(f.neck);
    f.neck.geometry.dispose();
    f.neck.material.dispose();
    this.installSurface(f.result);
    this.status(
      `已融合！现在是 ${this.model.massBodies.length} 块泥，颜色和接缝可以继续揉匀。`
    );
    clearTimeout(this.fusionTimer);
    this.fusionTimer = setTimeout(() => {
      if (!this.destroyed && this.pointer === undefined) this.tryFuse();
    }, 100);
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
    this.growingBubble = null;
    this.bubbles.forEach(b => {
      this.mesh.remove(b.mesh);
      b.mesh.geometry.dispose();
      b.mesh.material.dispose();
    });
    this.bubbles = [];
  }
  saveUndo() {
    if (this.fusion) this.completeFusion();
    clearTimeout(this.fusionTimer);
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
    this.cancelFoldRebuild();
    clearTimeout(this.fusionTimer);
    if (this.fusion) {
      this.mesh.remove(this.fusion.neck);
      this.fusion.neck.geometry.dispose();
      this.fusion.neck.material.dispose();
      this.fusion = null;
    }
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
    this.cancelFoldRebuild();
    if (this.fusion) {
      this.mesh.remove(this.fusion.neck);
      this.fusion.neck.geometry.dispose();
      this.fusion.neck.material.dispose();
      this.fusion = null;
    }
    clearTimeout(this.fusionTimer);
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
