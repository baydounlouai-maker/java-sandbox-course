// The 3D island: plays back a program's timeline with three.js.
import * as THREE from '../../vendor/three.js';
import { OrbitControls, CSS2DRenderer, CSS2DObject } from '../../vendor/three.js';
import { KINDS, kindFor, buildCreature, animateCreature, safeColor, OUTLINE } from './models.js';
import { propsAt } from './timeline.js';

const ISLAND_R = 13;
const DEFAULT_SKY = '#bfe3ff';
const DEFAULT_GRASS = '#7fd36b';
const PX = 1; // pixel units are scaled per creature

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function luminance(hex) {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

export class World {
  constructor(container, { onEntityClick, onPointer, onTime } = {}) {
    this.container = container;
    this.onEntityClick = onEntityClick;
    this.onPointer = onPointer;
    this.onTime = onTime;
    this.entities = new Map();
    this.peers = new Map();
    this.timeline = null;
    this.playStart = 0;
    this.popIns = [];
    this.hitTimes = [];
    this.clock = { elapsedTime: 0, last: performance.now(), getDelta() { const n = performance.now(); const d = (n - this.last) / 1000; this.last = n; this.elapsedTime += d; return d; } };

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = 'world-canvas';
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const labels = new CSS2DRenderer();
    labels.domElement.className = 'world-labels';
    container.appendChild(labels.domElement);
    this.labels = labels;

    this.narrator = el('div', 'narrator');
    this.narrator.setAttribute('aria-live', 'polite');
    container.appendChild(this.narrator);

    const scene = new THREE.Scene();
    this.scene = scene;
    this.skyColor = new THREE.Color(DEFAULT_SKY);
    this.skyTarget = new THREE.Color(DEFAULT_SKY);
    scene.background = this.skyColor;

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    this.camera = camera;
    this.controls = new OrbitControls(camera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 60;
    this.resetCamera();

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x8aa070, 1.6);
    scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(9, 18, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -18;
    sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -18;
    sun.shadow.camera.far = 60;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    this.sun = sun;

    this.buildIsland();
    this.content = new THREE.Group();
    scene.add(this.content);
    this.peerGroup = new THREE.Group();
    scene.add(this.peerGroup);

    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.bindPointer();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    renderer.setAnimationLoop(() => this.frame());
  }

  resetCamera() {
    this.camera.position.set(6.5, 5.2, 10.5);
    this.controls.target.set(0, 1.1, 0);
    this.controls.update();
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.85 ? 52 : 42;
    this.camera.updateProjectionMatrix();
  }

  outlined(geo, mat, scale = 1.05) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    const o = new THREE.Mesh(geo, OUTLINE);
    o.scale.setScalar(scale);
    m.add(o);
    return m;
  }

  buildIsland() {
    const g = new THREE.Group();
    this.grassMat = new THREE.MeshLambertMaterial({ color: DEFAULT_GRASS });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_R, ISLAND_R, 0.6, 64), this.grassMat);
    top.position.y = -0.3;
    top.receiveShadow = true;
    g.add(top);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_R + 0.15, ISLAND_R + 0.15, 0.62, 64, 1, true), OUTLINE);
    rim.position.y = -0.3;
    g.add(rim);
    const dirtMat = new THREE.MeshLambertMaterial({ color: '#b57a4a' });
    const dirt = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_R, ISLAND_R * 0.72, 2.6, 64), dirtMat);
    dirt.position.y = -1.9;
    g.add(dirt);
    const dirtOutline = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_R + 0.15, ISLAND_R * 0.72 + 0.15, 2.7, 64), OUTLINE);
    dirtOutline.position.y = -1.9;
    g.add(dirtOutline);
    const water = new THREE.Mesh(new THREE.CircleGeometry(120, 64), new THREE.MeshLambertMaterial({ color: '#9fd8ff' }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = -2.4;
    water.receiveShadow = true;
    g.add(water);
    this.water = water;

    // faint coordinate grid, clipped to the island
    const pts = [];
    const R = ISLAND_R - 0.6;
    for (let i = -12; i <= 12; i++) {
      const half = Math.sqrt(Math.max(0, R * R - i * i));
      if (half < 0.5) continue;
      pts.push(i, 0.01, -half, i, 0.01, half);
      pts.push(-half, 0.01, i, half, 0.01, i);
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const grid = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: 0x1f2a44, transparent: true, opacity: 0.08 }));
    g.add(grid);
    // axis markers
    const axis = (text, x, z) => {
      const d = el('div', 'axis-label', text);
      const o = new CSS2DObject(d);
      o.position.set(x, 0.1, z);
      g.add(o);
    };
    axis('+x', ISLAND_R - 1.4, 0);
    axis('-x', -ISLAND_R + 1.4, 0);
    axis('+z', 0, ISLAND_R - 1.4);
    axis('-z', 0, -ISLAND_R + 1.4);
    // a few rocks around the rim
    const rockMat = new THREE.MeshLambertMaterial({ color: '#c9cfdb' });
    const rockGeo = new THREE.DodecahedronGeometry(0.45, 0);
    for (const [a, s] of [[0.6, 1], [2.2, 0.7], [3.9, 1.2], [5.1, 0.8]]) {
      const r = this.outlined(rockGeo, rockMat, 1.12);
      r.position.set(Math.cos(a) * (ISLAND_R - 0.9), 0.15 * s, Math.sin(a) * (ISLAND_R - 0.9));
      r.scale.setScalar(s);
      g.add(r);
    }
    // clouds
    this.clouds = [];
    const cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Group();
      const n = 3 + (i % 3);
      for (let k = 0; k < n; k++) {
        const s = 1.2 + ((k * 7 + i) % 3) * 0.5;
        const b = new THREE.Mesh(new THREE.BoxGeometry(s * 1.6, s, s), cloudMat);
        b.position.set(k * 1.5 - n * 0.7, (k % 2) * 0.4, (k % 3) * 0.4);
        c.add(b);
      }
      const ang = (i / 6) * Math.PI * 2;
      c.position.set(Math.cos(ang) * (22 + (i % 3) * 6), 11 + (i % 3) * 2.5, Math.sin(ang) * (22 + (i % 2) * 8));
      c.userData.speed = 0.3 + (i % 3) * 0.15;
      this.clouds.push(c);
      g.add(c);
    }
    // stars for night skies
    const starPts = [];
    for (let i = 0; i < 400; i++) {
      const u = Math.random() * Math.PI * 2;
      const v = Math.random() * 0.45 * Math.PI;
      const r = 150;
      starPts.push(Math.cos(u) * Math.cos(v) * r, Math.sin(v) * r + 10, Math.sin(u) * Math.cos(v) * r);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(starPts, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, transparent: true, opacity: 0, sizeAttenuation: false }));
    g.add(this.stars);
    this.scene.add(g);
  }

  // ---------- timeline ----------
  setTimeline(tl) {
    this.clearContent();
    this.timeline = tl;
    this.playStart = performance.now() / 1000;
    this.lastReported = -1;
    for (const e of tl.entities) this.createEntity(e);
    this.hitTimes = this.computeHits(tl);
    this.buildBlocks(tl.blocks);
    for (const tr of tl.trees) this.addTree(tr);
    for (const f of tl.flowers) this.addFlower(f);
  }

  replay() {
    if (!this.timeline) return;
    this.playStart = performance.now() / 1000;
    this.lastReported = -1;
    for (const ent of this.entities.values()) ent.sayUntil = 0;
  }

  get playTime() {
    return performance.now() / 1000 - this.playStart;
  }

  clearContent() {
    for (const ent of this.entities.values()) {
      ent.label.element.remove();
    }
    this.entities.clear();
    for (const child of [...this.content.children]) {
      child.traverse((o) => {
        if (o.isCSS2DObject) o.element.remove();
      });
      this.content.remove(child);
    }
    if (this.blockMesh) {
      this.blockMesh.geometry.dispose();
      this.blockMesh = null;
      this.blockOutline = null;
    }
    this.popIns = [];
    this.narrator.classList.remove('show');
    this.timeline = null;
    this.skyTarget.set(DEFAULT_SKY);
    this.grassMat.color.set(DEFAULT_GRASS);
  }

  createEntity(e) {
    const kind = kindFor(e.chain);
    const ent = { e, kind, built: null, key: '', pos: new THREE.Vector3(), yaw: 0, sayUntil: 0, phase: e.id * 1.7, lastPos: null };
    const holder = new THREE.Group();
    holder.userData.entityId = e.id;
    holder.visible = false;
    this.content.add(holder);
    ent.holder = holder;
    const labelEl = el('div', 'creature-label');
    const bubble = el('div', 'bubble');
    const tag = el('div', 'name-tag');
    const health = el('div', 'health');
    const healthFill = el('div', 'health-fill');
    health.appendChild(healthFill);
    labelEl.append(bubble, health, tag);
    const label = new CSS2DObject(labelEl);
    this.content.add(label);
    Object.assign(ent, { label, bubble, tag, health, healthFill });
    this.entities.set(e.id, ent);
    return ent;
  }

  rebuild(ent, props) {
    const def = KINDS[ent.kind];
    const color = safeColor(props.color, def.color);
    const eyeColor = props.angry ? '#e0342b' : safeColor(props.eyeColor, null);
    const hat = safeColor(props.hat, null);
    const weapon = props.weapon ? { ...props.weapon, color: safeColor(props.weapon.color, null) } : null;
    const shield = props.shield ? { ...props.shield, color: safeColor(props.shield.color, null) } : null;
    const key = [color, eyeColor, hat, !!props.angry, JSON.stringify(weapon), JSON.stringify(shield)].join('|');
    if (ent.key === key && ent.built) return;
    ent.key = key;
    if (ent.built) ent.holder.remove(ent.built.group);
    const built = buildCreature(ent.kind, { color, eyeColor, hat, angry: !!props.angry, weapon, shield });
    built.group.traverse((o) => { if (o.isMesh && o.material !== OUTLINE) o.userData.entityId = ent.e.id; });
    ent.holder.add(built.group);
    ent.built = built;
  }

  heightOf(ent, props) {
    const def = KINDS[ent.kind];
    let h = def.sizeBased ? props.size ?? props.height ?? def.height : props.height ?? def.height;
    if (!Number.isFinite(h)) h = def.height;
    return Math.min(8, Math.max(0.15, h));
  }

  updateEntities(t, dt) {
    const tl = this.timeline;
    for (const ent of this.entities.values()) {
      const e = ent.e;
      const alive = t >= e.addT && t < e.removeT;
      const age = t - e.addT;
      ent.holder.visible = alive;
      ent.label.visible = alive;
      ent.label.element.style.display = alive ? '' : 'none';
      if (!alive) continue;
      const props = propsAt(e, t);
      this.rebuild(ent, props);
      const def = KINDS[ent.kind];
      const h = this.heightOf(ent, props);
      const s = (h / def.px) * PX;
      const pop = Math.min(1, age / 0.35);
      const popScale = pop < 1 ? 1 - Math.pow(1 - pop, 3) * 1.0 + Math.sin(pop * Math.PI) * 0.15 : 1;
      ent.built.group.scale.setScalar(s * Math.max(0.01, popScale));
      const x = props.x ?? e.autoX ?? 0;
      const z = props.z ?? e.autoZ ?? 0;
      const hover = def.hover ?? 0;
      const y = Math.max(0, props.y ?? 0) + hover;
      ent.pos.set(x, y, z);
      // face the walking direction, otherwise turn back toward the camera side
      let speed = 0;
      if (ent.lastPos) {
        const dx = x - ent.lastPos.x;
        const dz = z - ent.lastPos.z;
        speed = Math.hypot(dx, dz) / Math.max(dt, 1e-3);
        if (speed > 0.15) ent.targetYaw = Math.atan2(dx, dz);
      }
      ent.lastPos = { x, z };
      if (ent.targetYaw === undefined) ent.targetYaw = 0;
      let dy = ent.targetYaw - ent.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      ent.yaw += dy * Math.min(1, dt * 8);
      ent.holder.position.copy(ent.pos);
      ent.holder.rotation.y = ent.yaw;
      animateCreature(ent.built, ent.kind, this.clock.elapsedTime, speed, ent.phase, this.swingAmount(ent, t));
      // label above the head
      const top = (ent.built.info.headTop * s) + y + 0.25;
      ent.label.position.set(x, top, z);
      const name = props.name ?? e.cls;
      ent.tag.textContent = name;
      ent.tag.title = e.chain.filter((c) => c !== 'Object').join(' → ');
      if (typeof props.health === 'number') {
        const max = typeof props.maxHealth === 'number' && props.maxHealth > 0 ? props.maxHealth : Math.max(10, ...e.keys.map((k) => k.props.health || 0));
        const frac = Math.max(0, Math.min(1, props.health / max));
        ent.health.style.display = '';
        ent.healthFill.style.width = (frac * 100).toFixed(0) + '%';
        ent.healthFill.style.background = frac > 0.5 ? '#3fa65b' : frac > 0.25 ? '#ffb020' : '#e0342b';
      } else {
        ent.health.style.display = 'none';
      }
      const showBubble = performance.now() < ent.sayUntil;
      ent.bubble.classList.toggle('show', showBubble);
    }
    // timeline speech
    if (tl) {
      for (const s of tl.says) {
        if (s.t > t || s._shown === this.playStart) continue;
        if (t - s.t > 3) continue;
        s._shown = this.playStart;
        this.say(s.id, s.text);
      }
    }
  }

  // armed creatures swing when someone else's health drops at a keyframe
  swingAmount(ent, t) {
    if (!ent.built.parts.weapon || !this.hitTimes) return 0;
    for (const h of this.hitTimes) {
      if (h.by !== ent.e.id) continue;
      const d = t - h.t;
      if (d >= -0.25 && d < 0.35) return Math.sin(((d + 0.25) / 0.6) * Math.PI);
    }
    return 0;
  }

  computeHits(tl) {
    // when health drops between two keyframes, credit the nearest armed entity
    const hits = [];
    const armed = tl.entities.filter((e) => e.keys.some((k) => k.props.weapon));
    for (const e of tl.entities) {
      for (let i = 1; i < e.keys.length; i++) {
        const a = e.keys[i - 1].props.health;
        const b = e.keys[i].props.health;
        if (typeof a === 'number' && typeof b === 'number' && b < a) {
          const pa = e.keys[i].props;
          let best = null;
          let bestD = Infinity;
          for (const w of armed) {
            if (w === e) continue;
            const k = w.keys.reduce((acc, kk) => (kk.t <= e.keys[i - 1].t ? kk : acc), w.keys[0]).props;
            const d = Math.hypot((k.x ?? w.autoX ?? 0) - (pa.x ?? e.autoX ?? 0), (k.z ?? w.autoZ ?? 0) - (pa.z ?? e.autoZ ?? 0));
            if (d < bestD) { bestD = d; best = w; }
          }
          if (best) hits.push({ t: e.keys[i - 1].t, by: best.id });
        }
      }
    }
    return hits;
  }

  say(id, text, seconds) {
    const dur = (seconds ?? Math.min(6, Math.max(2.4, text.length * 0.07))) * 1000;
    if (!id) {
      this.narrator.textContent = text;
      this.narrator.classList.add('show');
      clearTimeout(this.narratorTimer);
      this.narratorTimer = setTimeout(() => this.narrator.classList.remove('show'), dur);
      return;
    }
    const ent = this.entities.get(id);
    if (!ent) return;
    ent.bubble.textContent = text;
    ent.sayUntil = performance.now() + dur;
  }

  // ---------- blocks / scenery ----------
  buildBlocks(blocks) {
    if (!blocks.length) return;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const mesh = new THREE.InstancedMesh(geo, mat, blocks.length);
    const outline = new THREE.InstancedMesh(geo, OUTLINE, blocks.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const color = new THREE.Color();
    blocks.forEach((b, i) => {
      color.set(safeColor(b.color, '#ff00ff'));
      mesh.setColorAt(i, color);
    });
    mesh.instanceColor.needsUpdate = true;
    this.content.add(mesh, outline);
    this.blockMesh = mesh;
    this.blockOutline = outline;
    this.blockState = new Float32Array(blocks.length).fill(-1);
    this.blockMatrix = new THREE.Matrix4();
    this.updateBlocks(0, true);
  }

  updateBlocks(t, force = false) {
    if (!this.blockMesh) return;
    const blocks = this.timeline.blocks;
    const m = this.blockMatrix;
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    let changed = false;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const age = t - b.t;
      const k = age < 0 ? 0 : Math.min(1, age / 0.25);
      if (!force && this.blockState[i] === k) continue;
      this.blockState[i] = k;
      changed = true;
      const s = k === 0 ? 0.0001 : k < 1 ? 1 - Math.pow(1 - k, 3) : 1;
      p.set(b.x, b.y + 0.5, b.z);
      sc.setScalar(s * 0.98);
      m.compose(p, q, sc);
      this.blockMesh.setMatrixAt(i, m);
      sc.setScalar(s * 1.04);
      m.compose(p, q, sc);
      this.blockOutline.setMatrixAt(i, m);
    }
    if (changed) {
      this.blockMesh.instanceMatrix.needsUpdate = true;
      this.blockOutline.instanceMatrix.needsUpdate = true;
      this.blockMesh.computeBoundingSphere();
      this.blockOutline.computeBoundingSphere();
    }
  }

  addTree(tr) {
    const g = new THREE.Group();
    const trunk = this.outlined(new THREE.BoxGeometry(0.35, 1, 0.35), new THREE.MeshLambertMaterial({ color: '#9a6235' }), 1.12);
    trunk.position.y = 0.5;
    g.add(trunk);
    const leaf = new THREE.MeshLambertMaterial({ color: '#3fa65b' });
    const c1 = this.outlined(new THREE.ConeGeometry(1, 1.6, 6), leaf, 1.07);
    c1.position.y = 1.6;
    const c2 = this.outlined(new THREE.ConeGeometry(0.75, 1.3, 6), leaf, 1.08);
    c2.position.y = 2.35;
    g.add(c1, c2);
    g.position.set(tr.x, 0, tr.z);
    g.userData.spawn = tr.t;
    g.scale.setScalar(0.0001);
    this.content.add(g);
    this.popIns.push(g);
  }

  addFlower(f) {
    const g = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.06), new THREE.MeshLambertMaterial({ color: '#2f8a46' }));
    stem.position.y = 0.22;
    const head = this.outlined(new THREE.BoxGeometry(0.28, 0.28, 0.28), new THREE.MeshLambertMaterial({ color: safeColor(f.color, '#ffd23f') }), 1.2);
    head.position.y = 0.5;
    const center = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.3), new THREE.MeshBasicMaterial({ color: '#fff3a0' }));
    center.position.set(0, 0.5, 0.01);
    g.add(stem, head, center);
    g.position.set(f.x, 0, f.z);
    g.userData.spawn = f.t;
    g.scale.setScalar(0.0001);
    this.content.add(g);
    this.popIns.push(g);
  }

  updateScenery(t, dt) {
    for (const g of this.popIns) {
      const age = t - g.userData.spawn;
      const k = age < 0 ? 0.0001 : Math.min(1, age / 0.35);
      g.scale.setScalar(k < 1 ? Math.max(0.0001, 1 - Math.pow(1 - k, 3)) : 1);
    }
    const tl = this.timeline;
    if (tl) {
      let sky = DEFAULT_SKY;
      for (const s of tl.sky) if (s.t <= t) sky = safeColor(s.color, DEFAULT_SKY);
      this.skyTarget.set(sky);
      let ground = DEFAULT_GRASS;
      for (const s of tl.ground) if (s.t <= t) ground = safeColor(s.color, DEFAULT_GRASS);
      this.grassMat.color.lerp(new THREE.Color(ground), Math.min(1, dt * 4));
    }
    this.skyColor.lerp(this.skyTarget, Math.min(1, dt * 3));
    const lum = luminance('#' + this.skyColor.getHexString());
    const night = Math.max(0, Math.min(1, (0.35 - lum) / 0.25));
    this.stars.material.opacity = night * 0.9;
    this.sun.intensity = 1.9 - night * 1.3;
    this.hemi.intensity = 1.6 - night * 0.9;
    this.hemi.color.copy(this.skyColor).lerp(new THREE.Color(0xffffff), 0.6);
    this.water.material.color.set('#9fd8ff').lerp(this.skyColor, 0.35).multiplyScalar(1 - night * 0.4);
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 45) c.position.x = -45;
    }
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.timeline ? this.playTime : 0;
    if (this.timeline) {
      this.updateEntities(t, dt);
      this.updateBlocks(t);
      if (this.onTime) {
        const done = t >= this.timeline.duration;
        const report = done ? Infinity : t;
        if (report !== this.lastReported) {
          this.lastReported = report;
          this.onTime(report);
        }
      }
    }
    this.updateScenery(t, dt);
    this.updatePeers();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }

  // ---------- input ----------
  bindPointer() {
    const dom = this.renderer.domElement;
    let down = null;
    let lastSent = 0;
    dom.addEventListener('pointerdown', (ev) => { down = { x: ev.clientX, y: ev.clientY }; });
    dom.addEventListener('pointerup', (ev) => {
      if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 5) return;
      down = null;
      const hit = this.pick(ev);
      if (this.onEntityClick) this.onEntityClick(hit);
    });
    dom.addEventListener('pointermove', (ev) => {
      if (!this.onPointer) return;
      const now = performance.now();
      if (now - lastSent < 60) return;
      lastSent = now;
      this.setNdc(ev);
      this.raycaster.setFromCamera(this.ndc, this.camera);
      const p = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.groundPlane, p) && Math.hypot(p.x, p.z) < ISLAND_R + 2) {
        this.onPointer({ x: +p.x.toFixed(2), z: +p.z.toFixed(2) });
      } else {
        this.onPointer(null);
      }
    });
    dom.addEventListener('pointerleave', () => this.onPointer && this.onPointer(null));
  }

  setNdc(ev) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  }

  pick(ev) {
    this.setNdc(ev);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const targets = [];
    for (const ent of this.entities.values()) if (ent.holder.visible) targets.push(ent.holder);
    const hits = this.raycaster.intersectObjects(targets, true);
    for (const h of hits) {
      let o = h.object;
      while (o && o.userData.entityId === undefined) o = o.parent;
      if (o) {
        const ent = this.entities.get(o.userData.entityId);
        if (ent) return { id: ent.e.id, entity: ent.e, props: propsAt(ent.e, this.playTime), fields: this.fieldsAt(ent.e, this.playTime) };
      }
    }
    return null;
  }

  fieldsAt(e, t) {
    let f = e.keys[0].fields;
    for (const k of e.keys) if (k.t <= t) f = k.fields;
    return f;
  }

  // ---------- peers ----------
  setPeers(list) {
    const seen = new Set();
    for (const p of list) {
      seen.add(p.id);
      let peer = this.peers.get(p.id);
      if (!peer) {
        const g = new THREE.Group();
        const mat = new THREE.MeshBasicMaterial({ color: p.color });
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 12), mat);
        cone.rotation.x = Math.PI;
        cone.position.y = 0.6;
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 24), new THREE.MeshBasicMaterial({ color: p.color, side: THREE.DoubleSide, transparent: true, opacity: 0.7 }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.03;
        const tag = el('div', 'peer-tag', p.name);
        tag.style.background = p.color;
        const label = new CSS2DObject(tag);
        label.position.y = 1.2;
        g.add(cone, ring, label);
        this.peerGroup.add(g);
        peer = { g, label, tag, target: new THREE.Vector3(), mat };
        this.peers.set(p.id, peer);
      }
      peer.tag.textContent = p.name;
      peer.tag.style.background = p.color;
      peer.mat.color.set(p.color);
      if (p.pointer) {
        peer.target.set(p.pointer.x, 0, p.pointer.z);
        if (!peer.g.visible) peer.g.position.copy(peer.target);
        peer.g.visible = true;
        peer.label.element.style.display = '';
      } else {
        peer.g.visible = false;
        peer.label.element.style.display = 'none';
      }
    }
    for (const [id, peer] of this.peers) {
      if (!seen.has(id)) {
        peer.label.element.remove();
        this.peerGroup.remove(peer.g);
        this.peers.delete(id);
      }
    }
  }

  updatePeers() {
    const t = this.clock.elapsedTime;
    for (const peer of this.peers.values()) {
      if (!peer.g.visible) continue;
      peer.g.position.lerp(peer.target, 0.25);
      peer.g.children[0].position.y = 0.6 + Math.sin(t * 4) * 0.08;
    }
  }
}
