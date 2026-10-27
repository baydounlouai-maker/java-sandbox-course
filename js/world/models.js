// Blocky creature models. Each model is built in "pixel" units and scaled to the entity's height.
import * as THREE from '../../vendor/three.js';

export const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x1f2a44, side: THREE.BackSide });
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

export const KINDS = {
  zombie: { color: '#6abf4b', height: 1.8, px: 32 },
  skeleton: { color: '#f2efe6', height: 1.9, px: 32 },
  slime: { color: '#7de38b', height: 1.0, px: 12, sizeBased: true },
  ghost: { color: '#e8f0ff', height: 1.7, px: 28, hover: 0.35 },
  bat: { color: '#5b4a7a', height: 0.6, px: 14, hover: 0.9 },
  robot: { color: '#9aa7b8', height: 1.6, px: 31 },
  blob: { color: '#f59e6b', height: 1.2, px: 18 }
};

export function kindFor(chain) {
  for (const name of chain) {
    const n = name.toLowerCase();
    for (const k of ['zombie', 'skeleton', 'slime', 'ghost', 'bat', 'robot']) {
      if (n.includes(k)) return k;
    }
    if (n === 'object') break;
  }
  return 'blob';
}

const tmp = new THREE.Color();
export function safeColor(c, fallback) {
  if (typeof c !== 'string') return fallback;
  const s = c.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return s;
  if (/^[a-z]+$/i.test(s) && THREE.Color.NAMES[s.toLowerCase()] !== undefined) return s.toLowerCase();
  return fallback;
}

export function lighten(hex, k) {
  tmp.set(hex);
  tmp.lerp(new THREE.Color(0xffffff), k);
  return '#' + tmp.getHexString();
}

export function darken(hex, k) {
  tmp.set(hex);
  tmp.multiplyScalar(1 - k);
  return '#' + tmp.getHexString();
}

class Builder {
  constructor() {
    this.root = new THREE.Group();
    this.mats = {};
    this.parts = {};
  }

  mat(role, color, opts = {}) {
    if (!this.mats[role]) {
      const m = opts.basic
        ? new THREE.MeshBasicMaterial({ color })
        : new THREE.MeshLambertMaterial({ color, transparent: !!opts.opacity, opacity: opts.opacity ?? 1 });
      this.mats[role] = m;
    }
    return this.mats[role];
  }

  // a box of size w*h*d (pixels) centred at x,y,z inside parent
  box(role, w, h, d, x, y, z, parent = this.root, opts = {}) {
    const mesh = new THREE.Mesh(UNIT_BOX, this.mats[role]);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = !opts.noShadow;
    if (opts.outline !== false) {
      const e = opts.outlineWidth ?? 0.45;
      const o = new THREE.Mesh(UNIT_BOX, OUTLINE);
      o.scale.set(1 + (2 * e) / w, 1 + (2 * e) / h, 1 + (2 * e) / d);
      mesh.add(o);
    }
    parent.add(mesh);
    return mesh;
  }

  pivot(name, x, y, z, parent = this.root) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    this.parts[name] = g;
    return g;
  }
}

function eyes(b, y, z, spread, w = 2, h = 1.4, parent) {
  b.box('eye', w, h, 0.4, -spread, y, z, parent, { outline: false });
  b.box('eye', w, h, 0.4, spread, y, z, parent, { outline: false });
}

function brows(b, y, z, spread, parent) {
  const l = b.box('brow', 2.6, 0.7, 0.4, -spread, y, z, parent, { outline: false });
  const r = b.box('brow', 2.6, 0.7, 0.4, spread, y, z, parent, { outline: false });
  l.rotation.z = -0.45;
  r.rotation.z = 0.45;
  b.parts.brows = [l, r];
}

