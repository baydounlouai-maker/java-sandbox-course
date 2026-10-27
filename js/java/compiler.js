// Type-checks Java source and compiles it into JavaScript closures.
import { parse, exprText } from './parser.js';
import { CompileError } from './lexer.js';
import {
  T, ClassInfo, FieldInfo, MethodInfo, setRegistry, getClass, classT, arrayT, typeStr, sameType,
  isPrim, isNumericPrim, isIntegralPrim, isBool, isRef, isString, isVoid, unboxedPrim, boxedType,
  isSubclass, isAssignable, isRefAssignable, isCastable, subst, receiverMap, defaultValue, accessOf,
  ACCESS_RANK, BOX, UNBOX, primWidens
} from './model.js';
import { createBuiltins, toInt } from './builtins.js';
import { R, JObj, JArray, JBox, box, jstr, JavaThrow, HaltSignal, fmtDouble, fmtFloat } from './runtime.js';

export const BRK = 1;
export const CNT = 2;
export const RET = 3;

const JAVA_UTIL = new Set(['ArrayList', 'List', 'Random', 'Arrays', 'Collection']);

// ---------- small helpers ----------
function lev(a, b) {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[m][n];
}

export function suggest(name, candidates) {
  const lower = name.toLowerCase();
  let best = null;
  let bestD = Infinity;
  for (const c of new Set(candidates)) {
    if (c === name) continue;
    if (c.toLowerCase() === lower) return c;
    const d = lev(lower, c.toLowerCase());
    if (d < bestD) { bestD = d; best = c; }
  }
  const limit = name.length <= 3 ? 1 : name.length <= 6 ? 2 : 3;
  return bestD <= limit ? best : null;
}

const an = (s) => (/^[aeiouAEIOU]/.test(s) ? 'an ' : 'a ') + s;
const didYouMean = (s) => (s ? `Did you mean '${s}'?` : null);

function isFloating(n) { return n === 'double' || n === 'float'; }

function toLong(v) {
  if (Number.isNaN(v)) return 0;
  if (v >= 9223372036854775807) return 9223372036854775807;
  if (v <= -9223372036854775808) return -9223372036854775808;
  return Math.trunc(v);
}

// conversion between primitive types (both widening and casting)
function primConv(from, to) {
  if (from === to) return null;
  switch (to) {
    case 'double': return null;
    case 'float': return Math.fround;
    case 'long': return isFloating(from) ? toLong : null;
    case 'int':
      if (isFloating(from)) return toInt;
      if (from === 'long') return (v) => v | 0;
      return null;
    case 'char': return isFloating(from) ? (v) => toInt(v) & 0xffff : (v) => v & 0xffff;
    case 'short': return isFloating(from) ? (v) => (toInt(v) << 16) >> 16 : (v) => (v << 16) >> 16;
    case 'byte': return isFloating(from) ? (v) => (toInt(v) << 24) >> 24 : (v) => (v << 24) >> 24;
  }
  return null;
}

function binaryPromote(a, b) {
  if (a.n === 'double' || b.n === 'double') return T.double;
  if (a.n === 'float' || b.n === 'float') return T.float;
  if (a.n === 'long' || b.n === 'long') return T.long;
  return T.int;
}

function unaryPromote(a) {
  return ['byte', 'short', 'char'].includes(a.n) ? T.int : a;
}

function strConv(t) {
  if (t.k === 'prim') {
    switch (t.n) {
      case 'char': return (v) => String.fromCharCode(v);
      case 'double': return fmtDouble;
      case 'float': return fmtFloat;
      default: return (v) => String(v);
    }
  }
  if (t.k === 'null') return () => 'null';
  if (isString(t)) return (v) => (v === null ? 'null' : v);
  return jstr;
}

export function isInstance(v, t) {
  if (v === null) return false;
  if (t.k === 'array') {
    if (!(v instanceof JArray)) return false;
    if (t.elem.k === 'prim' || v.elemType.k === 'prim') return sameType(t.elem, v.elemType);
    return isRefAssignable(v.elemType, t.elem);
  }
  const cls = t.cls;
  if (cls.name === 'Object') return true;
  if (typeof v === 'string') return isSubclass(getClass('String'), cls);
  if (v instanceof JBox) return isSubclass(getClass(v.kind), cls);
  if (v instanceof JObj) return isSubclass(v.cls, cls);
  return false;
}

function runtimeTypeName(v) {
  if (typeof v === 'string') return 'java.lang.String';
  if (v instanceof JBox) return 'java.lang.' + v.kind;
  if (v instanceof JObj) return (v.cls.pkg ? v.cls.pkg + '.' : '') + v.cls.name;
  if (v instanceof JArray) return typeStr(arrayT(v.elemType));
  return 'value';
}

// ---------- method-body compile context ----------
class Ctx {
  constructor(cls, method, isStatic, kind) {
    this.cls = cls;
    this.method = method;
    this.isStatic = isStatic;
    this.kind = kind; // 'method' | 'ctor' | 'init'
    this.scopes = [new Map()];
    this.nslots = 0;
    this.maxSlots = 0;
    this.breakables = [];
    this.loopDepth = 0;
    this.da = new Set();
  }

  allLocals() {
    const out = [];
    for (const s of this.scopes) out.push(...s.keys());
    return out;
  }

  lookup(name) {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const v = this.scopes[i].get(name);
      if (v) return v;
    }
    return null;
  }

  declare(name, type, pos, final = false) {
    if (this.lookup(name)) {
      throw new CompileError(`Variable '${name}' is already defined in this method`, pos, 'Pick a different name, or remove the type to reuse the existing variable: ' + name + ' = ...;');
    }
    const local = { name, type, slot: this.nslots++, final, pos };
    this.maxSlots = Math.max(this.maxSlots, this.nslots);
    this.scopes[this.scopes.length - 1].set(name, local);
    return local;
  }

  push() { this.scopes.push(new Map()); return this.nslots; }
  pop(saved) { this.scopes.pop(); this.nslots = saved; }

  assign(local) { if (this.da) this.da.add(local); }
  isAssigned(local) { return this.da === null || this.da.has(local); }
  snapshot() { return this.da === null ? null : new Set(this.da); }
}

function intersect(a, b) {
  if (a === null) return b === null ? null : new Set(b);
  if (b === null) return new Set(a);
  return new Set([...a].filter((x) => b.has(x)));
}

