// Built-in classes: java.lang basics, a few java.util classes, and the sandbox World API.
import { ClassInfo, FieldInfo, MethodInfo, T, classT, arrayT, tvar } from './model.js';
import {
  R, JObj, JArray, JBox, box, jstr, jequals, jhash, jcompare, javaFormat, fmtDouble, stringHash, hashOf, qualifiedName, HaltSignal
} from './runtime.js';

const CSS_COLORS = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen').split(' '));

export function isColor(s) {
  if (typeof s !== 'string') return false;
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s.trim()) || CSS_COLORS.has(s.trim().toLowerCase());
}

function checkColor(s, where) {
  if (s === null) R.rt.throwNew('NullPointerException', `${where} got null instead of a color`);
  if (!isColor(s)) {
    R.rt.warn(`"${s}" isn't a color the world knows. Use a name like "green" or a hex code like "#33aa55".`);
    return '#ff00ff';
  }
  return s.trim();
}

// ---- tiny signature parser: "static int max(int,int)" ----
function parseType(str, reg, tparams) {
  str = str.trim();
  let dims = 0;
  while (str.endsWith('[]')) { dims++; str = str.slice(0, -2); }
  let t;
  const lt = str.indexOf('<');
  if (T[str]) t = T[str];
  else if (tparams.includes(str)) t = tvar(str);
  else if (lt > 0) {
    const base = str.slice(0, lt);
    const inner = str.slice(lt + 1, -1).split(',').map((s) => parseType(s, reg, tparams));
    t = classT(reg.get(base), inner);
  } else {
    const c = reg.get(str);
    if (!c) throw new Error('builtin type missing: ' + str);
    t = classT(c);
  }
  for (let i = 0; i < dims; i++) t = arrayT(t);
  return t;
}

function makeMethod(cls, reg, spec, native) {
  const m = /^(static\s+)?(abstract\s+)?(\S+)\s+(<init>|\w+)\((.*)\)$/.exec(spec.trim());
  if (!m) throw new Error('bad spec ' + spec);
  const tparams = cls.typeParams || [];
  let varargs = false;
  const params = m[5].trim() === '' ? [] : m[5].split(/,(?![^<]*>)/).map((p, i) => {
    p = p.trim();
    if (p.endsWith('...')) { varargs = true; p = p.slice(0, -3) + '[]'; }
    return { name: 'arg' + i, type: parseType(p, reg, tparams) };
  });
  const isCtor = m[4] === '<init>';
  const mi = new MethodInfo(isCtor ? cls.name : m[4], params, parseType(m[3], reg, tparams), {
    isStatic: !!m[1], isAbstract: !!m[2] && !native, access: 'public', varargs, native, isCtor
  });
  mi.owner = cls;
  return mi;
}

