// Runtime values and helpers shared by the compiler output and the built-in classes.

export const R = { rt: null };

let objCounter = 0;

export class JObj {
  constructor(cls) {
    this.cls = cls;
    this.f = {};
    this.id = ++objCounter;
  }
}

export class JArray {
  constructor(elemType, data) {
    this.elemType = elemType;
    this.data = data;
    this.id = ++objCounter;
  }
}

export class JBox {
  constructor(kind, v) {
    this.kind = kind;
    this.v = v;
    this.id = ++objCounter;
  }
}

const boxCache = {};
export function box(kind, v) {
  if (kind !== 'Double' && kind !== 'Float' && v >= -128 && v <= 127) {
    const key = kind + v;
    return boxCache[key] || (boxCache[key] = new JBox(kind, v));
  }
  return new JBox(kind, v);
}

// thrown Java exception
export class JavaThrow extends Error {
  constructor(obj) {
    super('java exception');
    this.obj = obj;
    this.trace = R.rt ? R.rt.captureTrace() : [];
  }
}

// not catchable by Java code
export class HaltSignal extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

export function hashOf(v) {
  return (Math.imul(v.id, 2654435761) >>> 0) & 0x7fffffff;
}

export function fmtDouble(d) {
  if (Number.isNaN(d)) return 'NaN';
  if (d === Infinity) return 'Infinity';
  if (d === -Infinity) return '-Infinity';
  if (d === 0) return Object.is(d, -0) ? '-0.0' : '0.0';
  const abs = Math.abs(d);
  if (abs >= 1e-3 && abs < 1e7) {
    let s = String(d);
    if (s.includes('e')) s = d.toFixed(20).replace(/0+$/, '');
    if (!s.includes('.')) s += '.0';
    return s;
  }
  let [m, e] = d.toExponential().split('e');
  if (!m.includes('.')) m += '.0';
  return m + 'E' + (e[0] === '+' ? e.slice(1) : e);
}

export function fmtFloat(f) {
  if (!Number.isFinite(f) || f === 0) return fmtDouble(f);
  for (let p = 1; p <= 9; p++) {
    const s = Number(f.toPrecision(p));
    if (Math.fround(s) === f) return fmtDouble(s);
  }
  return fmtDouble(f);
}

export function qualifiedName(cls) {
  return cls.pkg ? cls.pkg + '.' + cls.name : cls.name;
}

export function arrayTypeCode(elemType) {
  if (elemType.k === 'prim') {
    return '[' + { int: 'I', double: 'D', boolean: 'Z', char: 'C', long: 'J', float: 'F', short: 'S', byte: 'B' }[elemType.n];
  }
  if (elemType.k === 'array') return '[' + arrayTypeCode(elemType.elem);
  const name = elemType.k === 'class' ? qualifiedName(elemType.cls) : 'java.lang.Object';
  return '[L' + name + ';';
}

export function boxToString(b) {
  switch (b.kind) {
    case 'Double': return fmtDouble(b.v);
    case 'Float': return fmtFloat(b.v);
    case 'Character': return String.fromCharCode(b.v);
    case 'Boolean': return String(b.v);
    default: return String(b.v);
  }
}

// String.valueOf(Object) semantics
export function jstr(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return v;
  if (v instanceof JBox) return boxToString(v);
  if (v instanceof JObj) {
    const m = v.cls.vtable.get('toString()');
    const s = R.rt.invoke(m, v, []);
    return s === null ? 'null' : s;
  }
  if (v instanceof JArray) return arrayTypeCode(v.elemType) + '@' + hashOf(v).toString(16);
  return String(v);
}

export function jequals(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a === 'string') return a === b;
  if (a instanceof JBox) return b instanceof JBox && a.kind === b.kind && (a.v === b.v || (Number.isNaN(a.v) && Number.isNaN(b.v)));
  if (a instanceof JObj) {
    const m = a.cls.vtable.get('equals(Object)');
    return !!R.rt.invoke(m, a, [b]);
  }
  return false;
}