// ============================================================
export class Compiler {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.features = new Set();
    this.userClasses = [];
    this.imports = new Map();
    this.curFile = null;
  }

  err(e) {
    if (e instanceof CompileError) {
      const key = e.pos ? `${e.pos.file}:${e.pos.line}:${e.message}` : e.message;
      if (!this.errors.some((x) => x.key === key)) {
        this.errors.push({ key, message: e.message, hint: e.hint, file: e.pos?.file, line: e.pos?.line, col: e.pos?.col });
      }
      if (this.errors.length > 40) throw new TooManyErrors();
      return;
    }
    throw e;
  }

  fail(msg, pos, hint) { throw new CompileError(msg, pos, hint); }

  warn(msg, pos) {
    this.warnings.push({ message: msg, file: pos?.file, line: pos?.line, col: pos?.col });
  }

  guard(fn) {
    try { return fn(); } catch (e) { this.err(e); return undefined; }
  }

  compile(files) {
    this.reg = createBuiltins();
    setRegistry(this.reg);
    this.Object = this.reg.get('Object');
    this.String = this.reg.get('String');
    this.Throwable = this.reg.get('Throwable');
    for (const c of this.reg.values()) this.buildVtable(c);

    const units = [];
    for (const f of files) {
      try {
        const u = parse(f.src, f.name);
        units.push(u);
        this.imports.set(f.name, u.imports.map((i) => i.name));
      } catch (e) {
        this.err(e);
      }
    }
    try {
      this.declareClasses(units);
      for (const c of this.userClasses) this.guard(() => this.resolveHeader(c));
      for (const c of this.userClasses) this.declareMembers(c);
      for (const c of this.userClasses) this.buildVtable(c);
      for (const c of this.userClasses) this.checkClass(c);
      for (const c of this.userClasses) this.compileClass(c);
      if (!this.errors.length) this.findMain(units);
    } catch (e) {
      if (!(e instanceof TooManyErrors)) this.err(e);
    }
    return this;
  }

  // ---------- declarations ----------
  declareClasses(units) {
    for (const u of units) {
      for (const d of u.types) {
        this.guard(() => {
          const prev = this.reg.get(d.name);
          if (prev && prev.builtin) {
            this.fail(`Java already has a class called ${d.name}. Pick a different name for yours.`, d.namePos);
          }
          if (prev) this.fail(`There are two classes named ${d.name}. Each class needs its own name.`, d.namePos);
          if (!/^[A-Z]/.test(d.name)) {
            this.warn(`Class names usually start with a capital letter: ${d.name[0].toUpperCase() + d.name.slice(1)}`, d.namePos);
          }
          for (const m of ['private', 'protected', 'static']) {
            if (d.mods.has(m)) this.fail(`A top-level class can't be ${m}`, d.pos);
          }
          if (d.mods.has('abstract') && d.mods.has('final')) this.fail("A class can't be both abstract and final", d.pos);
          if (d.mods.has('public') && u.file !== d.name + '.java') {
            this.fail(`public class ${d.name} must be in a file named ${d.name}.java`, d.namePos,
              `Rename the file to ${d.name}.java, or remove 'public' from the class.`);
          }
          const cls = new ClassInfo(d.name, {
            isInterface: d.kind === 'interface',
            isAbstract: d.mods.has('abstract'),
            isFinal: d.mods.has('final'),
            decl: d,
            file: u.file
          });
          this.reg.set(d.name, cls);
          this.userClasses.push(cls);
          if (cls.isInterface) this.features.add('interface');
          if (cls.isAbstract && !cls.isInterface) this.features.add('abstract-class');
        });
      }
    }
  }

  resolveType(node, file = this.curFile) {
    if (!node) return null;
    if (node.name === 'var') this.fail("'var' can only be used for local variables with a starting value", node.pos);
    let t;
    if (T[node.name] && node.name !== 'null') {
      t = T[node.name];
      if (node.args) this.fail(`${node.name} can't have < >`, node.pos);
    } else {
      const cls = this.reg.get(node.name);
      if (!cls) {
        const prim = { string: 'String', Int: 'int', integer: 'Integer', Boolean: 'boolean', bool: 'boolean', Double: 'double', str: 'String' }[node.name];
        const s = prim || suggest(node.name, [...this.reg.keys(), 'int', 'double', 'boolean', 'char', 'long']);
        this.fail(`Cannot find the type '${node.name}'`, node.pos,
          s ? `Did you mean '${s}'? Java names are case-sensitive.` : 'Check the spelling, or create a class with that name.');
      }
      if (JAVA_UTIL.has(cls.name) && cls.builtin) {
        const imps = this.imports.get(file) || [];
        if (!imps.includes('java.util.' + cls.name) && !imps.includes('java.util.*')) {
          this.fail(`Cannot find the type '${cls.name}'. It lives in java.util, so it needs an import.`, node.pos,
            `Add this line at the very top of the file: import java.util.${cls.name};`);
        }
      }
      if (cls.name === 'World') this.features.add('world');
      let args = null;
      if (node.args) {
        if (!cls.typeParams) this.fail(`${cls.name} doesn't take type arguments in < >`, node.pos);
        if (node.args.length && node.args.length !== cls.typeParams.length) {
          this.fail(`${cls.name} needs ${cls.typeParams.length} type argument(s) in < >`, node.pos);
        }
        args = node.args.map((a) => this.resolveType(a, file));
      }
      t = classT(cls, args);
      if (cls.name === 'ArrayList' || cls.name === 'List') this.features.add('arraylist');
    }
    for (let i = 0; i < node.dims; i++) t = arrayT(t);
    if (node.dims) this.features.add('array');
    return t;
  }

  resolveHeader(cls) {
    const d = cls.decl;
    this.curFile = cls.file;
    if (cls.isInterface) {
      cls.superclass = null;
      for (const n of d.impls) {
        const t = this.resolveType(n);
        if (t.k !== 'class' || !t.cls.isInterface) this.fail(`${n.name} is not an interface, so ${cls.name} can't extend it`, n.pos);
        cls.interfaces.push(t.cls);
      }
      return;
    }
    cls.superclass = this.Object;
    if (d.ext) {
      const t = this.resolveType(d.ext);
      if (t.k !== 'class') this.fail(`A class can only extend another class, not ${typeStr(t)}`, d.ext.pos);
      const sup = t.cls;
      if (sup.isInterface) {
        this.fail(`${cls.name} can't extend ${sup.name} because ${sup.name} is an interface`, d.ext.pos, `Use: class ${cls.name} implements ${sup.name}`);
      }
      if (sup.isFinal) this.fail(`${sup.name} is final, so no class can extend it`, d.ext.pos);
      if (sup.builtin && sup.name !== 'Object' && !isSubclass(sup, this.Throwable)) {
        this.fail(`In this sandbox, classes can't extend the built-in ${sup.name}`, d.ext.pos);
      }
      if (sup === cls) this.fail(`${cls.name} can't extend itself`, d.ext.pos);
      for (let c = sup; c; c = c.superclass) {
        if (c === cls) this.fail(`Inheritance loop: ${cls.name} and ${sup.name} extend each other`, d.ext.pos);
        if (!c.superclass && !c.builtin && c.decl && c.decl.ext && !c._headerDone) break;
      }
      cls.superclass = sup;
      this.features.add('extends');
    }
    for (const n of d.impls) {
      const t = this.resolveType(n);
      if (t.k !== 'class' || !t.cls.isInterface) {
        this.fail(`${n.name} is a class, not an interface. Use 'extends' for classes.`, n.pos);
      }
      cls.interfaces.push(t.cls);
      this.features.add('implements');
    }
    cls._headerDone = true;
  }

  declareMembers(cls) {
    const d = cls.decl;
    this.curFile = cls.file;
    for (const mem of d.members) {
      this.guard(() => {
        if (mem.k === 'Field') this.declareField(cls, mem);
        else if (mem.k === 'Method') this.declareMethod(cls, mem);
        else if (mem.k === 'Ctor') this.declareCtor(cls, mem);
      });
    }
    if (!cls.isInterface && !cls.ctors.length) {
      const m = new MethodInfo(cls.name, [], T.void, { isCtor: true, access: 'public' });
      m.owner = cls;
      m.synthetic = true;
      cls.ctors.push(m);
    }
  }

  declareField(cls, mem) {
    const base = this.resolveType(mem.type);
    for (const v of mem.vars) {
      let t = base;
      for (let i = 0; i < v.dims; i++) t = arrayT(t);
      if (cls.fields.has(v.name)) this.fail(`The field '${v.name}' is declared twice in ${cls.name}`, v.pos);
      const isIface = cls.isInterface;
      if (isIface && !v.init) this.fail(`Interface fields are constants and need a value: ${v.name} = ...`, v.pos);
      if (mem.mods.has('abstract')) this.fail("Fields can't be abstract", v.pos);
      const f = new FieldInfo(v.name, t, {
        isStatic: isIface || mem.mods.has('static'),
        isFinal: isIface || mem.mods.has('final'),
        access: isIface ? 'public' : accessOf(mem.mods),
        owner: cls,
        decl: v
      });
      f.key = cls.name + '.' + v.name;
      f.declMem = mem;
      if (f.isFinal && f.isStatic && v.init && v.init.k === 'Lit' && (isPrim(t) || isString(t))) {
        // constant: fold literal right away
        const lt = this.litType(v.init);
        if (isAssignable(lt, t, v.init.v)) f.constValue = this.convertConst(v.init.v, lt, t);
      }
      cls.fields.set(v.name, f);
      if (f.access === 'private') this.features.add('private-field');
      if (f.isStatic && !isIface) this.features.add('static-field');
      if (f.isFinal) this.features.add('final');
    }
  }

  litType(lit) {
    if (lit.ty === 'String') return classT(this.String);
    if (lit.ty === 'null') return T.null;
    return T[lit.ty];
  }

  convertConst(v, from, to) {
    if (from.k === 'prim' && to.k === 'prim') {
      const c = primConv(from.n, to.n);
      return c ? c(v) : v;
    }
    return v;
  }

  methodParams(mem) {
    const names = new Set();
    return mem.params.map((p) => {
      if (names.has(p.name)) this.fail(`Two parameters are both named '${p.name}'`, p.pos);
      names.add(p.name);
      return { name: p.name, type: this.resolveType(p.type), pos: p.pos, final: p.final };
    });
  }

  declareMethod(cls, mem) {
    const params = this.methodParams(mem);
    const ret = this.resolveType(mem.ret);
    const mods = mem.mods;
    const isIface = cls.isInterface;
    let isAbstract = mods.has('abstract');
    if (isIface) {
      if (mods.has('private') || mods.has('protected')) this.fail('Interface methods are always public', mem.pos);
      if (!mem.body && !mods.has('static') && !mods.has('default')) isAbstract = true;
      if (mem.body && !mods.has('static') && !mods.has('default')) {
        this.fail(`Interface method ${mem.name}() has a body, so it needs the 'default' keyword`, mem.pos, `Either remove the { } body and end with ;, or write: default ${typeStr(ret)} ${mem.name}(...)`);
      }
    } else if (mods.has('default')) {
      this.fail("'default' methods only exist in interfaces", mem.pos);
    }
    if (isAbstract && mem.body) {
      this.fail(`Abstract method ${mem.name}() can't have a body`, mem.pos, `Remove the { } and end the line with ;  like: abstract ${typeStr(ret)} ${mem.name}();`);
    }
    if (!isAbstract && !mem.body && !isIface) {
      this.fail(`Method ${mem.name}() needs a body { }`, mem.pos, 'Add { } with code, or mark the method abstract.');
    }
    if (isAbstract && !cls.isAbstract) {
      this.fail(`${cls.name} has an abstract method ${mem.name}(), so the class must be abstract too`, mem.pos, `Write: abstract class ${cls.name}`);
    }
    if (isAbstract && (mods.has('static') || mods.has('private') || mods.has('final'))) {
      this.fail(`An abstract method can't be ${mods.has('static') ? 'static' : mods.has('private') ? 'private' : 'final'}`, mem.pos);
    }
    const m = new MethodInfo(mem.name, params, ret, {
      isStatic: mods.has('static'),
      isAbstract,
      isFinal: mods.has('final'),
      isDefault: mods.has('default'),
      access: isIface ? 'public' : accessOf(mods),
      varargs: mem.params.length > 0 && mem.params[mem.params.length - 1].varargs,
      decl: mem
    });
    m.hasOverride = mem.annos.some((a) => a.name === 'Override');
    for (const other of cls.methods.get(m.name) || []) {
      if (other.sig === m.sig) {
        this.fail(`Method ${m.display()} is declared twice in ${cls.name}`, mem.pos, 'Methods with the same name need different parameter types.');
      }
    }
    cls.addMethod(m);
    if (m.isStatic && m.name !== 'main') this.features.add('static-method');
    if (!m.isStatic && !isAbstract) this.features.add('instance-method');
    if (isAbstract && !isIface) this.features.add('abstract-method');
    if (m.hasOverride) this.features.add('override');
  }

  declareCtor(cls, mem) {
    if (cls.isInterface) this.fail("Interfaces can't have constructors", mem.pos);
    const params = this.methodParams(mem);
    const m = new MethodInfo(cls.name, params, T.void, { isCtor: true, access: accessOf(mem.mods), decl: mem });
    m.owner = cls;
    for (const other of cls.ctors) {
      if (other.sig === m.sig) this.fail(`${cls.name} has two constructors with the same parameters`, mem.pos);
    }
    for (const bad of ['static', 'abstract', 'final']) {
      if (mem.mods.has(bad)) this.fail(`A constructor can't be ${bad}`, mem.pos);
    }
    cls.ctors.push(m);
    this.features.add('constructor');
    if (params.length) this.features.add('constructor-params');
  }

  buildVtable(cls) {
    if (cls._vt) return;
    cls._vt = true;
    const vt = new Map();
    if (cls.superclass) {
      this.buildVtable(cls.superclass);
      for (const [k, v] of cls.superclass.vtable) vt.set(k, v);
    } else if (cls.isInterface) {
      // nothing: Object methods come from the implementing class
    }
    for (const i of cls.interfaces) {
      this.buildVtable(i);
      for (const [k, v] of i.vtable) {
        const cur = vt.get(k);
        if (!cur || (cur.isAbstract && !v.isAbstract)) vt.set(k, v);
      }
    }
    for (const ms of cls.methods.values()) {
      for (const m of ms) {
        if (!m.isStatic && m.access !== 'private') vt.set(m.sig, m);
      }
    }
    cls.vtable = vt;
  }

  overridden(cls, m) {
    const found = [];
    const visit = (c) => {
      if (!c) return;
      const x = c.vtable.get(m.sig) || (c.methods.get(m.name) || []).find((y) => y.sig === m.sig);
      if (x && x !== m && x.owner !== cls) found.push(x);
    };
    visit(cls.superclass);
    const ifaces = [];
    const collect = (c) => { for (const i of c.interfaces) { ifaces.push(i); collect(i); } if (c.superclass) collect(c.superclass); };
    collect(cls);
    for (const i of ifaces) visit(i);
    if (cls.isInterface) visit(this.Object);
    return [...new Set(found)];
  }

  checkClass(cls) {
    this.curFile = cls.file;
    for (const ms of cls.methods.values()) {
      for (const m of ms) {
        this.guard(() => {
          if (m.access === 'private' && m.hasOverride) {
            this.fail(`Private method ${m.name}() can't override anything`, m.decl.pos);
          }
          const sups = m.access === 'private' ? [] : this.overridden(cls, m);
          for (const o of sups) {
            if (o.isFinal) this.fail(`${m.name}() is final in ${o.owner.name}, so ${cls.name} can't override it`, m.decl.pos);
            if (o.isStatic !== m.isStatic) {
              this.fail(`${m.display()} in ${cls.name} ${m.isStatic ? 'is static but the method it hides is not' : "can't override the static method in " + o.owner.name}`, m.decl.pos);
            }
            const okRet = isPrim(o.ret) || isPrim(m.ret) ? sameType(o.ret, m.ret) : isRefAssignable(m.ret, subst(o.ret, null).k === 'tvar' ? classT(this.Object) : o.ret);
            if (!okRet) {
              this.fail(`${m.name}() in ${cls.name} must return ${typeStr(o.ret)}, the same as the ${m.name}() it overrides in ${o.owner.name}`, m.decl.pos);
            }
            if (ACCESS_RANK[m.access] < ACCESS_RANK[o.access]) {
              this.fail(o.owner.isInterface
                ? `${m.name}() must be public, because it comes from the interface ${o.owner.name}`
                : `${m.name}() must be ${o.access}, because the method it overrides in ${o.owner.name} is ${o.access}`,
              m.decl.pos, `Add 'public' in front: public ${typeStr(m.ret)} ${m.name}(...)`);
            }
          }
          if (m.hasOverride && !sups.length) {
            const same = [];
            for (let c = cls.superclass; c; c = c.superclass) same.push(...(c.methods.get(m.name) || []));
            const near = same.length ? `${same[0].owner.name} has ${same[0].display()}. Check the parameter types.` :
              didYouMean(suggest(m.name, [...(cls.superclass ? cls.superclass.vtable.values() : [])].map((x) => x.name)));
            this.fail(`${m.display()} says @Override, but there is no method like it to override` + (cls.superclass && cls.superclass.name !== 'Object' ? ` in ${cls.superclass.name}` : ''), m.decl.pos,
              near || (cls.superclass?.name === 'Object' ? `${cls.name} doesn't extend another class. Did you forget 'extends'?` : null));
          }
        });
      }
    }
    if (!cls.isAbstract) {
      const missing = [...cls.vtable.values()].filter((m) => m.isAbstract);
      if (missing.length) {
        const m = missing[0];
        this.err(new CompileError(
          `${cls.name} must write the method ${typeStr(m.ret)} ${m.display()}, because ${m.owner.name} declares it ${m.owner.isInterface ? 'in its interface' : 'abstract'}`,
          cls.decl.namePos,
          missing.length > 1 ? `Still missing: ${missing.map((x) => x.display()).join(', ')}` : (`Add: public ${typeStr(m.ret)} ${m.name}(${m.params.map((p) => typeStr(p.type) + ' ' + p.name).join(', ')}) { ... }` + (cls.decl.mods.has('abstract') ? '' : `  (or make ${cls.name} abstract)`))
        ));
      }
    }
  }

  // ---------- bodies ----------
  compileClass(cls) {
    this.curFile = cls.file;
    const d = cls.decl;
    // field initializers
    let initSlots = 0;
    for (const mem of d.members) {
      if (mem.k !== 'Field') continue;
      for (const v of mem.vars) {
        const f = cls.fields.get(v.name);
        if (!f || f.decl !== v || !v.init) continue;
        this.guard(() => {
          const ctx = new Ctx(cls, null, f.isStatic, 'init');
          ctx.fieldInit = f;
          let fn;
          if (v.init.k === 'ArrayInit') {
            if (f.type.k !== 'array') this.fail(`{ ... } values can only initialize an array, but ${f.name} is ${an(typeStr(f.type))}`, v.init.pos);
            fn = this.arrayInit(v.init, f.type, ctx);
          } else {
            const e = this.ex(v.init, ctx, f.type);
            fn = this.coerce(e, f.type, v.init.pos, `the field ${f.name}`);
          }
          initSlots = Math.max(initSlots, ctx.maxSlots);
          const key = f.key;
          if (f.isStatic) {
            cls.staticInits.push((fr) => { cls.statics[f.name] = fn(fr); });
          } else {
            cls.instanceInits.push((fr) => { fr.t.f[key] = fn(fr); });
          }
        });
      }
    }
    cls.initSlots = initSlots;
    for (const ms of cls.methods.values()) {
      for (const m of ms) {
        if (m.decl && m.decl.body) this.guard(() => this.compileMethod(cls, m));
      }
    }
    for (const c of cls.ctors) this.guard(() => this.compileCtor(cls, c));
  }

  compileMethod(cls, m) {
    const ctx = new Ctx(cls, m, m.isStatic, 'method');
    for (const p of m.params) {
      const l = ctx.declare(p.name, p.type, p.pos, p.final);
      ctx.assign(l);
    }
    const body = this.blockBody(m.decl.body.body, ctx);
    if (!isVoid(m.ret) && body.c) {
      this.err(new CompileError(`Missing return: ${m.name}() must return ${an(typeStr(m.ret))}`, m.decl.body.endPos,
        `Add a return statement before the closing }, like: return ${this.sampleValue(m.ret)};`));
    }
    m.body = body.f;
    m.nlocals = ctx.maxSlots;
  }

  sampleValue(t) {
    if (isBool(t)) return 'true';
    if (isString(t)) return '"text"';
    if (t.k === 'prim') return t.n === 'char' ? "'a'" : '0';
    return 'something';
  }

  compileCtor(cls, ctor) {
    const ctx = new Ctx(cls, ctor, false, 'ctor');
    const decl = ctor.decl;
    for (const p of ctor.params) {
      const l = ctx.declare(p.name, p.type, p.pos, p.final);
      ctx.assign(l);
    }
    const stmts = decl ? decl.body.body : [];
    let rest = stmts;
    let callF;
    let skipInits = false;
    const first = stmts[0];
    const sup = cls.superclass;
    if (first && first.k === 'Expr' && first.e.k === 'CtorCall') {
      rest = stmts.slice(1);
      const cc = first.e;
      const target = cc.kind === 'this' ? cls : sup;
      if (cc.kind === 'this') skipInits = true;
      else this.features.add('super-ctor');
      callF = this.guard(() => {
        const args = cc.args.map((a) => this.ex(a, ctx));
        const picked = this.pickMethod(target.ctors, args, cc.pos, `${target.name}'s constructor`, target);
        const k = target.ctors.find((c) => c.sig === picked.sig);
        if (k === ctor) this.fail('A constructor cannot call itself with this(...)', cc.pos);
        this.checkAccess(k, ctx, cc.pos);
        const argF = this.argFns(picked, args, null);
        return (fr) => { R.rt.invoke(k, fr.t, argF.map((f) => f(fr))); };
      });
    } else if (sup) {
      const k = sup.ctors.find((c) => c.params.length === 0);
      if (!k) {
        const pos = decl ? decl.pos : cls.decl.namePos;
        const example = sup.ctors[0];
        this.err(new CompileError(
          decl ? `This constructor must start by calling super(...), because ${sup.name} has no constructor without parameters`
            : `${cls.name} needs a constructor that calls super(...), because ${sup.name}'s constructor needs arguments`,
          pos,
          example ? `${sup.name}'s constructor takes (${example.params.map((p) => typeStr(p.type) + ' ' + p.name).join(', ')}). Call it first, like: super(${example.params.map((p) => p.name).join(', ')});` : null));
      } else if (!(k.native && k.owner === this.Object)) {
        callF = (fr) => { R.rt.invoke(k, fr.t, []); };
      }
    }
    for (const s of rest) {
      if (s.k === 'Expr' && s.e.k === 'CtorCall') {
        this.err(new CompileError(`${s.e.kind}(...) must be the very first line in the constructor`, s.pos));
      }
    }
    const body = this.blockBody(rest, ctx);
    const inits = cls.instanceInits;
    const bodyF = body.f;
    const initSlots = cls.initSlots || 0;
    ctor.body = (fr) => {
      if (callF) callF(fr);
      if (!skipInits && inits.length) {
        const ifr = { l: new Array(initSlots), t: fr.t, line: fr.line };
        for (const i of inits) i(ifr);
      }
      return bodyF(fr);
    };
    ctor.nlocals = ctx.maxSlots;
  }

  findMain(units) {
    const mains = [];
    for (const c of this.userClasses) {
      for (const m of c.methods.get('main') || []) {
        if (m.isStatic && m.params.length === 1 && sameType(m.params[0].type, arrayT(classT(this.String))) && isVoid(m.ret)) {
          mains.push(m);
        }
      }
    }
    if (!mains.length) {
      const anyMain = this.userClasses.flatMap((c) => c.methods.get('main') || [])[0];
      const pos = anyMain ? anyMain.decl.pos : (this.userClasses[0]?.decl.namePos ?? { file: units[0]?.file, line: 1, col: 1 });
      this.err(new CompileError(anyMain ? 'main must be written exactly as: public static void main(String[] args)' : 'There is no main method, so the program has nowhere to start', pos,
        'Add this inside your Main class: public static void main(String[] args) { ... }'));
      return;
    }
    this.main = mains.find((m) => m.owner.name === 'Main') || mains.find((m) => m.owner.file === 'Main.java') || mains[0];
  }

  // ---------- conversions ----------
  coerce(e, to, pos, what) {
    if (isVoid(e.t)) this.fail(`This method call doesn't return anything (void), so it can't be used as a value`, pos);
    if (!isAssignable(e.t, to, e.c)) {
      this.fail(this.mismatchMessage(e.t, to, what), pos, this.mismatchHint(e.t, to, e));
    }
    return this.convFn(e, to);
  }

  mismatchMessage(from, to, what) {
    if (isPrim(from) && isPrim(to) && isNumericPrim(from) && isNumericPrim(to)) {
      return `Possible loss of precision: ${an(typeStr(from))} doesn't fit into ${what ? what + ' (' + an(typeStr(to)) + ')' : an(typeStr(to))}`;
    }
    return `Type mismatch: ${what ? what + ' needs' : 'expected'} ${an(typeStr(to))}, but this is ${an(typeStr(from))}`;
  }

  mismatchHint(from, to, e) {
    if (isNumericPrim(from) && isNumericPrim(to)) {
      if (to.n === 'int' && from.n === 'double') return 'Use a double variable instead, or cast it: (int) value  (this drops the decimals).';
      if (to.n === 'int' && from.n === 'long') return 'Cast it with (int) if you know the number is small enough.';
      return `Cast it with (${to.n}) if that's what you want.`;
    }
    if (isString(from) && to.k === 'prim') {
      if (to.n === 'int') return 'To turn text into a number, use Integer.parseInt(text). Or remove the quotes.';
      if (to.n === 'double') return 'To turn text into a number, use Double.parseDouble(text). Or remove the quotes.';
      if (to.n === 'char') return "A char uses single quotes: 'a'. Double quotes make a String.";
      if (to.n === 'boolean') return 'Write true or false without quotes.';
    }
    if (isString(to) && from.k === 'prim') {
      if (from.n === 'char') return 'Use double quotes for a String: "a".';
      return 'Put the value in quotes, or convert it with String.valueOf(value) or "" + value.';
    }
    if (from.k === 'class' && to.k === 'class' && isSubclass(to.cls, from.cls)) {
      return `Not every ${from.cls.name} is a ${to.cls.name}. If you're sure, cast it: (${to.cls.name}) value`;
    }
    if (from.k === 'prim' && to.k === 'class' && UNBOX[to.cls.name] && UNBOX[to.cls.name] !== from.n) {
      return `A ${from.n} can only be stored automatically in ${BOX[from.n]}.`;
    }
    return null;
  }

  convFn(e, to) {
    const from = e.t;
    const f = e.f;
    if (to.k === 'prim') {
      if (from.k === 'prim') {
        const c = primConv(from.n, to.n);
        return c ? (fr) => c(f(fr)) : f;
      }
      // unboxing
      const u = unboxedPrim(from);
      const c = primConv(u.n, to.n);
      const npe = () => R.rt.throwNew('NullPointerException', `Can't turn null into ${an(to.n)}`);
      return (fr) => {
        const v = f(fr);
        if (v === null) npe();
        return c ? c(v.v) : v.v;
      };
    }
    if (from.k === 'prim') {
      // boxing
      let kind;
      if (to.k === 'class' && UNBOX[to.cls.name]) kind = to.cls.name;
      else kind = BOX[from.n];
      const c = primConv(from.n, UNBOX[kind]);
      return c ? (fr) => box(kind, c(f(fr))) : (fr) => box(kind, f(fr));
    }
    return f;
  }

  // ---------- method lookup ----------
  applicable(m, args, phase, map) {
    const ps = m.params.map((p) => subst(p.type, map));
    if (phase < 3) {
      if (ps.length !== args.length) return false;
      return args.every((a, i) => !isVoid(a.t) && isAssignable(a.t, ps[i], a.c, phase === 2));
    }
    if (!m.varargs || args.length < ps.length - 1) return false;
    for (let i = 0; i < ps.length - 1; i++) if (!isAssignable(args[i].t, ps[i], args[i].c)) return false;
    const elem = ps[ps.length - 1].elem;
    for (let i = ps.length - 1; i < args.length; i++) if (isVoid(args[i].t) || !isAssignable(args[i].t, elem, args[i].c)) return false;
    return true;
  }

  pickMethod(cands, args, pos, what, cls, map = null, name = null) {
    for (const phase of [1, 2, 3]) {
      const app = cands.filter((m) => this.applicable(m, args, phase, map));
      if (app.length) {
        let best = app[0];
        for (const m of app) {
          const more = m.params.every((p, i) => best.params[i] && isAssignable(subst(p.type, map), subst(best.params[i].type, map), undefined, phase > 1));
          if (more) best = m;
        }
        if (phase === 3) best._varargsCall = true;
        return Object.assign(Object.create(Object.getPrototypeOf(best)), best, { _phase: phase });
      }
    }
    const given = '(' + args.map((a) => typeStr(a.t)).join(', ') + ')';
    if (!cands.length) this.fail(`${what} doesn't exist`, pos);
    if (cands.length === 1) {
      const m = cands[0];
      const ps = m.params.map((p) => subst(p.type, map));
      if (ps.length !== args.length && !m.varargs) {
        this.fail(`${what} takes ${ps.length} argument${ps.length === 1 ? '' : 's'}${ps.length ? ' (' + ps.map(typeStr).join(', ') + ')' : ''}, but you gave ${args.length}`, pos);
      }
      const bad = args.findIndex((a, i) => ps[i] && !isAssignable(a.t, ps[i], a.c));
      if (bad >= 0) {
        this.fail(`Argument ${bad + 1} of ${what} should be ${an(typeStr(ps[bad]))}, but you gave ${an(typeStr(args[bad].t))}`, args[bad].pos || pos, this.mismatchHint(args[bad].t, ps[bad], args[bad]));
      }
    }
    const options = cands.map((m) => (name || m.name) + '(' + m.params.map((p) => typeStr(subst(p.type, map))).join(', ') + ')').slice(0, 6);
    this.fail(`No version of ${what} accepts ${given}`, pos, 'Available: ' + options.join(', '));
  }

  argFns(m, args, map) {
    const ps = m.params.map((p) => subst(p.type, map));
    if (m._phase === 3) {
      const fixed = ps.length - 1;
      const fns = args.slice(0, fixed).map((a, i) => this.convFn(a, ps[i]));
      const elem = ps[fixed].elem;
      const rest = args.slice(fixed).map((a) => this.convFn(a, elem));
      fns.push((fr) => new JArray(elem, rest.map((f) => f(fr))));
      return fns;
    }
    return args.map((a, i) => this.convFn(a, ps[i]));
  }

  checkAccess(member, ctx, pos) {
    if (member.access === 'private' && member.owner !== ctx.cls) {
      const isField = member instanceof FieldInfo;
      const name = isField ? member.name : member.isCtor ? `the constructor ${member.owner.name}(...)` : `${member.name}()`;
      let hint = null;
      if (isField) {
        const cap = member.name[0].toUpperCase() + member.name.slice(1);
        const getter = member.owner.vtable.get('get' + cap + '()') || member.owner.vtable.get('is' + cap + '()');
        hint = getter ? `Use the getter instead: ${getter.name}()` :
          ctx.cls && isSubclass(ctx.cls, member.owner) ? `Subclasses can't see private fields. Make it protected in ${member.owner.name}, or add a getter.` :
            `Private fields can only be used inside ${member.owner.name}. Add a public getter like get${cap}().`;
      }
      this.fail(`${isField ? "'" + name + "'" : name} is private in ${member.owner.name}, so ${ctx.cls ? ctx.cls.name : 'this code'} can't use it`, pos, hint);
    }
  }

  // ---------- statements ----------
  blockBody(stmts, ctx) {
    const saved = ctx.push();
    const fns = [];
    let completes = true;
    let reportedUnreachable = false;
    for (const s of stmts) {
      if (!completes && !reportedUnreachable) {
        reportedUnreachable = true;
        this.err(new CompileError('Unreachable code: this line can never run', s.pos, 'A return, break, continue or throw above it always jumps away first.'));
      }
      const r = this.guard(() => this.st(s, ctx));
      if (r) {
        fns.push(r.f);
        if (!r.c) { completes = false; ctx.da = null; }
      }
    }
    ctx.pop(saved);
    let f;
    if (fns.length === 0) f = () => 0;
    else if (fns.length === 1) f = fns[0];
    else {
      f = (fr) => {
        for (let i = 0; i < fns.length; i++) {
          const r = fns[i](fr);
          if (r) return r;
        }
        return 0;
      };
    }
    return { f, c: completes };
  }

  st(s, ctx) {
    const r = this.stInner(s, ctx);
    const line = s.pos ? s.pos.line : 0;
    const inner = r.f;
    if (s.k === 'Block' || s.k === 'Empty') return r;
    return { f: (fr) => { fr.line = line; return inner(fr); }, c: r.c };
  }

  cond(e, ctx, what) {
    const c = this.ex(e, ctx);
    const u = unboxedPrim(c.t);
    if (!u || u.n !== 'boolean') {
      let hint = null;
      if (e.k === 'Assign' && e.op === '=') hint = 'Did you mean == (compare) instead of = (assign)?';
      else if (isNumericPrim(c.t)) hint = 'Compare it to something, like x > 0 or x == 5.';
      this.fail(`The ${what} condition must be true or false (a boolean), but this is ${an(typeStr(c.t))}`, e.pos, hint);
    }
    return this.convFn(c, T.boolean);
  }

  stInner(s, ctx) {
    switch (s.k) {
      case 'Block': return this.blockBody(s.body, ctx);
      case 'Empty': return { f: () => 0, c: true };
      case 'Local': return this.stLocal(s, ctx);
      case 'Expr': {
        if (s.e.k === 'CtorCall') this.fail(`${s.e.kind}(...) can only be used as the first line of a constructor`, s.pos);
        const e = this.ex(s.e, ctx, null, true);
        const f = e.f;
        return { f: (fr) => { f(fr); return 0; }, c: true };
      }
      case 'If': {
        this.features.add('if');
        const cf = this.cond(s.cond, ctx, 'if');
        const before = ctx.snapshot();
        const t = this.stScoped(s.then, ctx);
        const daThen = ctx.da;
        ctx.da = before === null ? null : new Set(before);
        let e = null;
        if (s.else) {
          this.features.add('else');
          if (s.else.k === 'If') this.features.add('else-if');
          e = this.stScoped(s.else, ctx);
        }
        const daElse = ctx.da;
        ctx.da = intersect(daThen, daElse);
        if (!t.c && !(e ? e.c : true)) ctx.da = null;
        const tf = t.f;
        const ef = e ? e.f : null;
        return {
          f: ef ? (fr) => (cf(fr) ? tf(fr) : ef(fr)) : (fr) => (cf(fr) ? tf(fr) : 0),
          c: t.c || (e ? e.c : true)
        };
      }
      case 'While': {
        this.features.add('while');
        const cf = this.cond(s.cond, ctx, 'while');
        const constTrue = s.cond.k === 'Lit' && s.cond.v === true;
        const before = ctx.snapshot();
        const b = this.loopBody(s.body, ctx);
        ctx.da = before;
        const bf = b.f;
        return {
          f: (fr) => {
            const rt = R.rt;
            while (cf(fr)) {
              if (--rt.budget < 0) rt.timeout();
              const r = bf(fr);
              if (r === BRK) break;
              if (r === RET) return RET;
            }
            return 0;
          },
          c: !constTrue || b.hasBreak
        };
      }
      case 'DoWhile': {
        this.features.add('do-while');
        const b = this.loopBody(s.body, ctx);
        const cf = this.cond(s.cond, ctx, 'do-while');
        const constTrue = s.cond.k === 'Lit' && s.cond.v === true;
        const bf = b.f;
        return {
          f: (fr) => {
            const rt = R.rt;
            do {
              if (--rt.budget < 0) rt.timeout();
              const r = bf(fr);
              if (r === BRK) break;
              if (r === RET) return RET;
            } while (cf(fr));
            return 0;
          },
          c: !constTrue || b.hasBreak
        };
      }
      case 'For': {
        this.features.add('for');
        const saved = ctx.push();
        const inits = s.init.map((i) => this.st(i, ctx).f);
        const cf = s.cond ? this.cond(s.cond, ctx, 'for') : () => true;
        const constTrue = !s.cond || (s.cond.k === 'Lit' && s.cond.v === true);
        const before = ctx.snapshot();
        const b = this.loopBody(s.body, ctx);
        const ups = s.update.map((u) => this.ex(u, ctx, null, true).f);
        ctx.da = before;
        ctx.pop(saved);
        const bf = b.f;
        return {
          f: (fr) => {
            const rt = R.rt;
            for (let i = 0; i < inits.length; i++) inits[i](fr);
            for (; cf(fr);) {
              if (--rt.budget < 0) rt.timeout();
              const r = bf(fr);
              if (r === BRK) break;
              if (r === RET) return RET;
              for (let i = 0; i < ups.length; i++) ups[i](fr);
            }
            return 0;
          },
          c: !constTrue || b.hasBreak
        };
      }
      case 'ForEach': return this.stForEach(s, ctx);
      case 'Return': {
        const m = ctx.method;
        if (ctx.kind === 'init') this.fail("return can't be used here", s.pos);
        const want = m.isCtor ? T.void : m.ret;
        if (isVoid(want)) {
          if (s.e) this.fail(m.isCtor ? "A constructor can't return a value" : `${m.name}() is void, so it can't return a value`, s.e.pos,
            m.isCtor ? null : `Change void to the type you want to return, or remove the value after return.`);
          ctx.da = null;
          return { f: () => RET, c: false };
        }
        if (!s.e) this.fail(`${m.name}() must return ${an(typeStr(want))}. Add a value after return.`, s.pos);
        const e = this.ex(s.e, ctx, want);
        const vf = this.coerce(e, want, s.e.pos, `the return value of ${m.name}()`);
        ctx.da = null;
        return { f: (fr) => { fr.rv = vf(fr); return RET; }, c: false };
      }
      case 'Break': {
        const b = ctx.breakables[ctx.breakables.length - 1];
        if (!b) this.fail('break can only be used inside a loop or a switch', s.pos);
        b.hasBreak = true;
        this.features.add('break');
        ctx.da = null;
        return { f: () => BRK, c: false };
      }
      case 'Continue': {
        const b = [...ctx.breakables].reverse().find((x) => x.loop);
        if (!b) this.fail('continue can only be used inside a loop', s.pos);
        this.features.add('continue');
        ctx.da = null;
        return { f: () => CNT, c: false };
      }
      case 'Throw': {
        const e = this.ex(s.e, ctx);
        if (!(e.t.k === 'class' && isSubclass(e.t.cls, this.Throwable)) && e.t.k !== 'null') {
          this.fail(`You can only throw exceptions, not ${an(typeStr(e.t))}`, s.e.pos, 'For example: throw new IllegalArgumentException("height must be positive");');
        }
        this.features.add('throw');
        const f = e.f;
        ctx.da = null;
        return {
          f: (fr) => {
            const v = f(fr);
            if (v === null) R.rt.throwNew('NullPointerException', 'Cannot throw null');
            throw new JavaThrow(v);
          },
          c: false
        };
      }
      case 'Switch': return this.stSwitch(s, ctx);
      case 'Try': return this.stTry(s, ctx);
    }
    this.fail('Unsupported statement', s.pos);
  }

  stScoped(s, ctx) {
    if (s.k === 'Local') this.fail('A variable declared here would disappear right away. Put it inside { } or move it above.', s.pos);
    const saved = ctx.push();
    const r = this.st(s, ctx);
    ctx.pop(saved);
    return r;
  }

  loopBody(s, ctx) {
    const entry = { loop: true, hasBreak: false };
    ctx.breakables.push(entry);
    ctx.loopDepth++;
    if (ctx.loopDepth > 1) this.features.add('nested-loop');
    const r = this.stScoped(s, ctx);
    ctx.loopDepth--;
    ctx.breakables.pop();
    return { f: r.f, hasBreak: entry.hasBreak };
  }

  stLocal(s, ctx) {
    const fns = [];
    for (const v of s.vars) {
      let t;
      let init = null;
      if (s.type.name === 'var') {
        if (!v.init) this.fail("'var' needs a starting value so Java can work out the type", v.pos);
        if (v.init.k === 'ArrayInit') this.fail("'var' can't be used with { } array values. Write the type, like int[]", v.pos);
        const e = this.ex(v.init, ctx);
        if (e.t.k === 'null') this.fail("'var' can't be null, because then Java can't tell the type", v.pos);
        if (isVoid(e.t)) this.fail("This method returns nothing (void), so it can't be stored", v.pos);
        t = e.t;
        init = e.f;
      } else {
        t = this.resolveType(s.type);
        for (let i = 0; i < v.dims; i++) t = arrayT(t);
      }
      if (isVoid(t)) this.fail("A variable can't have type void", v.pos);
      this.features.add('var:' + typeStr(t));
      if (/^[A-Z]/.test(v.name) && v.name.length > 1 && v.name !== v.name.toUpperCase()) {
        this.warn(`Variable names usually start with a lowercase letter: ${v.name[0].toLowerCase() + v.name.slice(1)}`, v.pos);
      }
      const local = ctx.declare(v.name, t, v.pos, s.final);
      if (v.init && !init) {
        if (v.init.k === 'ArrayInit') {
          if (t.k !== 'array') this.fail(`{ ... } values can only be used for arrays, but ${v.name} is ${an(typeStr(t))}`, v.init.pos);
          init = this.arrayInit(v.init, t, ctx);
        } else {
          const e = this.ex(v.init, ctx, t);
          init = this.coerce(e, t, v.init.pos, `the variable ${v.name}`);
        }
      }
      if (init) {
        ctx.assign(local);
        local.assignedOnce = true;
        const slot = local.slot;
        const f = init;
        fns.push((fr) => { fr.l[slot] = f(fr); });
      }
    }
    if (fns.length === 1) { const f = fns[0]; return { f: (fr) => { f(fr); return 0; }, c: true }; }
    return { f: (fr) => { for (const f of fns) f(fr); return 0; }, c: true };
  }

  iterableElem(t) {
    if (t.k === 'array') return t.elem;
    if (t.k === 'class' && isSubclass(t.cls, this.reg.get('Iterable'))) {
      const map = receiverMap(t);
      if (map) return Object.values(map)[0];
      return classT(this.Object);
    }
    return null;
  }

  stForEach(s, ctx) {
    this.features.add('for-each');
    const it = this.ex(s.iter, ctx);
    const elem = this.iterableElem(it.t);
    if (!elem) {
      this.fail(`A for-each loop needs an array or a list, but this is ${an(typeStr(it.t))}`, s.iter.pos,
        isPrim(it.t) ? 'To count, use a normal loop: for (int i = 0; i < n; i++)' : null);
    }
    const saved = ctx.push();
    const vt = s.type.name === 'var' ? elem : this.resolveType(s.type);
    if (!isAssignable(elem, vt)) {
      this.fail(`The items are ${typeStr(elem)}, so the loop variable can't be ${an(typeStr(vt))}`, s.type.pos, `Write: for (${typeStr(elem)} ${s.name} : ...)`);
    }
    const local = ctx.declare(s.name, vt, s.namePos);
    ctx.assign(local);
    const conv = this.convFn({ t: elem, f: (x) => x }, vt);
    const before = ctx.snapshot();
    const b = this.loopBody(s.body, ctx);
    ctx.da = before;
    ctx.pop(saved);
    const slot = local.slot;
    const itf = it.f;
    const bf = b.f;
    const text = exprText(s.iter);
    const isArray = it.t.k === 'array';
    return {
      f: (fr) => {
        const rt = R.rt;
        const coll = itf(fr);
        if (coll === null) rt.throwNew('NullPointerException', `Cannot loop over "${text}" because it is null`);
        if (isArray) {
          const data = coll.data;
          const n = data.length;
          for (let i = 0; i < n; i++) {
            if (--rt.budget < 0) rt.timeout();
            fr.l[slot] = conv(data[i]);
            const r = bf(fr);
            if (r === BRK) break;
            if (r === RET) return RET;
          }
        } else {
          const list = coll.list;
          const mod = coll.mod;
          for (let i = 0; i < list.length; i++) {
            if (--rt.budget < 0) rt.timeout();
            fr.l[slot] = conv(list[i]);
            const r = bf(fr);
            if (coll.mod !== mod) {
              rt.throwNew('ConcurrentModificationException', `The list "${text}" was changed while a for-each loop was going through it. Use an index loop, or change the list after the loop.`);
            }
            if (r === BRK) break;
            if (r === RET) return RET;
          }
        }
        return 0;
      },
      c: true
    };
  }

  stSwitch(s, ctx) {
    this.features.add('switch');
    const d = this.ex(s.disc, ctx);
    const u = unboxedPrim(d.t);
    let kind;
    if (u && ['int', 'char', 'short', 'byte'].includes(u.n)) kind = u;
    else if (isString(d.t)) kind = d.t;
    else this.fail(`switch works with int, char or String, but this is ${an(typeStr(d.t))}`, s.disc.pos, u && (u.n === 'double' || u.n === 'boolean') ? 'Use if / else if instead.' : null);
    const df = this.convFn(d, kind);
    const entry = { loop: false, hasBreak: false };
    ctx.breakables.push(entry);
    const saved = ctx.push();
    const map = new Map();
    let defaultIdx;
    const before = ctx.snapshot();
    const flat = [];
    const bodies = [];
    let lastCompletes = true;
    let allArrowsAbrupt = true;
    s.cases.forEach((cs, ci) => {
      const start = flat.length;
      if (cs.labels === null) {
        if (defaultIdx !== undefined) this.fail('A switch can only have one default', cs.pos);
        defaultIdx = s.arrow ? ci : start;
      } else {
        for (const lab of cs.labels) {
          const le = this.ex(lab, ctx);
          if (le.c === undefined) this.fail('A case label must be a fixed value, like 3, \'a\' or "text"', lab.pos);
          if (!isAssignable(le.t, kind, le.c)) this.fail(`This case is ${an(typeStr(le.t))}, but the switch is on ${an(typeStr(kind))}`, lab.pos);
          const val = isPrim(kind) && isPrim(le.t) && le.t.n === 'char' ? le.c : le.c;
          if (map.has(val)) this.fail(`Duplicate case ${typeof val === 'string' ? JSON.stringify(val) : val}`, lab.pos);
          map.set(val, s.arrow ? ci : start);
        }
      }
      if (s.arrow) {
        ctx.da = before === null ? null : new Set(before);
        const saved2 = ctx.push();
        const r = this.blockBody(cs.body, ctx);
        ctx.pop(saved2);
        bodies.push(r.f);
        if (r.c) allArrowsAbrupt = false;
      } else {
        ctx.da = before === null ? null : new Set(before);
        for (const st of cs.body) {
          const r = this.guard(() => this.st(st, ctx));
          if (r) { flat.push(r.f); lastCompletes = r.c; }
        }
        if (!cs.body.length) lastCompletes = true;
      }
    });
    ctx.pop(saved);
    ctx.breakables.pop();
    ctx.da = before;
    const text = exprText(s.disc);
    const npe = () => R.rt.throwNew('NullPointerException', `Cannot switch on "${text}" because it is null`);
    const isStr = isString(kind);
    let f;
    if (s.arrow) {
      f = (fr) => {
        const v = df(fr);
        if (isStr && v === null) npe();
        let i = map.get(v);
        if (i === undefined) i = defaultIdx;
        if (i === undefined) return 0;
        const r = bodies[i](fr);
        return r === BRK ? 0 : r;
      };
    } else {
      f = (fr) => {
        const v = df(fr);
        if (isStr && v === null) npe();
        let i = map.get(v);
        if (i === undefined) i = defaultIdx;
        if (i === undefined) return 0;
        for (; i < flat.length; i++) {
          const r = flat[i](fr);
          if (r === BRK) return 0;
          if (r) return r;
        }
        return 0;
      };
    }
    const completes = s.arrow ? !(defaultIdx !== undefined && allArrowsAbrupt && !entry.hasBreak) : !(defaultIdx !== undefined && !lastCompletes && !entry.hasBreak);
    if (!completes) ctx.da = null;
    return { f, c: completes };
  }

  stTry(s, ctx) {
    this.features.add('try');
    const before = ctx.snapshot();
    const tb = this.blockBody(s.block.body, ctx);
    const daTry = ctx.da;
    const catches = [];
    let anyCatchCompletes = false;
    for (const c of s.catches) {
      ctx.da = before === null ? null : new Set(before);
      const types = c.types.map((tn) => {
        const t = this.resolveType(tn);
        if (t.k !== 'class' || !isSubclass(t.cls, this.Throwable)) this.fail(`You can only catch exceptions, not ${typeStr(t)}`, tn.pos);
        return t;
      });
      const saved = ctx.push();
      const local = ctx.declare(c.name, types.length === 1 ? types[0] : classT(this.reg.get('Exception')), c.namePos);
      ctx.assign(local);
      const body = this.blockBody(c.body.body, ctx);
      ctx.pop(saved);
      if (body.c) anyCatchCompletes = true;
      catches.push({ types, slot: local.slot, f: body.f });
    }
    let fin = null;
    let finCompletes = true;
    if (s.fin) {
      ctx.da = before === null ? null : new Set(before);
      const r = this.blockBody(s.fin.body, ctx);
      fin = r.f;
      finCompletes = r.c;
    }
    ctx.da = catches.length ? before : daTry;
    const tf = tb.f;
    const f = (fr) => {
      try {
        return tf(fr);
      } catch (e) {
        let ex = e;
        if (e instanceof RangeError) ex = R.rt.makeThrow('StackOverflowError', 'Too many nested method calls. Does a method call itself forever?');
        if (!(ex instanceof JavaThrow)) throw e;
        for (const c of catches) {
          if (c.types.some((t) => isInstance(ex.obj, t))) {
            fr.l[c.slot] = ex.obj;
            return c.f(fr);
          }
        }
        throw ex;
      } finally {
        if (fin) {
          const r = fin(fr);
          if (r) return r; // eslint-disable-line no-unsafe-finally
        }
      }
    };
    const completes = finCompletes && (tb.c || anyCatchCompletes);
    if (!completes) ctx.da = null;
    return { f, c: completes };
  }

  arrayInit(node, t, ctx) {
    this.features.add('array-init');
    const elem = t.elem;
    const fns = node.elems.map((el) => {
      if (el.k === 'ArrayInit') {
        if (elem.k !== 'array') this.fail(`Too many { } levels: the items here are ${typeStr(elem)}`, el.pos);
        return this.arrayInit(el, elem, ctx);
      }
      const e = this.ex(el, ctx, elem);
      return this.coerce(e, elem, el.pos, 'each array item');
    });
    return (fr) => new JArray(elem, fns.map((f) => f(fr)));
  }

  // ---------- expressions ----------
  // returns {t, f, c?}; when stmt is true the value may be discarded
  ex(e, ctx, expected = null, stmt = false) {
    const r = this.exInner(e, ctx, expected, stmt);
    r.pos = e.pos;
    return r;
  }

  exInner(e, ctx, expected, stmt) {
    switch (e.k) {
      case 'Lit': {
        const t = this.litType(e);
        let v = e.v;
        if (e.ty === 'int' && (v > 2147483647 || v < -2147483648)) {
          this.fail(`${e.raw} is too big for an int`, e.pos, 'Add L at the end to make it a long: ' + e.raw + 'L');
        }
        if (e.ty === 'float') v = Math.fround(v);
        if (e.ty === 'String') this.features.add('string');
        return { t, f: () => v, c: e.ty === 'null' ? undefined : v };
      }
      case 'Paren': return this.ex(e.e, ctx, expected);
      case 'Name': return this.exName(e, ctx);
      case 'This': {
        if (ctx.isStatic) this.fail("'this' can't be used in a static method, because there is no object", e.pos);
        this.features.add('this');
        return { t: classT(ctx.cls), f: (fr) => fr.t };
      }
      case 'Super': this.fail("'super' must be followed by .method() or .field", e.pos); break;
      case 'Field': return this.exField(e, ctx);
      case 'Index': return this.exIndex(e, ctx);
      case 'Call': return this.exCall(e, ctx);
      case 'New': return this.exNew(e, ctx, expected);
      case 'NewArray': return this.exNewArray(e, ctx);
      case 'ArrayInit': this.fail('Array values in { } can only be used when declaring an array', e.pos); break;
      case 'Unary': return this.exUnary(e, ctx);
      case 'Postfix': return this.exIncDec(e.e, e.op, false, ctx, e.pos);
      case 'Binary': return this.exBinary(e, ctx);
      case 'Assign': return this.exAssign(e, ctx);
      case 'Cond': return this.exCond(e, ctx, expected);
      case 'Cast': return this.exCast(e, ctx);
      case 'InstanceOf': return this.exInstanceOf(e, ctx);
      case 'CtorCall': this.fail(`${e.kind}(...) can only be used as the first line of a constructor`, e.pos); break;
    }
    this.fail('Unsupported expression', e.pos);
  }

  // Name might be a local, a field, or a class (when used before a dot)
  resolveName(e, ctx) {
    const local = ctx.lookup(e.name);
    if (local) return { local };
    if (ctx.cls) {
      const f = ctx.cls.findField(e.name);
      if (f) return { field: f };
    }
    const cls = this.reg.get(e.name);
    if (cls) {
      if (JAVA_UTIL.has(cls.name) && cls.builtin) this.resolveType({ name: cls.name, dims: 0, pos: e.pos });
      if (cls.name === 'World') this.features.add('world');
      return { cls };
    }
    return {};
  }

  unknownName(e, ctx) {
    const names = [...ctx.allLocals(), ...(ctx.cls ? ctx.cls.allFieldNames() : [])];
    const s = suggest(e.name, names) || suggest(e.name, [...this.reg.keys()].filter((n) => !this.reg.get(n).builtin || ['System', 'Math', 'World', 'String', 'Integer'].includes(n)));
    let hint = didYouMean(s);
    if (!hint && /^[A-Z]/.test(e.name)) hint = 'If this is a class, check that it exists and is spelled the same way.';
    if (!hint) hint = `Declare it first, for example: int ${e.name} = 0;`;
    if (ctx.fieldInit && ctx.isStatic === false && !s) hint = null;
    this.fail(`Cannot find a variable called '${e.name}'`, e.pos, hint);
  }

  exName(e, ctx) {
    const r = this.resolveName(e, ctx);
    if (r.local) {
      const l = r.local;
      if (!ctx.isAssigned(l)) {
        this.fail(`The variable '${l.name}' might not have a value yet`, e.pos, `Give it a starting value when you declare it, like ${typeStr(l.type)} ${l.name} = ${this.sampleValue(l.type)};`);
      }
      const slot = l.slot;
      return { t: l.type, f: (fr) => fr.l[slot] };
    }
    if (r.field) return this.fieldAccess(r.field, null, ctx, e.pos, e.name);
    if (r.cls) this.fail(`${e.name} is a class, not a value`, e.pos, `To make an object, use new ${e.name}(...)`);
    this.unknownName(e, ctx);
  }

  // field read on implicit this / static
  fieldAccess(f, objF, ctx, pos, text) {
    this.checkAccess(f, ctx, pos);
    if (f.isStatic) {
      const owner = f.owner;
      if (f.constValue !== undefined) {
        const v = f.constValue;
        return { t: f.type, f: () => v, c: v, field: f };
      }
      const name = f.name;
      return { t: f.type, f: () => owner.statics[name], field: f };
    }
    if (!objF) {
      if (ctx.isStatic) {
        this.fail(`Can't use the field '${f.name}' inside a static method`, pos,
          `'${f.name}' belongs to each object. Create an object first (like ${f.owner.name} x = new ${f.owner.name}(); then x.${f.name}), or make the field static.`);
      }
      const key = f.key;
      return { t: f.type, f: (fr) => fr.t.f[key], field: f, implicitThis: true };
    }
    const key = f.key;
    return {
      t: f.type,
      f: (fr) => {
        const o = objF(fr);
        if (o === null) R.rt.throwNew('NullPointerException', `Cannot read field "${f.name}" because "${text}" is null`);
        return o.f[key];
      },
      field: f
    };
  }

  // the object part of a.b / a.b() may be a class name
  exTarget(obj, ctx) {
    if (obj.k === 'Name') {
      const r = this.resolveName(obj, ctx);
      if (!r.local && !r.field && r.cls) return { cls: r.cls };
      if (!r.local && !r.field && !r.cls) {
        if (obj.name === 'system' || obj.name === 'SYSTEM') this.fail(`Cannot find '${obj.name}'`, obj.pos, "Did you mean 'System'? Java is case-sensitive.");
        if (obj.name === 'math') this.fail("Cannot find 'math'", obj.pos, "Did you mean 'Math'? Java is case-sensitive.");
        if (obj.name === 'world') this.fail("Cannot find 'world'", obj.pos, "Did you mean 'World'? Java is case-sensitive.");
      }
    }
    if (obj.k === 'Super') {
      if (ctx.isStatic) this.fail("'super' can't be used in a static method", obj.pos);
      return { sup: true, t: classT(ctx.cls.superclass || this.Object) };
    }
    return { v: this.ex(obj, ctx) };
  }

  exField(e, ctx) {
    const tgt = this.exTarget(e.obj, ctx);
    const text = exprText(e.obj);
    if (tgt.cls) {
      const f = tgt.cls.findField(e.name);
      if (!f) {
        const m = tgt.cls.findMethods(e.name);
        if (m.length) this.fail(`${e.name} is a method, so it needs parentheses: ${tgt.cls.name}.${e.name}(...)`, e.pos);
        this.fail(`${tgt.cls.name} has no static field called '${e.name}'`, e.pos, didYouMean(suggest(e.name, tgt.cls.allFieldNames())));
      }
      if (!f.isStatic) this.fail(`'${e.name}' belongs to each ${tgt.cls.name} object, not to the class`, e.pos, `Use an object: myObject.${e.name}`);
      return this.fieldAccess(f, null, ctx, e.pos, text);
    }
    if (tgt.sup) {
      const f = tgt.t.cls.findField(e.name);
      if (!f) this.fail(`${tgt.t.cls.name} has no field called '${e.name}'`, e.pos);
      const key = f.key;
      this.checkAccess(f, ctx, e.pos);
      return { t: f.type, f: (fr) => fr.t.f[key], field: f };
    }
    const o = tgt.v;
    if (o.t.k === 'array') {
      if (e.name !== 'length') this.fail(`Arrays only have .length, not .${e.name}`, e.pos);
      this.features.add('array-length');
      const of = o.f;
      return {
        t: T.int,
        f: (fr) => {
          const a = of(fr);
          if (a === null) R.rt.throwNew('NullPointerException', `Cannot read the array length because "${text}" is null`);
          return a.data.length;
        },
        arrayLength: true
      };
    }
    if (o.t.k === 'prim') this.fail(`${text} is ${an(o.t.n)}, and you can't use . on ${an(o.t.n)}`, e.pos);
    if (o.t.k === 'null') this.fail("Can't use . on null", e.pos);
    const cls = o.t.cls;
    const f = cls.findField(e.name);
    if (!f) {
      if (cls.findMethods(e.name).length) {
        this.fail(`${e.name} is a method, so it needs parentheses: ${text}.${e.name}()`, e.pos);
      }
      this.fail(`${cls.name} has no field called '${e.name}'`, e.pos, didYouMean(suggest(e.name, cls.allFieldNames())));
    }
    return this.fieldAccess(f, o.f, ctx, e.pos, text);
  }

  exIndex(e, ctx) {
    const a = this.ex(e.arr, ctx);
    if (a.t.k !== 'array') {
      const hint = isString(a.t) ? 'For a character in a String, use .charAt(i)' :
        a.t.k === 'class' && (a.t.cls.name === 'ArrayList' || a.t.cls.name === 'List') ? 'For a list, use .get(i)' : null;
      this.fail(`[ ] only works on arrays, but ${exprText(e.arr)} is ${an(typeStr(a.t))}`, e.idxPos || e.pos, hint);
    }
    const i = this.ex(e.idx, ctx);
    const ip = unboxedPrim(i.t);
    if (!ip || !['int', 'short', 'char', 'byte'].includes(ip.n)) {
      this.fail(`An array index must be an int, but this is ${an(typeStr(i.t))}`, e.idx.pos, ip && ip.n === 'double' ? 'Cast it: (int) value' : null);
    }
    const af = a.f;
    const idf = this.convFn(i, T.int);
    const text = exprText(e.arr);
    return {
      t: a.t.elem,
      f: (fr) => {
        const arr = af(fr);
        const k = idf(fr);
        if (arr === null) R.rt.throwNew('NullPointerException', `Cannot load from array because "${text}" is null`);
        if (k < 0 || k >= arr.data.length) R.rt.throwNew('ArrayIndexOutOfBoundsException', `Index ${k} out of bounds for length ${arr.data.length}`);
        return arr.data[k];
      }
    };
  }

  exCall(e, ctx) {
    let cands;
    let mode; // 'implicit' | 'static' | 'super' | 'value'
    let recv = null;
    let map = null;
    let ownerName;
    const text = e.obj ? exprText(e.obj) : 'this';
    if (!e.obj) {
      cands = ctx.cls.findMethods(e.name);
      mode = 'implicit';
      ownerName = ctx.cls.name;
      if (!cands.length) {
        const hints = {
          println: 'Printing is done with System.out.println(...)',
          print: 'Printing is done with System.out.print(...)',
          printf: 'Use System.out.printf(...)',
          say: 'Did you mean World.say(...)?',
          add: 'Did you mean World.add(...)?',
          pause: 'Did you mean World.pause(...)?',
          block: 'Did you mean World.block(...)?',
          sqrt: 'Use Math.sqrt(...)', pow: 'Use Math.pow(...)', random: 'Use Math.random()'
        };
        const all = [];
        for (let c = ctx.cls; c; c = c.superclass) all.push(...c.methods.keys());
        this.fail(`Cannot find a method called ${e.name}(...) in ${ctx.cls.name}`, e.pos, hints[e.name] || didYouMean(suggest(e.name, all)) || `Write the method first: static void ${e.name}() { ... }`);
      }
    } else {
      const tgt = this.exTarget(e.obj, ctx);
      if (tgt.cls) {
        mode = 'static';
        cands = tgt.cls.findMethods(e.name);
        ownerName = tgt.cls.name;
        if (!cands.length) {
          const all = [];
          for (let c = tgt.cls; c; c = c.superclass) all.push(...c.methods.keys());
          let hint = didYouMean(suggest(e.name, all));
          if (tgt.cls.name === 'System' && e.name === 'println') hint = 'Use System.out.println(...)';
          this.fail(`${tgt.cls.name} has no method called ${e.name}(...)`, e.pos, hint);
        }
      } else if (tgt.sup) {
        mode = 'super';
        cands = tgt.t.cls.findMethods(e.name);
        ownerName = tgt.t.cls.name;
        if (!cands.length) this.fail(`${ownerName} has no method ${e.name}(...) to call with super`, e.pos);
        this.features.add('super-call');
      } else {
        recv = tgt.v;
        mode = 'value';
        const rt_ = recv.t;
        if (rt_.k === 'prim') {
          if (isVoid(rt_)) this.fail("That method returns nothing (void), so you can't call another method on its result", e.pos);
          this.fail(`${text} is ${an(rt_.n)}, and you can't call methods on ${an(rt_.n)}`, e.pos,
            e.name === 'length' ? null : `If you need text, use String.valueOf(${text}).${e.name}()`);
        }
        if (rt_.k === 'null') this.fail("Can't call a method on null", e.pos);
        if (rt_.k === 'array') {
          if (e.name === 'length') this.fail('Arrays use .length without parentheses', e.pos, `Write: ${text}.length`);
          cands = this.Object.findMethods(e.name);
          ownerName = typeStr(rt_);
          if (!cands.length) this.fail(`Arrays don't have a method ${e.name}(...)`, e.pos, e.name === 'size' ? `Use ${text}.length` : null);
        } else {
          const cls = rt_.cls;
          ownerName = cls.name;
          map = receiverMap(rt_);
          cands = cls.findMethods(e.name);
          if (!cands.length) {
            let hint = didYouMean(suggest(e.name, [...cls.vtable.keys()].map((k) => k.split('(')[0]).concat([...cls.methods.keys()])));
            if (isString(rt_) && e.name === 'size') hint = 'Strings use .length()';
            if (cls.findField(e.name)) hint = `${e.name} is a field, so don't use parentheses: ${text}.${e.name}`;
            if ((cls.name === 'ArrayList' || cls.name === 'List') && e.name === 'length') hint = 'Lists use .size()';
            this.fail(`${cls.name} has no method called ${e.name}(...)`, e.pos, hint);
          }
          if (isString(rt_)) this.features.add('string-method');
        }
      }
    }
    const args = e.args.map((a) => this.ex(a, ctx));
    const m = this.pickMethod(cands, args, e.pos, `${e.name}(...)${ownerName ? ' in ' + ownerName : ''}`, null, map, e.name);
    const base = cands.find((c) => c.sig === m.sig) || m;
    this.checkAccess(base, ctx, e.pos);
    if (mode === 'implicit' && !m.isStatic && ctx.isStatic) {
      this.fail(`Can't call ${e.name}() from a static method, because ${e.name}() belongs to an object`, e.pos,
        `Either make it static (static ${typeStr(m.ret)} ${e.name}(...)), or call it on an object: myObject.${e.name}()`);
    }
    if (mode === 'static' && !m.isStatic) {
      this.fail(`${e.name}() belongs to each ${ownerName} object, so it can't be called on the class itself`, e.pos,
        `Create an object and call it on that: ${ownerName[0].toLowerCase() + ownerName.slice(1)}.${e.name}()`);
    }
    if (mode === 'super' && m.isAbstract) this.fail(`Can't call super.${e.name}() because it's abstract in ${ownerName} (it has no code)`, e.pos);
    if (m.owner && !m.owner.builtin && m.owner !== ctx.cls && m.isStatic === false) this.features.add('call-instance');
    this.features.add('call:' + e.name);
    if (m.owner) this.features.add(`call:${m.owner.name}.${e.name}`);
    const argF = this.argFns(m, args, map);
    const ret = subst(m.ret, map);
    const n = argF.length;
    const evalArgs = n === 0 ? () => [] : n === 1 ? (fr) => [argF[0](fr)] : (fr) => argF.map((f) => f(fr));
    const display = `${ownerName}.${e.name}()`;
    let f;
    const target = base;
    if (target.isStatic) {
      if (mode === 'value') {
        const rf = recv.f;
        f = (fr) => { rf(fr); return R.rt.invoke(target, null, evalArgs(fr)); };
      } else if (target.native) {
        const nat = target.native;
        f = (fr) => nat(null, evalArgs(fr));
      } else {
        f = (fr) => R.rt.invoke(target, null, evalArgs(fr));
      }
    } else if (mode === 'super' || target.access === 'private') {
      if (mode === 'value') {
        const rf = recv.f;
        f = (fr) => {
          const o = rf(fr);
          if (o === null) R.rt.throwNew('NullPointerException', `Cannot invoke "${display}" because "${text}" is null`);
          return R.rt.invoke(target, o, evalArgs(fr));
        };
      } else {
        f = (fr) => R.rt.invoke(target, fr.t, evalArgs(fr));
      }
    } else if (mode === 'implicit') {
      const sig = target.sig;
      f = (fr) => {
        const o = fr.t;
        return R.rt.invoke(o.cls.vtable.get(sig), o, evalArgs(fr));
      };
    } else {
      const rf = recv.f;
      const sig = target.sig;
      if (isString(recv.t)) {
        const nat = target.native;
        f = (fr) => {
          const o = rf(fr);
          if (o === null) R.rt.throwNew('NullPointerException', `Cannot invoke "String.${e.name}()" because "${text}" is null`);
          return nat(o, evalArgs(fr));
        };
      } else {
        const reg = this.reg;
        f = (fr) => {
          const o = rf(fr);
          if (o === null) R.rt.throwNew('NullPointerException', `Cannot invoke "${display}" because "${text}" is null`);
          let m2;
          if (o instanceof JObj) m2 = o.cls.vtable.get(sig);
          else if (typeof o === 'string') m2 = reg.get('String').vtable.get(sig);
          else if (o instanceof JBox) m2 = reg.get(o.kind).vtable.get(sig);
          else m2 = reg.get('Object').vtable.get(sig);
          return R.rt.invoke(m2 || target, o, evalArgs(fr));
        };
      }
    }
    // generic return types come back as Object at runtime; keep the substituted static type
    return { t: ret, f };
  }

  exNew(e, ctx, expected) {
    const t = this.resolveType(e.type);
    if (t.k !== 'class') this.fail(`Can't use new with ${typeStr(t)}`, e.pos);
    const cls = t.cls;
    if (cls.isInterface) {
      this.fail(`${cls.name} is an interface, so you can't create one with new`, e.type.pos, `Create an object of a class that implements ${cls.name} instead.`);
    }
    if (cls.isAbstract) {
      const subs = this.userClasses.filter((c) => c.superclass === cls && !c.isAbstract).map((c) => c.name);
      this.fail(`${cls.name} is abstract, so you can't create one with new`, e.type.pos,
        subs.length ? `Create a ${subs.join(' or a ')} instead.` : `Make a class that extends ${cls.name} and create that instead.`);
    }
    if (!cls.ctors.length) {
      this.fail(`${cls.name} can't be created with new`, e.type.pos, cls.builtin ? `Call its methods directly, like ${cls.name}.${[...cls.methods.keys()][0] || 'method'}(...)` : null);
    }
    let rtype = t;
    if (e.type.args && e.type.args.length === 0) {
      // diamond: take the type arguments from the expected type
      if (expected && expected.k === 'class' && expected.args && isSubclass(cls, expected.cls)) rtype = classT(cls, expected.args);
      else rtype = classT(cls, cls.typeParams.map(() => classT(this.Object)));
    }
    const map = receiverMap(rtype);
    const args = e.args.map((a) => this.ex(a, ctx));
    const k = this.pickMethod(cls.ctors, args, e.pos, `the ${cls.name} constructor`, cls, map, cls.name);
    const base = cls.ctors.find((c) => c.sig === k.sig) || k;
    this.checkAccess(base, ctx, e.pos);
    this.features.add('new');
    this.features.add('new:' + cls.name);
    const argF = this.argFns(k, args, map);
    let f;
    if (cls === this.String) {
      const nat = base.native;
      f = (fr) => nat(null, argF.map((g) => g(fr)));
    } else {
      f = (fr) => {
        const o = new JObj(cls);
        R.rt.invoke(base, o, argF.map((g) => g(fr)));
        return o;
      };
    }
    return { t: rtype, f };
  }

  exNewArray(e, ctx) {
    this.features.add('array');
    this.features.add('new-array');
    let elemBase = this.resolveType({ ...e.type, dims: 0 });
    if (isVoid(elemBase)) this.fail("Can't make an array of void", e.pos);
    const total = e.dims.length + e.extraDims;
    let t = elemBase;
    for (let i = 0; i < total; i++) t = arrayT(t);
    if (e.init) return { t, f: this.arrayInit(e.init, t, ctx) };
    const dimF = e.dims.map((d) => {
      const de = this.ex(d, ctx);
      const u = unboxedPrim(de.t);
      if (!u || !['int', 'short', 'char', 'byte'].includes(u.n)) this.fail(`An array size must be an int, but this is ${an(typeStr(de.t))}`, d.pos);
      return this.convFn(de, T.int);
    });
    const make = (type, sizes, depth) => {
      const n = sizes[depth];
      if (n < 0) R.rt.throwNew('NegativeArraySizeException', String(n));
      if (n > 1000000) throw new HaltSignal('limit', `An array of ${n} items is too big for this sandbox (max 1,000,000).`);
      const elem = type.elem;
      const data = new Array(n);
      if (depth + 1 < sizes.length) for (let i = 0; i < n; i++) data[i] = make(elem, sizes, depth + 1);
      else data.fill(defaultValue(elem));
      return new JArray(elem, data);
    };
    return { t, f: (fr) => make(t, dimF.map((d) => d(fr)), 0) };
  }

  numeric(e, ctx, what) {
    const r = this.ex(e, ctx);
    const u = unboxedPrim(r.t);
    if (!u || !isNumericPrim(u)) {
      this.fail(`${what} needs a number, but this is ${an(typeStr(r.t))}`, e.pos,
        isString(r.t) ? 'To turn text into a number, use Integer.parseInt(...) or Double.parseDouble(...)' : null);
    }
    return { ...r, u };
  }

  exUnary(e, ctx) {
    if (e.op === '++' || e.op === '--') return this.exIncDec(e.e, e.op, true, ctx, e.pos);
    if (e.op === '!') {
      const r = this.ex(e.e, ctx);
      const u = unboxedPrim(r.t);
      if (!u || u.n !== 'boolean') this.fail(`! (not) only works on true/false values, but this is ${an(typeStr(r.t))}`, e.pos);
      const f = this.convFn(r, T.boolean);
      return { t: T.boolean, f: (fr) => !f(fr), c: r.c !== undefined ? !r.c : undefined };
    }
    const r = this.numeric(e.e, ctx, `The ${e.op} sign`);
    const pt = unaryPromote(r.u);
    const f = this.convFn(r, pt);
    if (e.op === '+') return { t: pt, f, c: r.c };
    if (e.op === '-') {
      const c = r.c !== undefined ? -r.c : undefined;
      if (pt.n === 'int') return { t: pt, f: (fr) => (-f(fr)) | 0, c };
      if (pt.n === 'float') return { t: pt, f: (fr) => Math.fround(-f(fr)), c };
      return { t: pt, f: (fr) => -f(fr), c };
    }
    if (e.op === '~') {
      if (!isIntegralPrim(pt)) this.fail('~ only works on whole numbers', e.pos);
      return { t: pt, f: (fr) => ~f(fr) };
    }
  }

  // an assignable place: local, field, or array element
  lvalue(target, ctx, forCompound) {
    if (target.k === 'Paren') return this.lvalue(target.e, ctx, forCompound);
    if (target.k === 'Name') {
      const r = this.resolveName(target, ctx);
      if (r.local) {
        const l = r.local;
        if (forCompound && !ctx.isAssigned(l)) {
          this.fail(`The variable '${l.name}' might not have a value yet`, target.pos, `Give it a starting value first, like ${typeStr(l.type)} ${l.name} = ${this.sampleValue(l.type)};`);
        }
        const slot = l.slot;
        return {
          t: l.type,
          local: l,
          prep: (fr) => fr,
          get: (fr) => fr.l[slot],
          set: (fr, v) => { fr.l[slot] = v; }
        };
      }
      if (r.field) return this.fieldLvalue(r.field, null, ctx, target);
      if (r.cls) this.fail(`${target.name} is a class, so you can't assign to it`, target.pos);
      this.unknownName(target, ctx);
    }
    if (target.k === 'Field') {
      const tgt = this.exTarget(target.obj, ctx);
      if (tgt.cls) {
        const f = tgt.cls.findField(target.name);
        if (!f) this.fail(`${tgt.cls.name} has no static field called '${target.name}'`, target.pos);
        if (!f.isStatic) this.fail(`'${target.name}' belongs to each ${tgt.cls.name} object, not to the class`, target.pos);
        return this.fieldLvalue(f, null, ctx, target);
      }
      if (tgt.sup) {
        const f = tgt.t.cls.findField(target.name);
        if (!f) this.fail(`${tgt.t.cls.name} has no field '${target.name}'`, target.pos);
        return this.fieldLvalue(f, (fr) => fr.t, ctx, target, true);
      }
      const o = tgt.v;
      if (o.t.k === 'array') {
        if (target.name === 'length') this.fail("An array's length can't be changed. Make a new array instead.", target.pos);
        this.fail(`Arrays only have .length, not .${target.name}`, target.pos);
      }
      if (o.t.k !== 'class') this.fail(`Can't use . on ${an(typeStr(o.t))}`, target.pos);
      const f = o.t.cls.findField(target.name);
      if (!f) this.fail(`${o.t.cls.name} has no field called '${target.name}'`, target.pos, didYouMean(suggest(target.name, o.t.cls.allFieldNames())));
      return this.fieldLvalue(f, o.f, ctx, target, target.obj.k === 'This');
    }
    if (target.k === 'Index') {
      const a = this.ex(target.arr, ctx);
      if (a.t.k !== 'array') this.fail(`[ ] only works on arrays, but this is ${an(typeStr(a.t))}`, target.pos,
        a.t.k === 'class' && a.t.cls.name === 'ArrayList' ? 'For a list, use .set(index, value)' : null);
      const i = this.ex(target.idx, ctx);
      const ip = unboxedPrim(i.t);
      if (!ip || !['int', 'short', 'char', 'byte'].includes(ip.n)) this.fail(`An array index must be an int, but this is ${an(typeStr(i.t))}`, target.idx.pos);
      const af = a.f;
      const idf = this.convFn(i, T.int);
      const text = exprText(target.arr);
      const elem = a.t.elem;
      return {
        t: elem,
        prep: (fr) => {
          const arr = af(fr);
          const k = idf(fr);
          if (arr === null) R.rt.throwNew('NullPointerException', `Cannot store to array because "${text}" is null`);
          if (k < 0 || k >= arr.data.length) R.rt.throwNew('ArrayIndexOutOfBoundsException', `Index ${k} out of bounds for length ${arr.data.length}`);
          if (elem.k !== 'prim') return { arr, k };
          return { arr, k };
        },
        get: (h) => h.arr.data[h.k],
        set: (h, v) => {
          if (elem.k !== 'prim' && v !== null && !isInstance(v, h.arr.elemType)) {
            R.rt.throwNew('ArrayStoreException', runtimeTypeName(v));
          }
          h.arr.data[h.k] = v;
        }
      };
    }
    this.fail('You can only assign to a variable, a field or an array element', target.pos);
  }

  fieldLvalue(f, objF, ctx, target, viaThis = false) {
    this.checkAccess(f, ctx, target.pos);
    if (f.isFinal) {
      const inOwnInit = ctx.cls === f.owner && ((ctx.kind === 'ctor' && !f.isStatic && (!objF || viaThis)) || (ctx.kind === 'init'));
      if (!inOwnInit || f.declMem?.vars.find((v) => v.name === f.name)?.init) {
        this.fail(`'${f.name}' is final, so its value can't be changed`, target.pos, f.isStatic ? 'final values are constants. Remove final if it needs to change.' : null);
      }
    }
    if (f.isStatic) {
      const owner = f.owner;
      const name = f.name;
      return { t: f.type, prep: () => null, get: () => owner.statics[name], set: (h, v) => { owner.statics[name] = v; }, field: f };
    }
    const key = f.key;
    if (!objF) {
      if (ctx.isStatic) {
        this.fail(`Can't use the field '${f.name}' inside a static method`, target.pos,
          `'${f.name}' belongs to each object. Create an object first, or make the field static.`);
      }
      return { t: f.type, prep: (fr) => fr.t, get: (o) => o.f[key], set: (o, v) => { o.f[key] = v; }, field: f };
    }
    const text = exprText(target.obj);
    if (target.obj && target.obj.k === 'This') this.features.add('this-field');
    return {
      t: f.type,
      prep: (fr) => {
        const o = objF(fr);
        if (o === null) R.rt.throwNew('NullPointerException', `Cannot assign field "${f.name}" because "${text}" is null`);
        return o;
      },
      get: (o) => o.f[key],
      set: (o, v) => { o.f[key] = v; },
      field: f
    };
  }

  checkFinalLocal(lv, ctx, pos) {
    if (lv.local && lv.local.final && (lv.local.assignedOnce || ctx.isAssigned(lv.local))) {
      this.fail(`'${lv.local.name}' is final, so its value can't be changed`, pos);
    }
  }

  exIncDec(target, op, prefix, ctx, pos) {
    const lv = this.lvalue(target, ctx, true);
    this.checkFinalLocal(lv, ctx, pos);
    const u = unboxedPrim(lv.t);
    if (!u || !isNumericPrim(u)) this.fail(`${op} only works on numbers, but this is ${an(typeStr(lv.t))}`, pos);
    this.features.add('increment');
    const d = op === '++' ? 1 : -1;
    const toVal = this.convFn({ t: lv.t, f: (x) => x }, u);
    let step;
    switch (u.n) {
      case 'int': step = (v) => (v + d) | 0; break;
      case 'char': step = (v) => (v + d) & 0xffff; break;
      case 'short': step = (v) => ((v + d) << 16) >> 16; break;
      case 'byte': step = (v) => ((v + d) << 24) >> 24; break;
      case 'float': step = (v) => Math.fround(v + d); break;
      default: step = (v) => v + d;
    }
    const back = isPrim(lv.t) ? (x) => x : (x) => box(lv.t.cls.name, x);
    const { prep, get, set } = lv;
    return {
      t: u,
      f: prefix
        ? (fr) => { const h = prep(fr); const nv = step(toVal(get(h))); set(h, back(nv)); return nv; }
        : (fr) => { const h = prep(fr); const old = toVal(get(h)); set(h, back(step(old))); return old; }
    };
  }

  // compute op on typed operands; returns {t, f(a, b)} on already-evaluated values
  arith(op, lt, rt_, pos, lText, rText) {
    if (op === '+' && (isString(lt) || isString(rt_))) {
      if (isVoid(lt) || isVoid(rt_)) this.fail('Can\'t add text to a method that returns nothing (void)', pos);
      this.features.add('concat');
      const ls = strConv(lt);
      const rs = strConv(rt_);
      return { t: classT(this.String), op: (a, b) => ls(a) + rs(b) };
    }
    const lu = unboxedPrim(lt);
    const ru = unboxedPrim(rt_);
    const opName = { '+': 'add', '-': 'subtract', '*': 'multiply', '/': 'divide', '%': 'take the remainder of' }[op];
    if (['+', '-', '*', '/', '%'].includes(op)) {
      if (!lu || !ru || !isNumericPrim(lu) || !isNumericPrim(ru)) {
        const bad = !lu || !isNumericPrim(lu) ? lt : rt_;
        this.fail(`Can't ${opName} ${typeStr(lt)} and ${typeStr(rt_)}`, pos,
          isBool(bad) ? 'true/false values are not numbers.' : op === '+' ? null : null);
      }
      const pt = binaryPromote(lu, ru);
      const lc = this.unboxConv(lt, pt);
      const rc = this.unboxConv(rt_, pt);
      let fn;
      const div0 = () => R.rt.throwNew('ArithmeticException', '/ by zero');
      switch (pt.n) {
        case 'int':
          fn = {
            '+': (a, b) => (a + b) | 0,
            '-': (a, b) => (a - b) | 0,
            '*': (a, b) => Math.imul(a, b),
            '/': (a, b) => (b === 0 ? div0() : (a / b) | 0),
            '%': (a, b) => (b === 0 ? div0() : (a % b) | 0)
          }[op];
          if (op === '/') this.features.add('int-division');
          if (op === '%') this.features.add('modulo');
          break;
        case 'long':
          fn = {
            '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b,
            '/': (a, b) => (b === 0 ? div0() : Math.trunc(a / b)),
            '%': (a, b) => (b === 0 ? div0() : a % b)
          }[op];
          break;
        case 'float':
          fn = { '+': (a, b) => Math.fround(a + b), '-': (a, b) => Math.fround(a - b), '*': (a, b) => Math.fround(a * b), '/': (a, b) => Math.fround(a / b), '%': (a, b) => Math.fround(a % b) }[op];
          break;
        default:
          fn = { '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b, '/': (a, b) => a / b, '%': (a, b) => a % b }[op];
      }
      this.features.add('math');
      return { t: pt, op: (a, b) => fn(lc(a), rc(b)) };
    }
    if (['<<', '>>', '>>>'].includes(op)) {
      if (!lu || !ru || !isIntegralPrim(lu) || !isIntegralPrim(ru)) this.fail(`${op} only works on whole numbers`, pos);
      const pt = unaryPromote(lu);
      const lc = this.unboxConv(lt, pt);
      const rc = this.unboxConv(rt_, unaryPromote(ru));
      let fn;
      if (pt.n === 'int') fn = { '<<': (a, b) => a << b, '>>': (a, b) => a >> b, '>>>': (a, b) => (a >>> b) | 0 }[op];
      else fn = { '<<': (a, b) => a * Math.pow(2, b & 63), '>>': (a, b) => Math.floor(a / Math.pow(2, b & 63)), '>>>': (a, b) => Math.floor(a / Math.pow(2, b & 63)) }[op];
      return { t: pt, op: (a, b) => fn(lc(a), rc(b)) };
    }
    if (['&', '|', '^'].includes(op)) {
      if (lu && ru && isBool(lu) && isBool(ru)) {
        const lc = this.unboxConv(lt, T.boolean);
        const rc = this.unboxConv(rt_, T.boolean);
        const fn = { '&': (a, b) => a && b, '|': (a, b) => a || b, '^': (a, b) => a !== b }[op];
        return { t: T.boolean, op: (a, b) => fn(lc(a), rc(b)) };
      }
      if (!lu || !ru || !isIntegralPrim(lu) || !isIntegralPrim(ru)) {
        this.fail(`${op} needs two whole numbers or two booleans`, pos, op === '&' || op === '|' ? `For "and"/"or" conditions, use ${op}${op}` : null);
      }
      const pt = binaryPromote(lu, ru);
      const lc = this.unboxConv(lt, pt);
      const rc = this.unboxConv(rt_, pt);
      const fn = { '&': (a, b) => a & b, '|': (a, b) => a | b, '^': (a, b) => a ^ b }[op];
      return { t: pt, op: (a, b) => fn(lc(a), rc(b)) };
    }
    this.fail(`Unknown operator ${op}`, pos);
  }

  unboxConv(from, to) {
    const f = this.convFn({ t: from, f: (x) => x }, to);
    return f;
  }

  exBinary(e, ctx) {
    const op = e.op;
    if (op === '&&' || op === '||') {
      const l = this.ex(e.l, ctx);
      const lu = unboxedPrim(l.t);
      if (!lu || lu.n !== 'boolean') this.fail(`${op} needs true/false on both sides, but the left side is ${an(typeStr(l.t))}`, e.l.pos);
      // right side may not run: its assignments don't count afterwards
      const before = ctx.snapshot();
      const r = this.ex(e.r, ctx);
      ctx.da = before;
      const ru = unboxedPrim(r.t);
      if (!ru || ru.n !== 'boolean') this.fail(`${op} needs true/false on both sides, but the right side is ${an(typeStr(r.t))}`, e.r.pos);
      const lf = this.convFn(l, T.boolean);
      const rf = this.convFn(r, T.boolean);
      this.features.add(op === '&&' ? 'and' : 'or');
      const c = l.c !== undefined && r.c !== undefined ? (op === '&&' ? l.c && r.c : l.c || r.c) : undefined;
      return { t: T.boolean, f: op === '&&' ? (fr) => lf(fr) && rf(fr) : (fr) => lf(fr) || rf(fr), c };
    }
    const l = this.ex(e.l, ctx);
    const r = this.ex(e.r, ctx);
    if (isVoid(l.t) || isVoid(r.t)) this.fail('A method that returns nothing (void) can\'t be used in a calculation', isVoid(l.t) ? e.l.pos : e.r.pos);
    const pos = e.opPos || e.pos;
    if (['==', '!=', '<', '>', '<=', '>='].includes(op)) return this.exCompare(e, l, r, ctx, pos);
    const a = this.arith(op, l.t, r.t, pos, exprText(e.l), exprText(e.r));
    const lf = l.f;
    const rf = r.f;
    const fn = a.op;
    let c;
    if (l.c !== undefined && r.c !== undefined) {
      try { c = fn(l.c, r.c); } catch (err) { c = undefined; }
      if (typeof c === 'number' && !Number.isFinite(c)) c = undefined;
    }
    return { t: a.t, f: (fr) => fn(lf(fr), rf(fr)), c };
  }

  exCompare(e, l, r, ctx, pos) {
    const op = e.op;
    const lu = unboxedPrim(l.t);
    const ru = unboxedPrim(r.t);
    let fn;
    const eq = op === '==' || op === '!=';
    if (lu && ru && isNumericPrim(lu) && isNumericPrim(ru) && (isPrim(l.t) || isPrim(r.t) || !eq)) {
      const pt = binaryPromote(lu, ru);
      const lc = this.unboxConv(l.t, pt);
      const rc = this.unboxConv(r.t, pt);
      fn = {
        '==': (a, b) => lc(a) === rc(b), '!=': (a, b) => lc(a) !== rc(b), '<': (a, b) => lc(a) < rc(b),
        '>': (a, b) => lc(a) > rc(b), '<=': (a, b) => lc(a) <= rc(b), '>=': (a, b) => lc(a) >= rc(b)
      }[op];
    } else if (eq && lu && ru && isBool(lu) && isBool(ru) && (isPrim(l.t) || isPrim(r.t))) {
      const lc = this.unboxConv(l.t, T.boolean);
      const rc = this.unboxConv(r.t, T.boolean);
      fn = op === '==' ? (a, b) => lc(a) === rc(b) : (a, b) => lc(a) !== rc(b);
    } else if (eq && isRef(l.t) && isRef(r.t)) {
      if (!(isCastable(l.t, r.t) || isCastable(r.t, l.t))) {
        this.fail(`Can't compare ${an(typeStr(l.t))} with ${an(typeStr(r.t))} using ${op}`, pos);
      }
      if (isString(l.t) && isString(r.t)) {
        this.warn('Compare Strings with .equals(), not ==. For example: name.equals("Bob")', pos);
        this.features.add('string-eq');
      }
      fn = op === '==' ? (a, b) => a === b : (a, b) => a !== b;
    } else {
      if (!eq) {
        const bad = !lu || !isNumericPrim(lu) ? l : r;
        this.fail(`${op} compares numbers, but this is ${an(typeStr(bad.t))}`, bad.pos || pos,
          isString(bad.t) ? 'To compare text alphabetically, use a.compareTo(b) < 0' : null);
      }
      if ((isPrim(l.t) && r.t.k === 'null') || (isPrim(r.t) && l.t.k === 'null')) {
        this.fail(`A ${typeStr(isPrim(l.t) ? l.t : r.t)} can never be null`, pos);
      }
      this.fail(`Can't compare ${an(typeStr(l.t))} with ${an(typeStr(r.t))}`, pos,
        (isString(l.t) && isPrim(r.t)) || (isString(r.t) && isPrim(l.t)) ? 'Text and numbers are different types. Remove the quotes, or convert one of them.' : null);
    }
    const lf = l.f;
    const rf = r.f;
    let c;
    if (l.c !== undefined && r.c !== undefined && typeof l.c !== 'string') c = fn(l.c, r.c);
    this.features.add('compare');
    return { t: T.boolean, f: (fr) => fn(lf(fr), rf(fr)), c };
  }

  exAssign(e, ctx) {
    const lv = this.lvalue(e.target, ctx, e.op !== '=');
    this.checkFinalLocal(lv, ctx, e.pos);
    const { prep, get, set } = lv;
    if (e.op === '=') {
      let vf;
      if (e.value.k === 'ArrayInit') this.fail('Array values in { } can only be used when declaring. Write new ' + typeStr(lv.t) + '{...}', e.value.pos);
      const v = this.ex(e.value, ctx, lv.t);
      vf = this.coerce(v, lv.t, e.value.pos, lv.local ? `the variable ${lv.local.name}` : lv.field ? `the field ${lv.field.name}` : 'this array item');
      if (lv.local) { ctx.assign(lv.local); lv.local.assignedOnce = true; }
      return { t: lv.t, f: (fr) => { const h = prep(fr); const val = vf(fr); set(h, val); return val; } };
    }
    this.features.add('compound-assign');
    const op = e.op.slice(0, -1);
    const v = this.ex(e.value, ctx);
    const a = this.arith(op, lv.t, v.t, e.opPos || e.pos);
    // implicit cast back to the target type (int x += 1.5 is legal)
    if (!isString(lv.t) && !unboxedPrim(lv.t)) this.fail(`${e.op} doesn't work on ${an(typeStr(lv.t))}`, e.pos);
    if (isString(a.t) && !isString(lv.t)) this.fail(`Can't add text to ${an(typeStr(lv.t))}`, e.pos);
    const back = isString(lv.t) ? (x) => x : (() => {
      const target = unboxedPrim(lv.t);
      const c = primConv(a.t.n, target.n);
      const toT = c || ((x) => x);
      return isPrim(lv.t) ? toT : (x) => box(lv.t.cls.name, toT(x));
    })();
    const vf = v.f;
    const fn = a.op;
    return { t: lv.t, f: (fr) => { const h = prep(fr); const res = back(fn(get(h), vf(fr))); set(h, res); return res; } };
  }

  exCond(e, ctx, expected) {
    this.features.add('ternary');
    const cf = this.cond(e.cond, ctx, '? :');
    const before = ctx.snapshot();
    const a = this.ex(e.a, ctx, expected);
    ctx.da = before === null ? null : new Set(before);
    const b = this.ex(e.b, ctx, expected);
    ctx.da = before;
    let t;
    const au = unboxedPrim(a.t);
    const bu = unboxedPrim(b.t);
    if (au && bu && isNumericPrim(au) && isNumericPrim(bu)) {
      t = sameType(au, bu) ? au : binaryPromote(au, bu);
      if (!isPrim(a.t) && !isPrim(b.t) && sameType(a.t, b.t)) t = a.t;
    } else if (au && bu && isBool(au) && isBool(bu)) t = T.boolean;
    else if (a.t.k === 'null') t = isPrim(b.t) ? boxedType(b.t) : b.t;
    else if (b.t.k === 'null') t = isPrim(a.t) ? boxedType(a.t) : a.t;
    else {
      const ar = isPrim(a.t) ? boxedType(a.t) : a.t;
      const br = isPrim(b.t) ? boxedType(b.t) : b.t;
      if (isVoid(a.t) || isVoid(b.t)) this.fail('Both sides of ? : must be values', e.pos);
      if (isRefAssignable(ar, br)) t = br;
      else if (isRefAssignable(br, ar)) t = ar;
      else if (expected && isRefAssignable(ar, expected) && isRefAssignable(br, expected)) t = expected;
      else t = classT(this.Object);
    }
    const af = this.convFn(a, t);
    const bf = this.convFn(b, t);
    return { t, f: (fr) => (cf(fr) ? af(fr) : bf(fr)) };
  }

  exCast(e, ctx) {
    const t = this.resolveType(e.type);
    const v = this.ex(e.e, ctx);
    if (!isCastable(v.t, t)) {
      let hint = null;
      if (isString(v.t) && t.k === 'prim') hint = t.n === 'int' ? 'To turn text into a number, use Integer.parseInt(text)' : 'To turn text into a number, use Double.parseDouble(text)';
      if (isString(t) && v.t.k === 'prim') hint = 'To turn a value into text, use String.valueOf(value)';
      this.fail(`Can't cast ${an(typeStr(v.t))} to ${typeStr(t)}`, e.pos, hint);
    }
    this.features.add('cast');
    if (t.k === 'prim' && v.t.k === 'prim') {
      const c = primConv(v.t.n, t.n);
      const f = v.f;
      return { t, f: c ? (fr) => c(f(fr)) : f, c: v.c !== undefined && typeof v.c === 'number' ? (c ? c(v.c) : v.c) : undefined };
    }
    if (t.k === 'prim') {
      const u = unboxedPrim(v.t);
      if (u) return { t, f: this.convFn({ t: v.t, f: v.f }, t) };
      // Object -> int: must hold the matching box at runtime
      const want = BOX[t.n];
      const f = v.f;
      return {
        t,
        f: (fr) => {
          const x = f(fr);
          if (x === null) R.rt.throwNew('NullPointerException', `Can't cast null to ${t.n}`);
          if (!(x instanceof JBox) || x.kind !== want) R.rt.throwNew('ClassCastException', `class ${runtimeTypeName(x)} cannot be cast to class java.lang.${want}`);
          return x.v;
        }
      };
    }
    if (v.t.k === 'prim') return { t, f: this.convFn(v, t) };
    const f = v.f;
    if (isRefAssignable(v.t, t)) return { t, f };
    return {
      t,
      f: (fr) => {
        const x = f(fr);
        if (x !== null && !isInstance(x, t)) {
          R.rt.throwNew('ClassCastException', `class ${runtimeTypeName(x)} cannot be cast to class ${typeStr(t)}`);
        }
        return x;
      }
    };
  }

  exInstanceOf(e, ctx) {
    const v = this.ex(e.e, ctx);
    const t = this.resolveType(e.type);
    if (isPrim(v.t)) this.fail(`instanceof only works on objects, but this is ${an(typeStr(v.t))}`, e.pos);
    if (isPrim(t)) this.fail('instanceof needs a class name on the right, not a primitive type', e.type.pos);
    if (!isCastable(v.t, t)) this.fail(`A ${typeStr(v.t)} can never be ${an(typeStr(t))}`, e.pos);
    this.features.add('instanceof');
    const f = v.f;
    if (e.bind) {
      const local = ctx.declare(e.bind.name, t, e.bind.pos);
      ctx.assign(local);
      const slot = local.slot;
      return { t: T.boolean, f: (fr) => { const x = f(fr); if (isInstance(x, t)) { fr.l[slot] = x; return true; } return false; } };
    }
    return { t: T.boolean, f: (fr) => isInstance(f(fr), t) };
  }
}

class TooManyErrors extends Error {}

export { exprText };