const BUILDERS = {
  zombie(b, c) {
    b.mat('skin', c.color);
    b.mat('shirt', '#3b6fb6');
    b.mat('pants', '#3d3a5c');
    b.mat('eye', c.eyeColor || '#161616', { basic: true });
    b.mat('mouth', darken(c.color, 0.55));
    b.mat('brow', '#1f2a44', { basic: true });
    const legL = b.pivot('legL', -2, 12, 0);
    const legR = b.pivot('legR', 2, 12, 0);
    b.box('pants', 4, 12, 4, 0, -6, 0, legL);
    b.box('pants', 4, 12, 4, 0, -6, 0, legR);
    b.box('shirt', 8, 12, 4, 0, 18, 0);
    const armL = b.pivot('armL', -6, 22, 0);
    const armR = b.pivot('armR', 6, 22, 0);
    for (const a of [armL, armR]) {
      b.box('shirt', 4, 4, 8, 0, 0, 2, a);
      b.box('skin', 4, 4, 4, 0, 0, 8, a);
    }
    const head = b.pivot('head', 0, 24, 0);
    b.box('skin', 8, 8, 8, 0, 4, 0, head);
    eyes(b, 4.8, 4.1, 2, 2, 1.4, head);
    b.box('mouth', 3.2, 0.8, 0.3, 0, 1.9, 4.05, head, { outline: false });
    if (c.angry) brows(b, 6.4, 4.15, 2, head);
    return { headTop: 32, headWidth: 8, headParent: head, headOffset: 8 };
  },
  skeleton(b, c) {
    b.mat('bone', c.color);
    b.mat('eye', c.eyeColor || '#1f2a44', { basic: true });
    b.mat('dark', '#3a3f55');
    b.mat('brow', '#1f2a44', { basic: true });
    const legL = b.pivot('legL', -2, 12, 0);
    const legR = b.pivot('legR', 2, 12, 0);
    b.box('bone', 2, 12, 2, 0, -6, 0, legL);
    b.box('bone', 2, 12, 2, 0, -6, 0, legR);
    b.box('bone', 8, 2, 3, 0, 12.5, 0);
    b.box('bone', 2, 11, 2, 0, 18, 0);
    for (const y of [15.5, 18.5, 21.5]) b.box('bone', 8, 1.5, 4, 0, y, 0);
    b.box('bone', 10, 2, 3, 0, 23.5, 0);
    const armL = b.pivot('armL', -5, 23, 0);
    const armR = b.pivot('armR', 5, 23, 0);
    b.box('bone', 2, 12, 2, 0, -6, 0, armL);
    b.box('bone', 2, 12, 2, 0, -6, 0, armR);
    const head = b.pivot('head', 0, 24.5, 0);
    b.box('bone', 8, 8, 8, 0, 4, 0, head);
    eyes(b, 5, 4.1, 2, 2.2, 2.2, head);
    b.box('dark', 1, 1, 0.3, 0, 3, 4.05, head, { outline: false });
    b.box('dark', 4.4, 0.7, 0.3, 0, 1.4, 4.05, head, { outline: false });
    if (c.angry) brows(b, 7, 4.15, 2, head);
    return { headTop: 32.5, headWidth: 8, headParent: head, headOffset: 8 };
  },
  slime(b, c) {
    b.mat('gel', c.color, { opacity: 0.78 });
    b.mat('core', darken(c.color, 0.35));
    b.mat('eye', c.eyeColor || '#1f2a44', { basic: true });
    b.mat('brow', '#1f2a44', { basic: true });
    const body = b.pivot('body', 0, 0, 0);
    b.box('core', 5, 5, 5, 0, 5, 0, body, { outline: false });
    b.box('gel', 12, 12, 12, 0, 6, 0, body);
    eyes(b, 8, 6.1, 2.6, 2, 2, body);
    b.box('eye', 3, 0.9, 0.3, 0, 4.4, 6.1, body, { outline: false });
    if (c.angry) brows(b, 10, 6.15, 2.6, body);
    return { headTop: 12, headWidth: 12, headParent: body, headOffset: 12 };
  },
  ghost(b, c) {
    b.mat('sheet', c.color, { opacity: 0.88 });
    b.mat('eye', c.eyeColor || '#1f2a44', { basic: true });
    b.mat('brow', '#1f2a44', { basic: true });
    const body = b.pivot('body', 0, 0, 0);
    b.box('sheet', 10, 18, 8, 0, 15, 0, body);
    b.box('sheet', 8, 4, 6, 0, 26, 0, body);
    for (const x of [-3.4, 0, 3.4]) b.box('sheet', 3.2, 3, 8, x, 4.5, 0, body);
    const armL = b.pivot('armL', -5.5, 18, 1, body);
    const armR = b.pivot('armR', 5.5, 18, 1, body);
    b.box('sheet', 3, 6, 3, -1, -2, 0, armL);
    b.box('sheet', 3, 6, 3, 1, -2, 0, armR);
    eyes(b, 20, 4.1, 2, 2, 3, body);
    b.box('eye', 2.4, 3, 0.3, 0, 14.5, 4.1, body, { outline: false });
    if (c.angry) brows(b, 22.6, 4.15, 2, body);
    return { headTop: 28, headWidth: 8, headParent: body, headOffset: 28 };
  },
  bat(b, c) {
    b.mat('fur', c.color);
    b.mat('wing', darken(c.color, 0.3));
    b.mat('eye', c.eyeColor || '#ffd23f', { basic: true });
    b.mat('brow', '#1f2a44', { basic: true });
    const body = b.pivot('body', 0, 0, 0);
    b.box('fur', 4, 5, 4, 0, 5.5, 0, body);
    b.box('fur', 4, 4, 4, 0, 10, 0, body);
    b.box('fur', 1, 2, 1, -1.3, 13, 0, body);
    b.box('fur', 1, 2, 1, 1.3, 13, 0, body);
    eyes(b, 10.5, 2.1, 1, 1, 1, body);
    const wl = b.pivot('wingL', -2, 7.5, 0, body);
    const wr = b.pivot('wingR', 2, 7.5, 0, body);
    b.box('wing', 7, 4, 0.6, -3.5, 0, 0, wl);
    b.box('wing', 7, 4, 0.6, 3.5, 0, 0, wr);
    if (c.angry) brows(b, 11.8, 2.15, 1, body);
    return { headTop: 14, headWidth: 4, headParent: body, headOffset: 12 };
  },
  robot(b, c) {
    b.mat('metal', c.color);
    b.mat('dark', darken(c.color, 0.4));
    b.mat('panel', '#ff7a29');
    b.mat('eye', c.eyeColor || '#5ee4ff', { basic: true });
    b.mat('bulb', '#ff4d4d', { basic: true });
    b.mat('brow', '#1f2a44', { basic: true });
    const legL = b.pivot('legL', -2.5, 9, 0);
    const legR = b.pivot('legR', 2.5, 9, 0);
    b.box('dark', 3, 9, 3, 0, -4.5, 0, legL);
    b.box('dark', 3, 9, 3, 0, -4.5, 0, legR);
    b.box('metal', 10, 10, 6, 0, 14, 0);
    b.box('panel', 4, 3, 0.4, 0, 15, 3.1, b.root, { outline: false });
    const armL = b.pivot('armL', -6.5, 18, 0);
    const armR = b.pivot('armR', 6.5, 18, 0);
    b.box('dark', 3, 9, 3, 0, -4.5, 0, armL);
    b.box('dark', 3, 9, 3, 0, -4.5, 0, armR);
    const head = b.pivot('head', 0, 19, 0);
    b.box('metal', 8, 7, 7, 0, 3.5, 0, head);
    b.box('eye', 6, 2, 0.4, 0, 4, 3.6, head, { outline: false });
    b.box('dark', 1, 3, 1, 0, 8.5, 0, head);
    b.parts.bulb = b.box('bulb', 2, 2, 2, 0, 11, 0, head);
    if (c.angry) brows(b, 6, 3.65, 2, head);
    return { headTop: 31, headWidth: 8, headParent: head, headOffset: 12 };
  },
  blob(b, c) {
    b.mat('skin', c.color);
    b.mat('white', '#ffffff');
    b.mat('eye', c.eyeColor || '#1f2a44', { basic: true });
    b.mat('horn', '#fff3d6');
    b.mat('mouth', darken(c.color, 0.5));
    b.mat('brow', '#1f2a44', { basic: true });
    const body = b.pivot('body', 0, 0, 0);
    b.box('skin', 3, 2, 4, -3, 1, 1, body);
    b.box('skin', 3, 2, 4, 3, 1, 1, body);
    b.box('skin', 12, 12, 10, 0, 8, 0, body);
    b.box('horn', 1.6, 3, 1.6, -3.6, 15.5, 0, body);
    b.box('horn', 1.6, 3, 1.6, 3.6, 15.5, 0, body);
    b.box('white', 3, 3, 0.4, -2.6, 10, 5.1, body, { outline: false });
    b.box('white', 3, 3, 0.4, 2.6, 10, 5.1, body, { outline: false });
    b.parts.pupils = [
      b.box('eye', 1.4, 1.6, 0.3, -2.6, 9.8, 5.35, body, { outline: false }),
      b.box('eye', 1.4, 1.6, 0.3, 2.6, 9.8, 5.35, body, { outline: false })
    ];
    b.box('mouth', 4, 1, 0.3, 0, 5.8, 5.1, body, { outline: false });
    if (c.angry) brows(b, 12.4, 5.2, 2.6, body);
    return { headTop: 17, headWidth: 12, headParent: body, headOffset: 17 };
  }
};

