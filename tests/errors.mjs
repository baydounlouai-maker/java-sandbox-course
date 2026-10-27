import { compileJava } from '../js/java/index.js';
const wrap = (body, extra = '') => `${extra}\npublic class Main {\n  public static void main(String[] args) {\n${body}\n  }\n}`;
const cases = [
  ['missing semi', wrap('int x = 5\nSystem.out.println(x);'), "';' expected"],
  ['undeclared', wrap('System.out.println(y);'), "Cannot find a variable called 'y'"],
  ['typo var', wrap('int count = 1; System.out.println(cout);'), "count"],
  ['lossy', wrap('int x = 2.5;'), 'Possible loss of precision'],
  ['string to int', wrap('int x = "5";'), 'Integer.parseInt'],
  ['uninit', wrap('int x; System.out.println(x);'), 'might not have a value'],
  ['if assign', wrap('int x = 1; if (x = 2) {}'), 'Did you mean =='],
  ['println hint', wrap('println("hi");'), 'System.out.println'],
  ['lowercase string', wrap('string s = "a";'), "String"],
  ['missing return', 'public class Main { static int f() { } public static void main(String[] a) {} }', 'Missing return'],
  ['unreachable', wrap('return; System.out.println(1);'), 'Unreachable'],
  ['static field', 'public class Main { int hp = 3; public static void main(String[] a) { hp = 4; } }', 'static method'],
  ['abstract new', wrap('Monster m = new Monster();', 'abstract class Monster {}'), 'abstract'],
  ['missing impl', wrap('', 'abstract class Monster { abstract String speak(); } class Zombie extends Monster {}'), 'must write the method'],
  ['override typo', wrap('', 'class Monster { String speak() { return ""; } } class Zombie extends Monster { @Override String speek() { return "x"; } }'), '@Override'],
  ['private access', wrap('Monster m = new Monster(); m.hp = 3;', 'class Monster { private int hp; }'), 'private'],
  ['super needed', wrap('', 'class Monster { Monster(String n) {} } class Zombie extends Monster { Zombie() { } }'), 'super(...)'],
  ['iface public', wrap('', 'interface Flyer { double getAltitude(); } class Bat implements Flyer { double getAltitude() { return 1; } }'), 'must be public'],
  ['need import', wrap('ArrayList<String> l = new ArrayList<>();'), 'import java.util.ArrayList'],
  ['public file', 'public class Zombie {} public class Main { public static void main(String[] a){} }', 'Zombie.java'],
  ['no main', 'public class Main { }', 'no main method'],
  ['str length', wrap('String s = "a"; int n = s.length;'), 'parentheses'],
  ['arr length()', wrap('int[] a = new int[3]; int n = a.length();'), 'without parentheses'],
  ['wrong args', wrap('Math.sqrt("x");'), 'should be a double'],
  ['final', wrap('final int X = 1; X = 2;'), 'final'],
  ['not statement', wrap('int x = 1; x == 2;'), 'Not a statement'],
  ['unclosed', 'public class Main { public static void main(String[] a) { ', "never closed"],
  ['else no if', wrap('else { }'), "no matching 'if'"],
  ['call instance from static', 'public class Main { void hi() {} public static void main(String[] a) { hi(); } }', 'static'],
  ['interface extends', wrap('', 'interface A {} class B extends A {}'), 'implements'],
  ['char string', wrap("char c = \"a\";"), 'single quotes'],
  ['compare string ==', wrap('String a = "x"; if (a == "x") {}'), null],
];
let fail = 0;
for (const [name, src, want] of cases) {
  const p = compileJava([{ name: 'Main.java', src }]);
  const msgs = p.errors.map((e) => `${e.line}:${e.col} ${e.message} | ${e.hint ?? ''}`);
  const ok = want === null ? p.errors.length === 0 && p.warnings.length > 0 : msgs.some((m) => m.includes(want));
  if (!ok) fail++;
  console.log(ok ? 'ok  ' : 'FAIL', name.padEnd(24), (msgs[0] || (p.warnings[0] && 'warn: ' + p.warnings[0].message) || '(no error)').slice(0, 150));
}
console.log(fail ? `${fail} failed` : 'all passed');
process.exit(fail ? 1 : 0);
