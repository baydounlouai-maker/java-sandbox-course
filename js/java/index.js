// Public entry point: compile Java files and run them.
import { Compiler } from './compiler.js';
import { classT, typeStr, defaultValue, setRegistry, isSubclass } from './model.js';
import { R, JObj, JArray, JBox, JavaThrow, HaltSignal, WorldRecorder, jstr, qualifiedName } from './runtime.js';

export { isColor } from './builtins.js';

const OUTPUT_LIMIT = 4000;

class Runtime {
  constructor(prog, budget) {
    this.prog = prog;
    this.reg = prog.reg;
    this.out = [];
    this.buf = '';
    this.bufKind = 'out';
    this.world = new WorldRecorder();
    this.budget = budget;
    this.stack = [];
    this.depth = 0;
  }

  pushLine(text, kind) {
    if (this.out.length >= OUTPUT_LIMIT) {
      throw new HaltSignal('limit', `Your program printed more than ${OUTPUT_LIMIT} lines, so it was stopped. Is a loop printing too much?`);
    }
    this.out.push({ text, kind, t: this.world.time });
  }

  print(s, isErr) {
    const kind = isErr ? 'err' : 'out';
    if (this.buf && kind !== this.bufKind) this.flush();
    this.bufKind = kind;
    const parts = String(s).split('\n');
    for (let i = 0; i < parts.length - 1; i++) {
      this.pushLine(this.buf + parts[i], kind);
      this.buf = '';
    }
    this.buf += parts[parts.length - 1];
    if (this.buf.length > 20000) this.flush();
  }

  flush() {
    if (this.buf) {
      const b = this.buf;
      this.buf = '';
      this.pushLine(b, this.bufKind);
    }
  }

  warn(msg) {
    this.flush();
    this.pushLine(msg, 'warn');
  }

  invoke(m, self, args) {
    if (m.native) return m.native(self, args);
    if (!m.body) this.throwNew('UnsupportedOperationException', `${m.name}() has no code to run`);
    if (++this.depth > 900) {
      this.depth--;
      throw this.makeThrow('StackOverflowError', `Too many nested method calls (in ${m.owner.name}.${m.name}). Does a method keep calling itself forever?`);
    }
    if (--this.budget < 0) this.timeout();
    const fr = { l: new Array(m.nlocals), t: self, line: 0, m, rv: undefined };
    for (let i = 0; i < args.length; i++) fr.l[i] = args[i];
    this.stack.push(fr);
    try {
      m.body(fr);
      return fr.rv;
    } finally {
      this.stack.pop();
      this.depth--;
    }
  }

  makeThrow(name, msg) {
    const cls = this.reg.get(name) || this.reg.get('RuntimeException');
    const o = new JObj(cls);
    o.f['Throwable.message'] = msg ?? null;
    return new JavaThrow(o);
  }

  throwNew(name, msg) {
    throw this.makeThrow(name, msg);
  }

  captureTrace() {
    return this.stack.slice().reverse().map((fr) => ({
      cls: fr.m.owner.name,
      method: fr.m.isCtor ? '<init>' : fr.m.name,
      file: fr.m.owner.file,
      line: fr.line
    }));
  }

  timeout() {
    throw new HaltSignal('timeout', 'Your program ran for too long and was stopped. Is there a loop that never ends?');
  }
}

function describeException(e) {
  const o = e.obj;
  const cls = o.cls;
  let message = o.f['Throwable.message'] ?? null;
  return {
    name: qualifiedName(cls),
    simpleName: cls.name,
    message,
    userDefined: !cls.builtin,
    trace: e.trace || []
  };
}

export class Program {
  constructor(c) {
    this.errors = c.errors.map(({ key, ...rest }) => rest);
    this.warnings = c.warnings;
    this.features = c.features;
    this.reg = c.reg;
    this.classes = c.userClasses;
    this.main = c.main || null;
    this.rt = null;
  }

  get ok() { return this.errors.length === 0 && !!this.main; }