// where each creature holds things: [pivot part, x, y, z, pointing] (pointing 'up' or 'forward')
const HANDS = {
  zombie: { weapon: ['armR', 0, 0, 9.5, 'up'], shield: ['armL', -2.4, 0, 6, 'side'] },
  skeleton: { weapon: ['armR', 0, -12, 0.5, 'forward'], shield: ['armL', -1.6, -8, 0, 'side'] },
  robot: { weapon: ['armR', 0, -9.5, 0.5, 'forward'], shield: ['armL', -2, -6, 0, 'side'] },
  ghost: { weapon: ['armR', 1, -5, 0.5, 'forward'], shield: ['armL', -2, -3, 0, 'side'] },
  blob: { weapon: ['body', 7.5, 6, 2, 'up'], shield: ['body', -7, 7, 1, 'side'] },
  slime: { weapon: ['body', 8, 5, 2, 'up'], shield: ['body', -7.5, 6, 1, 'side'] },
  bat: { weapon: ['body', 0, 3.5, 2.5, 'forward'], shield: null }
};

const HELD_DEFAULTS = {
  sword: { color: '#c9d3e0', length: 14 },
  axe: { color: '#aab4c3', length: 13 },
  hammer: { color: '#8d96a8', length: 12 },
  bow: { color: '#9a6235', length: 16 },
  wand: { color: '#b47cff', length: 9 },
  staff: { color: '#5ee4ff', length: 22 },
  spear: { color: '#c9d3e0', length: 24 },
  stick: { color: '#9a6235', length: 10 },
  shield: { color: '#c0392b', length: 8 }
};