export function stringHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

export function jhash(v) {
  if (v === null) return 0;
  if (typeof v === 'string') return stringHash(v);
  if (v instanceof JBox) {
    if (v.kind === 'Boolean') return v.v ? 1231 : 1237;
    if (v.kind === 'Double') return v.v | 0;
    return v.v | 0;
  }
  if (v instanceof JObj) {
    const m = v.cls.vtable.get('hashCode()');
    return R.rt.invoke(m, v, []);
  }
  return hashOf(v);
}

export function jcompare(a, b) {
  if (typeof a === 'string' && typeof b === 'string') {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const d = a.charCodeAt(i) - b.charCodeAt(i);
      if (d) return d;
    }
    return a.length - b.length;
  }
  if (a instanceof JBox && b instanceof JBox) return a.v < b.v ? -1 : a.v > b.v ? 1 : 0;
  if (a instanceof JObj) {
    const m = a.cls.vtable.get('compareTo(Object)') || [...a.cls.vtable.values()].find((mm) => mm.name === 'compareTo' && mm.params.length === 1);
    if (m) return R.rt.invoke(m, a, [b]);
  }
  R.rt.throwNew('ClassCastException', `${a && a.cls ? a.cls.name : 'value'} cannot be compared (it has no compareTo method)`);
}

