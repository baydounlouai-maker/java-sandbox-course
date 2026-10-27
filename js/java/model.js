// Types, classes, fields and methods: the compiler's view of a Java program.

export const T = {};
for (const n of ['int', 'double', 'boolean', 'char', 'long', 'float', 'short', 'byte', 'void']) {
  T[n] = { k: 'prim', n };
}
T.null = { k: 'null' };

export const NUMERIC = new Set(['byte', 'short', 'char', 'int', 'long', 'float', 'double']);
export const INTEGRAL = new Set(['byte', 'short', 'char', 'int', 'long']);
export const BOX = { int: 'Integer', double: 'Double', boolean: 'Boolean', char: 'Character', long: 'Long', float: 'Float', short: 'Short', byte: 'Byte' };
export const UNBOX = Object.fromEntries(Object.entries(BOX).map(([a, b]) => [b, a]));

const WIDEN = {
  byte: ['short', 'int', 'long', 'float', 'double'],
  short: ['int', 'long', 'float', 'double'],
  char: ['int', 'long', 'float', 'double'],
  int: ['long', 'float', 'double'],
  long: ['float', 'double'],
  float: ['double'],
  double: [],
  boolean: []
};

let REG = null;
export function setRegistry(reg) { REG = reg; }
export function getClass(name) { return REG.get(name) || null; }

export const classT = (cls, args = null) => ({ k: 'class', cls, args });
export const arrayT = (elem) => ({ k: 'array', elem });
export const tvar = (n) => ({ k: 'tvar', n });

export const isPrim = (t) => t.k === 'prim';
export const isNumericPrim = (t) => t.k === 'prim' && NUMERIC.has(t.n);
export const isIntegralPrim = (t) => t.k === 'prim' && INTEGRAL.has(t.n);
export const isBool = (t) => t.k === 'prim' && t.n === 'boolean';
export const isRef = (t) => t.k === 'class' || t.k === 'array' || t.k === 'null' || t.k === 'tvar';
export const isString = (t) => t.k === 'class' && t.cls.name === 'String';
export const isVoid = (t) => t.k === 'prim' && t.n === 'void';

export function typeStr(t) {
  if (!t) return '?';
  switch (t.k) {
    case 'prim': return t.n;
    case 'null': return 'null';
    case 'tvar': return t.n;
    case 'array': return typeStr(t.elem) + '[]';
    case 'class': return t.cls.name + (t.args && t.args.length ? '<' + t.args.map(typeStr).join(', ') + '>' : '');
  }
  return '?';
}

export function erasure(t) {
  switch (t.k) {
    case 'prim': return t.n;
    case 'tvar': return 'Object';
    case 'array': return erasure(t.elem) + '[]';
    case 'class': return t.cls.name;
    default: return 'Object';
  }
}

export function sameType(a, b) {
  if (a.k !== b.k) return false;
  switch (a.k) {
    case 'prim': return a.n === b.n;
    case 'null': return true;
    case 'tvar': return a.n === b.n;
    case 'array': return sameType(a.elem, b.elem);
    case 'class':
      if (a.cls !== b.cls) return false;
      if (!a.args || !b.args || !a.args.length || !b.args.length) return true;
      return a.args.length === b.args.length && a.args.every((x, i) => sameType(x, b.args[i]));
  }
  return false;
}

export function unboxedPrim(t) {
  if (t.k === 'prim') return t;
  if (t.k === 'class' && UNBOX[t.cls.name]) return T[UNBOX[t.cls.name]];
  return null;
}

export function boxedType(p) {
  return classT(getClass(BOX[p.n]));
}

export function isSubclass(a, b) {
  if (a === b) return true;
  if (b.name === 'Object') return true;
  if (a.superclass && isSubclass(a.superclass, b)) return true;
  for (const i of a.interfaces) if (isSubclass(i, b)) return true;
  return false;
}

export function primWidens(from, to) {
  return from.n === to.n || WIDEN[from.n].includes(to.n);
}

function fitsConstant(v, to) {
  if (typeof v !== 'number' || !Number.isInteger(v)) return false;
  switch (to.n) {
    case 'byte': return v >= -128 && v <= 127;
    case 'short': return v >= -32768 && v <= 32767;
    case 'char': return v >= 0 && v <= 65535;
    default: return false;
  }
}

// Assignment conversion (JLS 5.2) including boxing when allowBoxing.
export function isAssignable(from, to, constVal, allowBoxing = true) {
  if (to.k === 'tvar') to = classT(getClass('Object'));
  if (from.k === 'tvar') from = classT(getClass('Object'));
  if (to.k === 'prim') {
    if (to.n === 'void') return false;
    if (from.k === 'prim') {
      if (from.n === 'void') return false;
      if (primWidens(from, to)) return true;
      if (constVal !== undefined && ['int', 'char', 'short', 'byte'].includes(from.n) && fitsConstant(constVal, to)) return true;
      return false;
    }
    if (!allowBoxing) return false;
    const u = unboxedPrim(from);
    return !!u && from.k === 'class' && primWidens(u, to);
  }
  // to is a reference type
  if (from.k === 'null') return true;
  if (from.k === 'prim') {
    if (!allowBoxing || from.n === 'void') return false;
    const boxed = boxedType(from);
    if (isRefAssignable(boxed, to)) return true;
    // constant like Character c = 65; Byte b = 1;
    if (constVal !== undefined && to.k === 'class' && UNBOX[to.cls.name] && fitsConstant(constVal, T[UNBOX[to.cls.name]])) return true;
    return false;
  }
  return isRefAssignable(from, to);
}