function buildHeld(b, item, pxPerMeter) {
  const kind = item.kind;
  const def = HELD_DEFAULTS[kind] || HELD_DEFAULTS.stick;
  const color = item.color || def.color;
  const L = item.length > 0 ? Math.min(60, Math.max(3, item.length * pxPerMeter)) : def.length;
  const g = new THREE.Group();
  const role = 'held-' + kind;
  b.mat(role, color, kind === 'wand' || kind === 'staff' ? {} : {});
  b.mat('wood', '#9a6235');
  b.mat('gold', '#e8b730');
  b.mat('gem', color, { basic: true });
  b.mat('string', '#f6f8fd', { basic: true });
  switch (kind) {
    case 'sword':
      b.box('wood', 1.2, 3, 1.2, 0, 0, 0, g);
      b.box('gold', 4.4, 1, 1.4, 0, 1.8, 0, g);
      b.box(role, 1.6, L, 0.6, 0, 2.3 + L / 2, 0, g, { outlineWidth: 0.3 });
      break;
    case 'axe':
      b.box('wood', 1, L, 1, 0, L / 2 - 2, 0, g);
      b.box(role, 4, 4, 0.8, 2, L - 4, 0, g);
      break;
    case 'hammer':
      b.box('wood', 1, L, 1, 0, L / 2 - 2, 0, g);
      b.box(role, 5.5, 3, 3, 0, L - 2, 0, g);
      break;
    case 'bow':
      b.box(role, 0.9, L * 0.5, 0.9, 1.2, L * 0.25, 0, g);
      b.box(role, 0.9, L * 0.5, 0.9, 1.2, -L * 0.25, 0, g);
      b.box(role, 1.2, 2.5, 1.2, 0, 0, 0, g);
      b.box('string', 0.25, L, 0.25, 2.6, 0, 0, g, { outline: false });
      g.children[0].rotation.z = 0.25;
      g.children[1].rotation.z = -0.25;
      break;
    case 'wand':
      b.box('wood', 0.8, L, 0.8, 0, L / 2 - 1, 0, g);
      b.box('gem', 2, 2, 2, 0, L, 0, g);
      break;
    case 'staff':
      b.box('wood', 1, L, 1, 0, L / 2 - 4, 0, g);
      b.box('gem', 2.6, 2.6, 2.6, 0, L - 2.5, 0, g);
      break;
    case 'spear':
      b.box('wood', 0.8, L, 0.8, 0, L / 2 - 6, 0, g);
      b.box(role, 1.8, 3.5, 0.6, 0, L - 4, 0, g);
      break;
    case 'shield': {
      const w = Math.max(5, L);
      b.box(role, 0.9, w * 1.15, w, 0, 0, 0, g);
      b.box('gold', 1.2, 2, 2, -0.4, 0, 0, g);
      break;
    }
    default:
      b.box(role, 1, L, 1, 0, L / 2 - 1, 0, g);
  }
  return g;
}