  run({ budget = 150_000_000 } = {}) {
    setRegistry(this.reg);
    const rt = new Runtime(this, budget);
    R.rt = rt;
    this.rt = rt;
    const res = { output: rt.out, world: rt.world, exception: null, error: null, exited: false };
    const t0 = performance.now();
    try {
      for (const c of this.classes) {
        for (const f of c.fields.values()) {
          if (f.isStatic) c.statics[f.name] = f.constValue !== undefined ? f.constValue : defaultValue(f.type);
        }
      }
      for (const c of this.classes) {
        const fr = { l: new Array(c.initSlots || 0), t: null, line: 0 };
        for (const init of c.staticInits) init(fr);
      }
      rt.invoke(this.main, null, [new JArray(classT(this.reg.get('String')), [])]);
    } catch (e) {
      this.handleError(e, res);
    }
    try { rt.flush(); } catch (e) { /* output limit */ }
    try {
      rt.budget = Math.max(rt.budget, 200000);
      rt.world.finish();
    } catch (e) {
      if (!res.error && !res.exception) this.handleError(e, res);
    }
    res.ms = performance.now() - t0;
    return res;
  }

  handleError(e, res) {
    if (e instanceof JavaThrow) {
      res.exception = describeException(e);
    } else if (e instanceof HaltSignal) {
      if (e.kind === 'exit') res.exited = true;
      else res.error = { kind: e.kind, message: e.message };
    } else if (e instanceof RangeError) {
      res.exception = { name: 'java.lang.StackOverflowError', simpleName: 'StackOverflowError', message: 'Too many nested method calls. Does a method keep calling itself forever?', trace: [] };
    } else {
      console.error(e);
      res.error = { kind: 'internal', message: 'The sandbox hit an internal problem: ' + (e && e.message) };
    }
  }

  // ---- helpers used by lesson checks and world clicks ----
  withRuntime(fn) {
    setRegistry(this.reg);
    if (!this.rt) this.rt = new Runtime(this, 2_000_000);
    const rt = this.rt;
    R.rt = rt;
    rt.budget = 2_000_000;
    rt.depth = 0;
    rt.stack = [];
    const start = rt.out.length;
    try {
      const value = fn(rt);
      rt.flush();
      return { value, output: rt.out.slice(start) };
    } catch (e) {
      const res = {};
      this.handleError(e, res);
      try { rt.flush(); } catch (err) { /* ignore */ }
      return { value: undefined, output: rt.out.slice(start), exception: res.exception, error: res.error };
    }
  }

  findClass(name) {
    const c = this.reg.get(name);
    return c && !c.builtin ? c : null;
  }

  convertArg(v, t) {
    if (t.k === 'prim') {
      if (t.n === 'int' || t.n === 'short' || t.n === 'byte' || t.n === 'long') return Math.trunc(v);
      if (t.n === 'char') return typeof v === 'string' ? v.charCodeAt(0) : v;
      return v;
    }
    if (typeof v === 'number' && t.k === 'class') {
      const kind = t.cls.name === 'Integer' ? 'Integer' : 'Double';
      return new JBox(kind, v);
    }
    return v;
  }

  argsFit(params, args) {
    if (params.length !== args.length) return false;
    return params.every((p, i) => {
      const v = args[i];
      const t = p.type;
      if (typeof v === 'number') return t.k === 'prim' && t.n !== 'boolean' && (Number.isInteger(v) || t.n === 'double' || t.n === 'float');
      if (typeof v === 'string') return t.k === 'class' && (t.cls.name === 'String' || t.cls.name === 'Object');
      if (typeof v === 'boolean') return t.k === 'prim' && t.n === 'boolean';
      if (v === null) return t.k !== 'prim';
      if (v instanceof JObj) return t.k === 'class' && isSubclass(v.cls, t.cls);
      return true;
    });
  }

  newObject(className, args = []) {
    const cls = this.findClass(className);
    if (!cls) return { exception: null, error: { message: `No class ${className}` } };
    return this.withRuntime((rt) => {
      const ctor = cls.ctors.find((k) => this.argsFit(k.params, args)) ||
        cls.ctors.find((k) => k.params.length === args.length);
      if (!ctor) throw new HaltSignal('check', `${className} has no constructor taking ${args.length} argument(s)`);
      if (cls.isAbstract) throw new HaltSignal('check', `${className} is abstract`);
      const o = new JObj(cls);
      rt.invoke(ctor, o, args.map((a, i) => this.convertArg(a, ctor.params[i].type)));
      return o;
    });
  }