// printf / String.format
export function javaFormat(fmt, args) {
  let ai = 0;
  const re = /%(\d+\$)?([-#+ 0,(]*)(\d+)?(\.\d+)?([a-zA-Z%])/g;
  return fmt.replace(re, (all, argIdx, flags, width, prec, conv) => {
    if (conv === 'n') return '\n';
    if (conv === '%') return '%';
    let arg;
    if (argIdx) arg = args[parseInt(argIdx, 10) - 1];
    else {
      if (ai >= args.length) R.rt.throwNew('MissingFormatArgumentException', `Format specifier '${all}'`);
      arg = args[ai++];
    }
    const raw = arg instanceof JBox ? arg.v : arg;
    let s;
    const lower = conv.toLowerCase();
    switch (lower) {
      case 'd': {
        if (typeof raw !== 'number' || (arg instanceof JBox && (arg.kind === 'Double' || arg.kind === 'Float'))) {
          R.rt.throwNew('IllegalFormatConversionException', `%d can't format ${describeValue(arg)}. Use %f for decimals or %s for text.`);
        }
        s = Math.abs(raw).toString();
        if (flags.includes(',')) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        if (raw < 0) s = '-' + s;
        else if (flags.includes('+')) s = '+' + s;
        break;
      }
      case 'f': case 'e': {
        if (typeof raw !== 'number' || (arg instanceof JBox && arg.kind !== 'Double' && arg.kind !== 'Float')) {
          R.rt.throwNew('IllegalFormatConversionException', `%${conv} needs a decimal number (double), but got ${describeValue(arg)}`);
        }
        const p = prec ? parseInt(prec.slice(1), 10) : 6;
        if (lower === 'f') {
          s = Math.abs(raw).toFixed(p);
          if (flags.includes(',')) {
            const [ip, fp] = s.split('.');
            s = ip.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fp !== undefined ? '.' + fp : '');
          }
        } else {
          s = Math.abs(raw).toExponential(p).replace(/e([+-])(\d)$/, 'e$10$2');
        }
        if (raw < 0 || Object.is(raw, -0)) s = '-' + s;
        else if (flags.includes('+')) s = '+' + s;
        break;
      }
      case 'x': s = (raw >>> 0).toString(16); break;
      case 'o': s = (raw >>> 0).toString(8); break;
      case 'c': s = typeof raw === 'number' ? String.fromCharCode(raw) : jstr(arg); break;
      case 'b': s = arg === null ? 'false' : typeof raw === 'boolean' ? String(raw) : 'true'; break;
      case 's': s = jstr(arg); if (prec) s = s.slice(0, parseInt(prec.slice(1), 10)); break;
      default:
        R.rt.throwNew('UnknownFormatConversionException', `Conversion = '${conv}'`);
    }
    if (conv !== lower && lower !== 'd') s = s.toUpperCase();
    if (width) {
      const w = parseInt(width, 10);
      if (s.length < w) {
        if (flags.includes('-')) s = s.padEnd(w);
        else if (flags.includes('0') && lower !== 's') {
          const neg = s[0] === '-' || s[0] === '+';
          s = neg ? s[0] + s.slice(1).padStart(w - 1, '0') : s.padStart(w, '0');
        } else s = s.padStart(w);
      }
    }
    return s;
  });
}

function describeValue(v) {
  if (v === null) return 'null';
  if (typeof v === 'string') return 'a String';
  if (v instanceof JBox) return 'a ' + v.kind;
  if (v instanceof JObj) return 'a ' + v.cls.name;
  return 'a value';
}

// ---------- the world recorder ----------

const PROP_ALIASES = {
  color: ['color', 'colour', 'skincolor', 'skin', 'bodycolor', 'furcolor'],
  height: ['height', 'tall'],
  size: ['size', 'width', 'scale'],
  x: ['x', 'posx', 'positionx'],
  y: ['y', 'posy', 'altitude'],
  z: ['z', 'posz', 'positionz'],
  name: ['name', 'nickname'],
  health: ['health', 'hp', 'hitpoints', 'life'],
  maxHealth: ['maxhealth', 'maxhp', 'max_health'],
  angry: ['angry', 'isangry', 'mad'],
  eyeColor: ['eyecolor', 'eyes', 'eyecolour'],
  hat: ['hat', 'hatcolor']
};

function rawNumber(v) {
  if (typeof v === 'number') return v;
  if (v instanceof JBox && typeof v.v === 'number') return v.v;
  return undefined;
}

export class WorldRecorder {
  constructor() {
    this.time = 0;
    this.events = [];
    this.ids = new Map();
    this.nextId = 1;
    this.blockCount = 0;
  }

  push(ev) {
    if (this.events.length > 50000) {
      throw new HaltSignal('limit', 'The world got too busy (more than 50,000 changes). Try fewer pauses or smaller loops.');
    }
    ev.t = this.time;
    this.events.push(ev);
  }

  add(obj) {
    if (this.ids.has(obj)) return;
    if (this.ids.size >= 400) {
      throw new HaltSignal('limit', 'The world can hold at most 400 objects.');
    }
    const id = this.nextId++;
    this.ids.set(obj, id);
    this.push({ type: 'add', id, state: this.snapshot(obj) });
  }

  remove(obj) {
    const id = this.ids.get(obj);
    if (!id) return;
    this.ids.delete(obj);
    this.push({ type: 'remove', id });
  }

  snapshotAll() {
    const states = [];
    for (const [obj, id] of this.ids) states.push([id, this.snapshot(obj)]);
    return states;
  }

  pause(seconds) {
    this.push({ type: 'snap', states: this.snapshotAll() });
    this.time += Math.max(0, seconds);
  }

  finish() {
    this.push({ type: 'snap', states: this.snapshotAll(), final: true });
  }

  snapshot(obj) {
    const chain = [];
    const fields = [];
    const byName = new Map();
    for (let c = obj.cls; c; c = c.superclass) {
      chain.push(c.name);
      if (c.builtin) continue;
      for (const f of c.fields.values()) {
        if (f.isStatic) continue;
        const v = obj.f[f.key];
        fields.push({ name: f.name, owner: c.name, type: f.typeName, value: displayValue(v, f.type) });
        const key = f.name.toLowerCase();
        if (!byName.has(key)) byName.set(key, v);
      }
    }
    const props = {};
    // objects held in fields: weapons and shields are drawn in the creature's hands
    for (let c = obj.cls; c && !c.builtin; c = c.superclass) {
      for (const f of c.fields.values()) {
        if (f.isStatic) continue;
        const v = obj.f[f.key];
        if (!(v instanceof JObj) || v === obj) continue;
        const w = describeHeld(v, f.name);
        if (!w) continue;
        if (w.kind === 'shield') { if (!props.shield) props.shield = w; }
        else if (!props.weapon) props.weapon = w;
      }
    }
    for (const [prop, aliases] of Object.entries(PROP_ALIASES)) {
      for (const a of aliases) {
        if (byName.has(a)) {
          const v = byName.get(a);
          if (prop === 'color' || prop === 'name' || prop === 'eyeColor' || prop === 'hat') {
            if (typeof v === 'string') props[prop] = v;
          } else if (prop === 'angry') {
            if (typeof v === 'boolean') props[prop] = v;
            else if (v instanceof JBox && typeof v.v === 'boolean') props[prop] = v.v;
          } else {
            const num = rawNumber(v);
            if (num !== undefined && Number.isFinite(num)) props[prop] = num;
          }
          if (prop in props) break;
        }
      }
    }
    // flyers: anything with a getAltitude() method floats
    const alt = obj.cls.vtable && obj.cls.vtable.get('getAltitude()');
    if (alt && !alt.native) {
      try {
        const v = R.rt.invoke(alt, obj, []);
        const num = rawNumber(v);
        if (num !== undefined && Number.isFinite(num)) props.y = num;
      } catch (e) {
        if (e instanceof HaltSignal) throw e;
      }
    }
    return { chain, props, fields };
  }
}

const HELD_KINDS = ['sword', 'axe', 'hammer', 'bow', 'wand', 'staff', 'spear', 'shield', 'dagger', 'club', 'mace', 'knife', 'blade', 'scythe', 'trident'];
const HELD_ALIAS = { dagger: 'sword', knife: 'sword', blade: 'sword', club: 'hammer', mace: 'hammer', scythe: 'axe', trident: 'spear' };
const HELD_FIELDS = new Set(['weapon', 'item', 'tool', 'held', 'hand', 'equipped', 'shield', 'offhand']);

function describeHeld(v, fieldName) {
  let kind = null;
  for (let c = v.cls; c && !kind; c = c.superclass) {
    const n = c.name.toLowerCase();
    kind = HELD_KINDS.find((k) => n.includes(k)) || null;
    if (!kind && n.includes('weapon')) kind = 'weapon';
  }
  const fname = fieldName.toLowerCase();
  if (!kind && !HELD_FIELDS.has(fname)) return null;
  if (!kind || kind === 'weapon') kind = fname === 'shield' || fname === 'offhand' ? 'shield' : 'stick';
  kind = HELD_ALIAS[kind] || kind;
  const out = { kind, cls: v.cls.name };
  for (let c = v.cls; c && !c.builtin; c = c.superclass) {
    for (const f of c.fields.values()) {
      if (f.isStatic) continue;
      const key = f.name.toLowerCase();
      const fv = v.f[f.key];
      const num = rawNumber(fv);
      if ((key === 'color' || key === 'colour') && typeof fv === 'string' && !out.color) out.color = fv;
      else if ((key === 'length' || key === 'size') && num !== undefined && out.length === undefined) out.length = num;
      else if (key === 'name' && typeof fv === 'string' && !out.name) out.name = fv;
      else if ((key === 'damage' || key === 'power' || key === 'attack') && num !== undefined && out.damage === undefined) out.damage = num;
    }
  }
  return out;
}

export function displayValue(v, type) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') {
    if (type && type.k === 'prim') {
      if (type.n === 'double') return fmtDouble(v);
      if (type.n === 'float') return fmtFloat(v);
      if (type.n === 'char') return "'" + String.fromCharCode(v) + "'";
    }
    return Number.isInteger(v) ? String(v) : fmtDouble(v);
  }
  if (typeof v === 'boolean') return String(v);
  if (v instanceof JBox) return boxToString(v);
  if (v instanceof JObj) return v.cls.name + ' object';
  if (v instanceof JArray) return 'array[' + v.data.length + ']';
  return String(v);
}