export function buildCreature(kind, opts) {
  const b = new Builder();
  const info = BUILDERS[kind](b, opts);
  const def = KINDS[kind];
  const pxPerMeter = def.px / def.height;
  for (const slot of ['weapon', 'shield']) {
    const item = opts[slot];
    const hand = HANDS[kind] && HANDS[kind][slot];
    if (!item || !hand) continue;
    const [part, x, y, z, dir] = hand;
    const parent = b.parts[part] || b.root;
    const g = buildHeld(b, item, pxPerMeter);
    g.position.set(x, y, z);
    if (dir === 'forward') g.rotation.x = Math.PI / 2;
    if (dir === 'up' && part === 'armR') g.rotation.x = -0.25;
    if (dir === 'side') g.rotation.y = 0;
    parent.add(g);
    b.parts[slot] = g;
  }
  if (opts.hat) {
    b.mat('hat', opts.hat);
    b.mat('band', '#1f2a44');
    const hp = info.headParent;
    const y = info.headOffset;
    const w = info.headWidth;
    b.box('hat', w + 2, 1, w + 2, 0, y + 0.5, 0, hp);
    b.box('hat', w - 1.5, 5, w - 1.5, 0, y + 3.5, 0, hp);
    b.box('band', w - 1.4, 1, w - 1.4, 0, y + 1.6, 0, hp, { outline: false });
    info.headTop += 6;
  }
  return { group: b.root, mats: b.mats, parts: b.parts, info };
}

// idle + walk animation. speed: ground speed (m/s), t: seconds
export function animateCreature(c, kind, t, speed, phase, swing = 0) {
  const p = c.parts;
  const walk = Math.min(1, speed * 1.5);
  const s = Math.sin(t * 9 + phase);
  if (p.legL) {
    p.legL.rotation.x = s * 0.7 * walk;
    p.legR.rotation.x = -s * 0.7 * walk;
  }
  switch (kind) {
    case 'zombie':
      p.armL.rotation.x = Math.sin(t * 2 + phase) * 0.12 - 0.05;
      p.armR.rotation.x = Math.sin(t * 2 + phase + 1.3) * 0.12 - 0.05;
      p.head.rotation.z = Math.sin(t * 1.3 + phase) * 0.08;
      p.armR.rotation.x -= swing * 1.3;
      break;
    case 'skeleton':
      p.armL.rotation.x = -s * 0.6 * walk + Math.sin(t * 1.7 + phase) * 0.06;
      p.armR.rotation.x = s * 0.6 * walk - Math.sin(t * 1.7 + phase) * 0.06 - (p.weapon ? 0.5 : 0) - swing * 1.6;
      p.head.rotation.y = Math.sin(t * 0.9 + phase) * 0.25;
      break;
    case 'robot':
      p.armL.rotation.x = -s * 0.5 * walk;
      p.armR.rotation.x = s * 0.5 * walk - (p.weapon ? 0.5 : 0) - swing * 1.6;
      p.head.rotation.y = Math.sin(t * 0.7 + phase) * 0.35;
      if (p.bulb) p.bulb.visible = Math.sin(t * 4 + phase) > -0.3;
      break;
    case 'slime': {
      const k = Math.sin(t * 4 + phase);
      p.body.scale.set(1 - k * 0.05, 1 + k * 0.08, 1 - k * 0.05);
      break;
    }
    case 'ghost':
      p.body.position.y = Math.sin(t * 1.8 + phase) * 1.5;
      p.armL.rotation.z = -0.3 + Math.sin(t * 2.2 + phase) * 0.25;
      p.armR.rotation.z = 0.3 - Math.sin(t * 2.2 + phase) * 0.25;
      break;
    case 'bat':
      p.wingL.rotation.z = Math.sin(t * 16 + phase) * 0.7;
      p.wingR.rotation.z = -Math.sin(t * 16 + phase) * 0.7;
      p.body.position.y = Math.sin(t * 3 + phase) * 1.2;
      break;
    case 'blob': {
      const k = Math.abs(Math.sin(t * 3 + phase));
      if (p.weapon) p.weapon.rotation.z = -0.3 - swing * 1.2;
      p.body.position.y = k * 0.8;
      const blink = (t + phase) % 4 < 0.12 ? 0.15 : 1;
      for (const e of p.pupils) e.scale.y = 1.6 * blink;
      break;
    }
  }
}