  callMethod(obj, name, args = []) {
    return this.withRuntime((rt) => {
      let m = null;
      if (obj instanceof JObj) {
        m = [...obj.cls.vtable.values()].find((x) => x.name === name && this.argsFit(x.params, args)) ||
          [...obj.cls.vtable.values()].find((x) => x.name === name && x.params.length === args.length);
      }
      if (!m) throw new HaltSignal('check', `No method ${name} with ${args.length} argument(s)`);
      return this.toJS(rt.invoke(m, obj, args.map((a, i) => this.convertArg(a, m.params[i].type))), m.ret);
    });
  }

  callStatic(className, name, args = []) {
    const cls = this.findClass(className);
    return this.withRuntime((rt) => {
      const m = cls && (cls.methods.get(name) || []).find((x) => x.isStatic && this.argsFit(x.params, args));
      if (!m) throw new HaltSignal('check', `No static method ${name}`);
      return this.toJS(rt.invoke(m, null, args.map((a, i) => this.convertArg(a, m.params[i].type))), m.ret);
    });
  }

  toJS(v, t) {
    if (v instanceof JBox) return v.v;
    if (t && t.k === 'prim' && t.n === 'char' && typeof v === 'number') return String.fromCharCode(v);
    return v;
  }

  getField(obj, name) {
    if (!(obj instanceof JObj)) return undefined;
    const f = obj.cls.findField(name);
    if (!f || f.isStatic) return undefined;
    return this.toJS(obj.f[f.key], f.type);
  }

  getStatic(className, name) {
    const cls = this.findClass(className);
    const f = cls && cls.findField(name);
    if (!f || !f.isStatic) return undefined;
    return this.toJS(f.owner.statics[name], f.type);
  }

  describeObject(obj) {
    return this.withRuntime(() => jstr(obj)).value;
  }

  classInfo(name) {
    const c = this.findClass(name);
    if (!c) return null;
    const methods = [];
    for (const ms of c.methods.values()) {
      for (const m of ms) {
        methods.push({
          name: m.name, params: m.params.map((p) => typeStr(p.type)), ret: typeStr(m.ret),
          isStatic: m.isStatic, isAbstract: m.isAbstract, access: m.access, override: !!m.hasOverride, isDefault: m.isDefault
        });
      }
    }
    const chain = [];
    for (let x = c.superclass; x; x = x.superclass) chain.push(x.name);
    const allIfaces = new Set();
    const collect = (x) => { for (const i of x.interfaces) { allIfaces.add(i.name); collect(i); } if (x.superclass) collect(x.superclass); };
    collect(c);
    return {
      name: c.name,
      file: c.file,
      isInterface: c.isInterface,
      isAbstract: c.isAbstract && !c.isInterface,
      superName: c.superclass ? c.superclass.name : null,
      ancestors: chain,
      interfaces: c.interfaces.map((i) => i.name),
      allInterfaces: [...allIfaces],
      fields: [...c.fields.values()].map((f) => ({ name: f.name, type: f.typeName, isStatic: f.isStatic, isFinal: f.isFinal, access: f.access })),
      methods,
      ctors: c.ctors.filter((k) => !k.synthetic).map((k) => ({ params: k.params.map((p) => typeStr(p.type)), access: k.access }))
    };
  }

  classNames() {
    return this.classes.map((c) => c.name);
  }

  isInstanceOf(obj, className) {
    const c = this.reg.get(className);
    return obj instanceof JObj && !!c && isSubclass(obj.cls, c);
  }
}

export function compileJava(files) {
  const c = new Compiler().compile(files);
  return new Program(c);
}

export function formatException(ex) {
  if (!ex) return '';
  const head = `Exception in thread "main" ${ex.name}${ex.message != null ? ': ' + ex.message : ''}`;
  const lines = ex.trace.map((t) => `    at ${t.cls}.${t.method}(${t.file}:${t.line})`);
  return [head, ...lines].join('\n');
}

export { JObj, JArray, JBox };