export function createBuiltins() {
  const reg = new Map();
  const mk = (name, opts = {}) => {
    const c = new ClassInfo(name, { builtin: true, pkg: opts.pkg ?? 'java.lang', ...opts });
    reg.set(name, c);
    return c;
  };
  const Object_ = mk('Object');
  const String_ = mk('String', { isFinal: true });
  const Number_ = mk('Number', { isAbstract: true });
  const Integer = mk('Integer', { isFinal: true });
  const Double = mk('Double', { isFinal: true });
  const Boolean_ = mk('Boolean', { isFinal: true });
  const Character = mk('Character', { isFinal: true });
  const Long = mk('Long', { isFinal: true });
  const Float = mk('Float', { isFinal: true });
  const Short = mk('Short', { isFinal: true });
  const Byte = mk('Byte', { isFinal: true });
  const Math_ = mk('Math', { isFinal: true });
  const System = mk('System', { isFinal: true });
  const PrintStream = mk('PrintStream', { pkg: 'java.io' });
  const Comparable = mk('Comparable', { isInterface: true, typeParams: ['T'] });
  const Iterable = mk('Iterable', { isInterface: true, typeParams: ['T'] });
  const Collection = mk('Collection', { isInterface: true, typeParams: ['E'], pkg: 'java.util' });
  const List = mk('List', { isInterface: true, typeParams: ['E'], pkg: 'java.util' });
  const ArrayList = mk('ArrayList', { typeParams: ['E'], pkg: 'java.util' });
  const Random = mk('Random', { pkg: 'java.util' });
  const Arrays = mk('Arrays', { pkg: 'java.util', isFinal: true });
  const Thread = mk('Thread');
  const World = mk('World', { pkg: null, isFinal: true });

  const Throwable = mk('Throwable');
  const exc = (name, parent, pkg) => { const c = mk(name, pkg ? { pkg } : {}); c.superclass = parent; return c; };
  const Exception = exc('Exception', Throwable);
  const Error_ = exc('Error', Throwable);
  const RuntimeException = exc('RuntimeException', Exception);
  exc('InterruptedException', Exception);
  exc('StackOverflowError', Error_);
  exc('ArithmeticException', RuntimeException);
  exc('NullPointerException', RuntimeException);
  exc('ClassCastException', RuntimeException);
  const IAE = exc('IllegalArgumentException', RuntimeException);
  exc('IllegalStateException', RuntimeException);
  exc('NumberFormatException', IAE);
  const IOOBE = exc('IndexOutOfBoundsException', RuntimeException);
  exc('ArrayIndexOutOfBoundsException', IOOBE);
  exc('StringIndexOutOfBoundsException', IOOBE);
  exc('NegativeArraySizeException', RuntimeException);
  exc('ArrayStoreException', RuntimeException);
  exc('UnsupportedOperationException', RuntimeException);
  exc('ConcurrentModificationException', RuntimeException, 'java.util');
  exc('IllegalFormatConversionException', IAE, 'java.util');
  exc('MissingFormatArgumentException', IAE, 'java.util');
  exc('UnknownFormatConversionException', IAE, 'java.util');

  for (const c of reg.values()) {
    if (c !== Object_ && !c.superclass && !c.isInterface) c.superclass = Object_;
  }
  for (const c of [Integer, Double, Long, Float, Short, Byte]) c.superclass = Number_;
  for (const c of [String_, Integer, Double, Character, Long, Boolean_, Float, Short, Byte]) c.interfaces = [Comparable];
  Collection.interfaces = [Iterable];
  List.interfaces = [Collection];
  ArrayList.interfaces = [List];

  const def = (cls, spec, fn) => {
    const m = makeMethod(cls, reg, spec, fn);
    if (m.isCtor) cls.ctors.push(m);
    else cls.addMethod(m);
    return m;
  };
  const field = (cls, name, typeStr, value) => {
    const f = new FieldInfo(name, parseType(typeStr, reg, []), { isStatic: true, isFinal: true, access: 'public', owner: cls });
    f.key = cls.name + '.' + name;
    f.constValue = value;
    cls.fields.set(name, f);
    cls.statics[name] = value;
  };
  const rt = () => R.rt;
  const thr = (name, msg) => R.rt.throwNew(name, msg);

  // ----- Object -----
  def(Object_, 'void <init>()', () => {});
  def(Object_, 'boolean equals(Object)', (self, [o]) => self === o);
  def(Object_, 'int hashCode()', (self) => hashOf(self));
  def(Object_, 'String toString()', (self) => (self.cls ? qualifiedName(self.cls) : 'Object') + '@' + hashOf(self).toString(16));

  // ----- String -----
  const S = (spec, fn) => def(String_, spec, fn);
  const checkIdx = (s, i, len = s.length) => {
    if (i < 0 || i >= len) thr('StringIndexOutOfBoundsException', `Index ${i} out of bounds for length ${len}`);
  };
  S('String <init>()', () => '');
  S('String <init>(String)', (self, [s]) => s);
  S('int length()', (s) => s.length);
  S('char charAt(int)', (s, [i]) => { checkIdx(s, i); return s.charCodeAt(i); });
  S('boolean isEmpty()', (s) => s.length === 0);
  S('boolean isBlank()', (s) => s.trim().length === 0);
  S('String substring(int)', (s, [a]) => {
    if (a < 0 || a > s.length) thr('StringIndexOutOfBoundsException', `begin ${a}, end ${s.length}, length ${s.length}`);
    return s.substring(a);
  });
  S('String substring(int,int)', (s, [a, b]) => {
    if (a < 0 || b > s.length || a > b) thr('StringIndexOutOfBoundsException', `begin ${a}, end ${b}, length ${s.length}`);
    return s.substring(a, b);
  });
  S('int indexOf(String)', (s, [x]) => s.indexOf(x));
  S('int indexOf(int)', (s, [c]) => s.indexOf(String.fromCharCode(c)));
  S('int indexOf(String,int)', (s, [x, from]) => s.indexOf(x, from));
  S('int lastIndexOf(String)', (s, [x]) => s.lastIndexOf(x));
  S('int lastIndexOf(int)', (s, [c]) => s.lastIndexOf(String.fromCharCode(c)));
  S('String toUpperCase()', (s) => s.toUpperCase());
  S('String toLowerCase()', (s) => s.toLowerCase());
  S('String trim()', (s) => s.trim());
  S('String strip()', (s) => s.trim());
  S('boolean equals(Object)', (s, [o]) => typeof o === 'string' && s === o);
  S('boolean equalsIgnoreCase(String)', (s, [o]) => o !== null && s.toLowerCase() === o.toLowerCase());
  S('boolean contains(String)', (s, [o]) => s.includes(o));
  S('boolean startsWith(String)', (s, [o]) => s.startsWith(o));
  S('boolean endsWith(String)', (s, [o]) => s.endsWith(o));
  S('String replace(String,String)', (s, [a, b]) => s.split(a).join(b));
  S('String replace(char,char)', (s, [a, b]) => s.split(String.fromCharCode(a)).join(String.fromCharCode(b)));
  S('int compareTo(String)', (s, [o]) => jcompare(s, o));
  S('int compareToIgnoreCase(String)', (s, [o]) => jcompare(s.toLowerCase(), o.toLowerCase()));
  S('String repeat(int)', (s, [n]) => { if (n < 0) thr('IllegalArgumentException', 'count is negative: ' + n); return s.repeat(n); });
  S('String concat(String)', (s, [o]) => s + o);
  S('int hashCode()', (s) => stringHash(s));
  S('String toString()', (s) => s);
  S('char[] toCharArray()', (s) => new JArray(T.char, [...s].map((c) => c.charCodeAt(0))));
  S('String[] split(String)', (s, [re]) => {
    let parts;
    try { parts = s.split(new RegExp(re)); } catch (e) { parts = s.split(re); }
    if (re === '') parts = [...s];
    while (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
    return new JArray(classT(String_), parts);
  });
  S('static String valueOf(int)', (_, [v]) => String(v));
  S('static String valueOf(long)', (_, [v]) => String(v));
  S('static String valueOf(double)', (_, [v]) => fmtDouble(v));
  S('static String valueOf(char)', (_, [v]) => String.fromCharCode(v));
  S('static String valueOf(boolean)', (_, [v]) => String(v));
  S('static String valueOf(Object)', (_, [v]) => jstr(v));
  S('static String format(String,Object...)', (_, [f, args]) => javaFormat(f, args.data));
  S('static String join(String,String...)', (_, [sep, parts]) => parts.data.map(jstr).join(sep));

  // ----- boxes -----
  const boxMethods = (cls, prim, parse) => {
    def(cls, `${prim} ${prim}Value()`, (self) => self.v);
    def(cls, 'String toString()', (self) => jstr(self));
    def(cls, 'boolean equals(Object)', (self, [o]) => jequals(self, o));
    def(cls, 'int hashCode()', (self) => jhash(self));
    def(cls, `int compareTo(${cls.name})`, (self, [o]) => jcompare(self, o));
    def(cls, `static ${cls.name} valueOf(${prim})`, (_, [v]) => box(cls.name, v));
    if (parse) def(cls, `static ${prim} ${parse}(String)`, (_, [s]) => parseNum(cls.name, s));
  };
  const parseNum = (kind, s) => {
    if (s === null) thr('NumberFormatException', 'Cannot parse null string');
    const str = s.trim() === s ? s : null;
    if (kind === 'Integer' || kind === 'Long') {
      if (str !== null && /^[+-]?\d+$/.test(str)) {
        const v = Number(str);
        if (kind === 'Integer' && (v > 2147483647 || v < -2147483648)) thr('NumberFormatException', `For input string: "${s}" (too big for an int)`);
        return v;
      }
      thr('NumberFormatException', `For input string: "${s}"`);
    }
    if (kind === 'Boolean') return s.toLowerCase() === 'true';
    if (str !== null && str !== '' && !isNaN(Number(str))) return Number(str);
    thr('NumberFormatException', `For input string: "${s}"`);
  };
  boxMethods(Integer, 'int', 'parseInt');
  boxMethods(Double, 'double', 'parseDouble');
  boxMethods(Long, 'long', 'parseLong');
  boxMethods(Float, 'float', 'parseFloat');
  boxMethods(Short, 'short', null);
  boxMethods(Byte, 'byte', null);
  boxMethods(Boolean_, 'boolean', 'parseBoolean');
  boxMethods(Character, 'char', null);
  for (const c of [Integer, Long, Short, Byte, Float]) {
    def(c, 'int intValue()', (self) => self.v | 0);
    def(c, 'double doubleValue()', (self) => self.v);
  }
  def(Double, 'int intValue()', (self) => toInt(self.v));
  def(Number_, 'abstract int intValue()', null);
  def(Number_, 'abstract double doubleValue()', null);
  def(Integer, 'static String toString(int)', (_, [v]) => String(v));
  def(Integer, 'static int compare(int,int)', (_, [a, b]) => (a < b ? -1 : a > b ? 1 : 0));
  def(Integer, 'static int max(int,int)', (_, [a, b]) => Math.max(a, b));
  def(Integer, 'static int min(int,int)', (_, [a, b]) => Math.min(a, b));
  def(Integer, 'static int sum(int,int)', (_, [a, b]) => (a + b) | 0);
  def(Integer, 'static String toBinaryString(int)', (_, [v]) => (v >>> 0).toString(2));
  def(Double, 'static String toString(double)', (_, [v]) => fmtDouble(v));
  def(Double, 'static boolean isNaN(double)', (_, [v]) => Number.isNaN(v));
  def(Double, 'static int compare(double,double)', (_, [a, b]) => (a < b ? -1 : a > b ? 1 : 0));
  field(Integer, 'MAX_VALUE', 'int', 2147483647);
  field(Integer, 'MIN_VALUE', 'int', -2147483648);
  field(Long, 'MAX_VALUE', 'long', 9223372036854775807);
  field(Long, 'MIN_VALUE', 'long', -9223372036854775808);
  field(Double, 'MAX_VALUE', 'double', Number.MAX_VALUE);
  field(Double, 'MIN_VALUE', 'double', Number.MIN_VALUE);
  field(Double, 'POSITIVE_INFINITY', 'double', Infinity);
  field(Double, 'NEGATIVE_INFINITY', 'double', -Infinity);
  field(Double, 'NaN', 'double', NaN);
  const C = (spec, fn) => def(Character, spec, fn);
  const ch = (c) => String.fromCharCode(c);
  C('static boolean isDigit(char)', (_, [c]) => /\d/.test(ch(c)));
  C('static boolean isLetter(char)', (_, [c]) => /\p{L}/u.test(ch(c)));
  C('static boolean isLetterOrDigit(char)', (_, [c]) => /[\p{L}\d]/u.test(ch(c)));
  C('static boolean isUpperCase(char)', (_, [c]) => ch(c) !== ch(c).toLowerCase());
  C('static boolean isLowerCase(char)', (_, [c]) => ch(c) !== ch(c).toUpperCase());
  C('static boolean isWhitespace(char)', (_, [c]) => /\s/.test(ch(c)));
  C('static char toUpperCase(char)', (_, [c]) => ch(c).toUpperCase().charCodeAt(0));
  C('static char toLowerCase(char)', (_, [c]) => ch(c).toLowerCase().charCodeAt(0));
  C('static int getNumericValue(char)', (_, [c]) => (/\d/.test(ch(c)) ? Number(ch(c)) : -1));
  C('static String toString(char)', (_, [c]) => ch(c));

  // ----- Math -----
  const M = (spec, fn) => def(Math_, spec, fn);
  field(Math_, 'PI', 'double', Math.PI);
  field(Math_, 'E', 'double', Math.E);
  M('static int abs(int)', (_, [a]) => Math.abs(a) | 0);
  M('static long abs(long)', (_, [a]) => Math.abs(a));
  M('static double abs(double)', (_, [a]) => Math.abs(a));
  for (const t of ['int', 'long', 'double']) {
    M(`static ${t} max(${t},${t})`, (_, [a, b]) => Math.max(a, b));
    M(`static ${t} min(${t},${t})`, (_, [a, b]) => Math.min(a, b));
  }
  M('static double pow(double,double)', (_, [a, b]) => Math.pow(a, b));
  M('static double sqrt(double)', (_, [a]) => Math.sqrt(a));
  M('static double cbrt(double)', (_, [a]) => Math.cbrt(a));
  M('static double random()', () => Math.random());
  M('static long round(double)', (_, [a]) => Math.floor(a + 0.5));
  M('static int round(float)', (_, [a]) => Math.floor(a + 0.5));
  M('static double floor(double)', (_, [a]) => Math.floor(a));
  M('static double ceil(double)', (_, [a]) => Math.ceil(a));
  M('static double rint(double)', (_, [a]) => Math.round(a));
  for (const f of ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'exp', 'log', 'log10']) {
    M(`static double ${f}(double)`, (_, [a]) => Math[f](a));
  }
  M('static double atan2(double,double)', (_, [a, b]) => Math.atan2(a, b));
  M('static double hypot(double,double)', (_, [a, b]) => Math.hypot(a, b));
  M('static double signum(double)', (_, [a]) => Math.sign(a));
  M('static double toRadians(double)', (_, [a]) => (a * Math.PI) / 180);
  M('static double toDegrees(double)', (_, [a]) => (a * 180) / Math.PI);
  M('static int floorDiv(int,int)', (_, [a, b]) => { if (b === 0) thr('ArithmeticException', '/ by zero'); return Math.floor(a / b); });
  M('static int floorMod(int,int)', (_, [a, b]) => { if (b === 0) thr('ArithmeticException', '/ by zero'); return ((a % b) + b) % b; });

  // ----- System / PrintStream -----
  const outF = new FieldInfo('out', classT(PrintStream), { isStatic: true, isFinal: true, access: 'public', owner: System });
  outF.key = 'System.out';
  System.fields.set('out', outF);
  System.statics.out = new JObj(PrintStream);
  const errF = new FieldInfo('err', classT(PrintStream), { isStatic: true, isFinal: true, access: 'public', owner: System });
  errF.key = 'System.err';
  System.fields.set('err', errF);
  System.statics.err = new JObj(PrintStream);
  System.statics.err.isErr = true;
  def(System, 'static long currentTimeMillis()', () => Date.now());
  def(System, 'static long nanoTime()', () => Math.round(performance.now() * 1e6));
  def(System, 'static void exit(int)', () => { throw new HaltSignal('exit', 'System.exit'); });
  const P = (spec, fn) => def(PrintStream, spec, fn);
  const emit = (self, s) => rt().print(s, self.isErr);
  P('void println()', (self) => emit(self, '\n'));
  P('void println(boolean)', (self, [v]) => emit(self, String(v) + '\n'));
  P('void println(char)', (self, [v]) => emit(self, String.fromCharCode(v) + '\n'));
  P('void println(int)', (self, [v]) => emit(self, String(v) + '\n'));
  P('void println(long)', (self, [v]) => emit(self, String(v) + '\n'));
  P('void println(double)', (self, [v]) => emit(self, fmtDouble(v) + '\n'));
  P('void println(char[])', (self, [v]) => emit(self, v.data.map((c) => String.fromCharCode(c)).join('') + '\n'));
  P('void println(String)', (self, [v]) => emit(self, (v === null ? 'null' : v) + '\n'));
  P('void println(Object)', (self, [v]) => emit(self, jstr(v) + '\n'));
  P('void print(boolean)', (self, [v]) => emit(self, String(v)));
  P('void print(char)', (self, [v]) => emit(self, String.fromCharCode(v)));
  P('void print(int)', (self, [v]) => emit(self, String(v)));
  P('void print(long)', (self, [v]) => emit(self, String(v)));
  P('void print(double)', (self, [v]) => emit(self, fmtDouble(v)));
  P('void print(String)', (self, [v]) => emit(self, v === null ? 'null' : v));
  P('void print(Object)', (self, [v]) => emit(self, jstr(v)));
  P('PrintStream printf(String,Object...)', (self, [f, args]) => { emit(self, javaFormat(f, args.data)); return self; });
  P('PrintStream format(String,Object...)', (self, [f, args]) => { emit(self, javaFormat(f, args.data)); return self; });

  // ----- Throwable -----
  const msgKey = 'Throwable.message';
  const msgF = new FieldInfo('message', classT(String_), { access: 'private', owner: Throwable });
  msgF.key = msgKey;
  Throwable.fields.set('message', msgF);
  for (const c of reg.values()) {
    if (c === Throwable || (c.superclass && isThrowable(c))) {
      def(c, 'void <init>()', (self) => { self.f[msgKey] = null; });
      def(c, 'void <init>(String)', (self, [m]) => { self.f[msgKey] = m; });
    }
  }
  def(Throwable, 'String getMessage()', (self) => self.f[msgKey] ?? null);
  def(Throwable, 'String toString()', (self) => {
    const m = self.f[msgKey];
    return qualifiedName(self.cls) + (m != null ? ': ' + m : '');
  });
  def(Throwable, 'void printStackTrace()', (self) => rt().print(jstr(self) + '\n', true));

  // ----- Iterable / Collection / List / ArrayList -----
  const listMethods = (cls) => {
    const L = (spec, fn) => def(cls, spec, fn);
    const idx = (self, i, size = self.list.length) => {
      if (i < 0 || i >= size) thr('IndexOutOfBoundsException', `Index ${i} out of bounds for length ${self.list.length}`);
    };
    L('boolean add(E)', (self, [v]) => { self.list.push(v); self.mod++; return true; });
    L('void add(int,E)', (self, [i, v]) => { idx(self, i, self.list.length + 1); self.list.splice(i, 0, v); self.mod++; });
    L('E get(int)', (self, [i]) => { idx(self, i); return self.list[i]; });
    L('E set(int,E)', (self, [i, v]) => { idx(self, i); const old = self.list[i]; self.list[i] = v; return old; });
    L('E remove(int)', (self, [i]) => { idx(self, i); self.mod++; return self.list.splice(i, 1)[0]; });
    L('boolean remove(Object)', (self, [v]) => {
      const i = self.list.findIndex((x) => jequals(v, x));
      if (i < 0) return false;
      self.list.splice(i, 1);
      self.mod++;
      return true;
    });
    L('int size()', (self) => self.list.length);
    L('boolean isEmpty()', (self) => self.list.length === 0);
    L('boolean contains(Object)', (self, [v]) => self.list.some((x) => jequals(v, x)));
    L('int indexOf(Object)', (self, [v]) => self.list.findIndex((x) => jequals(v, x)));
    L('void clear()', (self) => { self.list.length = 0; self.mod++; });
    L('boolean addAll(Collection<E>)', (self, [o]) => { self.list.push(...o.list); self.mod++; return o.list.length > 0; });
    L('String toString()', (self) => '[' + self.list.map((x) => (x === self ? '(this Collection)' : jstr(x))).join(', ') + ']');
    L('boolean equals(Object)', (self, [o]) => o instanceof JObj && Array.isArray(o.list) && o.list.length === self.list.length && o.list.every((x, i) => jequals(self.list[i], x)));
    L('int hashCode()', (self) => self.list.reduce((h, x) => (Math.imul(h, 31) + jhash(x)) | 0, 1));
  };
  listMethods(Collection);
  listMethods(List);
  listMethods(ArrayList);
  def(ArrayList, 'void <init>()', (self) => { self.list = []; self.mod = 0; });
  def(ArrayList, 'void <init>(int)', (self, [n]) => {
    if (n < 0) thr('IllegalArgumentException', 'Illegal Capacity: ' + n);
    self.list = []; self.mod = 0;
  });
  def(ArrayList, 'void <init>(Collection<E>)', (self, [o]) => { self.list = o.list.slice(); self.mod = 0; });

  // ----- Random -----
  const rand = (self) => {
    if (self.seed === undefined) return Math.random();
    // mulberry32
    let t = (self.seed = (self.seed + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  def(Random, 'void <init>()', () => {});
  def(Random, 'void <init>(long)', (self, [s]) => { self.seed = s | 0; });
  def(Random, 'int nextInt()', (self) => Math.floor(rand(self) * 4294967296) | 0);
  def(Random, 'int nextInt(int)', (self, [n]) => {
    if (n <= 0) thr('IllegalArgumentException', 'bound must be positive');
    return Math.floor(rand(self) * n);
  });
  def(Random, 'int nextInt(int,int)', (self, [a, b]) => {
    if (b <= a) thr('IllegalArgumentException', 'bound must be greater than origin');
    return a + Math.floor(rand(self) * (b - a));
  });
  def(Random, 'double nextDouble()', (self) => rand(self));
  def(Random, 'boolean nextBoolean()', (self) => rand(self) < 0.5);

  // ----- Arrays -----
  const arrStr = (a, f) => (a === null ? 'null' : '[' + a.data.map(f).join(', ') + ']');
  def(Arrays, 'static String toString(int[])', (_, [a]) => arrStr(a, String));
  def(Arrays, 'static String toString(long[])', (_, [a]) => arrStr(a, String));
  def(Arrays, 'static String toString(double[])', (_, [a]) => arrStr(a, fmtDouble));
  def(Arrays, 'static String toString(char[])', (_, [a]) => arrStr(a, (c) => String.fromCharCode(c)));
  def(Arrays, 'static String toString(boolean[])', (_, [a]) => arrStr(a, String));
  def(Arrays, 'static String toString(Object[])', (_, [a]) => arrStr(a, jstr));
  for (const t of ['int', 'long', 'double', 'char']) {
    def(Arrays, `static void sort(${t}[])`, (_, [a]) => { a.data.sort((x, y) => x - y); });
    def(Arrays, `static void fill(${t}[],${t})`, (_, [a, v]) => { a.data.fill(v); });
  }
  def(Arrays, 'static void sort(Object[])', (_, [a]) => { a.data.sort((x, y) => jcompare(x, y)); });
  def(Arrays, 'static void fill(Object[],Object)', (_, [a, v]) => { a.data.fill(v); });
  def(Arrays, 'static void fill(boolean[],boolean)', (_, [a, v]) => { a.data.fill(v); });

  def(Thread, 'static void sleep(long)', (_, [ms]) => { rt().world.pause(ms / 1000); });

  // ----- World (the sandbox API) -----
  const needObj = (o, what) => {
    if (o === null) thr('NullPointerException', `${what} got null. Create the object with new first.`);
    if (!(o instanceof JObj) || o.cls.builtin) thr('IllegalArgumentException', `${what} needs an object made from one of your classes`);
  };
  const W = (spec, fn) => def(World, spec, fn);
  W('static void add(Object)', (_, [o]) => { needObj(o, 'World.add'); rt().world.add(o); });
  W('static void remove(Object)', (_, [o]) => { needObj(o, 'World.remove'); rt().world.remove(o); });
  W('static void pause(double)', (_, [s]) => {
    if (s < 0) thr('IllegalArgumentException', "World.pause can't wait a negative time");
    rt().world.pause(s);
  });
  W('static void say(String)', (_, [s]) => rt().world.push({ type: 'say', id: 0, text: s === null ? 'null' : s }));
  W('static void say(Object,String)', (_, [o, s]) => {
    needObj(o, 'World.say');
    const id = rt().world.ids.get(o);
    if (!id) thr('IllegalStateException', 'Add the object to the world with World.add(...) before it can talk');
    rt().world.push({ type: 'say', id, text: s === null ? 'null' : s });
  });
  W('static void setSky(String)', (_, [c]) => rt().world.push({ type: 'sky', color: checkColor(c, 'World.setSky') }));
  W('static void setGround(String)', (_, [c]) => rt().world.push({ type: 'ground', color: checkColor(c, 'World.setGround') }));
  const block = (x, y, z, c) => {
    const w = rt().world;
    if (++w.blockCount > 3000) throw new HaltSignal('limit', 'Too many blocks! The world can hold 3000.');
    if (Math.abs(x) > 40 || Math.abs(z) > 40 || y < -5 || y > 60) {
      rt().warn(`A block at (${x}, ${y}, ${z}) is very far from the island and may be hard to see.`);
    }
    w.push({ type: 'block', x, y, z, color: checkColor(c, 'World.block') });
  };
  W('static void block(int,int,String)', (_, [x, z, c]) => block(x, 0, z, c));
  W('static void block(int,int,int,String)', (_, [x, y, z, c]) => block(x, y, z, c));
  W('static void tree(int,int)', (_, [x, z]) => rt().world.push({ type: 'tree', x, z }));
  W('static void flower(int,int,String)', (_, [x, z, c]) => rt().world.push({ type: 'flower', x, z, color: checkColor(c, 'World.flower') }));
  W('static double time()', () => rt().world.time);

  return reg;
}

function isThrowable(c) {
  for (let x = c; x; x = x.superclass) if (x.name === 'Throwable') return true;
  return false;
}

export function toInt(v) {
  if (Number.isNaN(v)) return 0;
  if (v >= 2147483647) return 2147483647;
  if (v <= -2147483648) return -2147483648;
  return Math.trunc(v);
}

export { JBox };