export function isRefAssignable(from, to) {
  if (from.k === 'null') return true;
  if (to.k === 'class' && to.cls.name === 'Object') return true;
  if (from.k === 'array') {
    if (to.k !== 'array') return false;
    if (from.elem.k === 'prim' || to.elem.k === 'prim') return sameType(from.elem, to.elem);
    return isRefAssignable(from.elem, to.elem);
  }
  if (from.k === 'class' && to.k === 'class') {
    if (!isSubclass(from.cls, to.cls)) return false;
    if (from.cls === to.cls && from.args && to.args && from.args.length && to.args.length) {
      return from.args.length === to.args.length && from.args.every((a, i) => sameType(a, to.args[i]));
    }
    return true;
  }
  return false;
}

export function isCastable(from, to) {
  if (from.k === 'prim' && to.k === 'prim') {
    if (from.n === 'boolean' || to.n === 'boolean') return from.n === to.n;
    return from.n !== 'void' && to.n !== 'void';
  }
  if (from.k === 'prim') {
    // (Integer) 5, (Object) 5
    return isAssignable(from, to);
  }
  if (to.k === 'prim') {
    const u = unboxedPrim(from);
    if (u) return u.n === to.n || primWidens(u, to);
    // (int) someObject  -> Object to int via Integer
    return from.k === 'class' && (from.cls.name === 'Object' || from.cls.name === 'Number');
  }
  if (from.k === 'null') return true;
  if (isRefAssignable(from, to) || isRefAssignable(to, from)) return true;
  if (from.k === 'class' && to.k === 'class') {
    if (from.cls.isInterface && !to.cls.isFinal) return true;
    if (to.cls.isInterface && !from.cls.isFinal) return true;
  }
  return false;
}

export function subst(t, map) {
  if (!map) return t;
  switch (t.k) {
    case 'tvar': return map[t.n] || classT(getClass('Object'));
    case 'array': return arrayT(subst(t.elem, map));
    case 'class': return t.args ? classT(t.cls, t.args.map((a) => subst(a, map))) : t;
    default: return t;
  }
}

// type-variable bindings implied by a receiver type such as ArrayList<Zombie>
export function receiverMap(t) {
  if (t.k !== 'class' || !t.cls.typeParams) return null;
  const map = {};
  t.cls.typeParams.forEach((p, i) => {
    map[p] = t.args && t.args[i] ? t.args[i] : classT(getClass('Object'));
  });
  return map;
}

export function defaultValue(t) {
  if (t.k === 'prim') return t.n === 'boolean' ? false : 0;
  return null;
}

let classIds = 0;
export class ClassInfo {
  constructor(name, opts = {}) {
    this.id = ++classIds;
    this.name = name;
    this.isInterface = !!opts.isInterface;
    this.isAbstract = !!opts.isAbstract || this.isInterface;
    this.isFinal = !!opts.isFinal;
    this.builtin = !!opts.builtin;
    this.pkg = opts.pkg || null;
    this.typeParams = opts.typeParams || null;
    this.superclass = null;
    this.interfaces = [];
    this.fields = new Map();
    this.methods = new Map();
    this.ctors = [];
    this.vtable = new Map();
    this.statics = {};
    this.decl = opts.decl || null;
    this.file = opts.file || null;
    this.instanceInits = [];
    this.staticInits = [];
  }

  addMethod(m) {
    m.owner = this;
    if (!this.methods.has(m.name)) this.methods.set(m.name, []);
    this.methods.get(m.name).push(m);
  }

  // every method named `name` visible from this class, most-derived first, one per signature
  findMethods(name) {
    const out = [];
    const seen = new Set();
    const visit = (c) => {
      if (!c) return;
      for (const m of c.methods.get(name) || []) {
        if (!seen.has(m.sig)) { seen.add(m.sig); out.push(m); }
      }
      visit(c.superclass);
      for (const i of c.interfaces) visit(i);
      if (c.isInterface && !c.superclass) visit(getClass('Object'));
    };
    visit(this);
    return out;
  }

  findField(name) {
    for (let c = this; c; c = c.superclass) {
      const f = c.fields.get(name);
      if (f) return f;
      for (const i of c.interfaces) {
        const fi = i.findField(name);
        if (fi) return fi;
      }
    }
    return null;
  }

  allFieldNames() {
    const names = [];
    for (let c = this; c; c = c.superclass) names.push(...c.fields.keys());
    return names;
  }
}

export class FieldInfo {
  constructor(name, type, opts = {}) {
    this.name = name;
    this.type = type;
    this.typeName = typeStr(type);
    this.isStatic = !!opts.isStatic;
    this.isFinal = !!opts.isFinal;
    this.access = opts.access || 'package';
    this.owner = opts.owner || null;
    this.decl = opts.decl || null;
    this.key = null;
  }
}

export class MethodInfo {
  constructor(name, params, ret, opts = {}) {
    this.name = name;
    this.params = params; // [{name, type}]
    this.ret = ret;
    this.isStatic = !!opts.isStatic;
    this.isAbstract = !!opts.isAbstract;
    this.isFinal = !!opts.isFinal;
    this.isDefault = !!opts.isDefault;
    this.isCtor = !!opts.isCtor;
    this.access = opts.access || 'package';
    this.varargs = !!opts.varargs;
    this.native = opts.native || null;
    this.decl = opts.decl || null;
    this.owner = null;
    this.body = null;
    this.nlocals = 0;
    this.sig = name + '(' + params.map((p) => erasure(p.type)).join(',') + ')';
  }

  display() {
    return this.name + '(' + this.params.map((p) => typeStr(p.type)).join(', ') + ')';
  }
}

export const ACCESS_RANK = { private: 0, package: 1, protected: 2, public: 3 };

export function accessOf(mods) {
  if (mods.has('public')) return 'public';
  if (mods.has('protected')) return 'protected';
  if (mods.has('private')) return 'private';
  return 'package';
}
