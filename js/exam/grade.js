// Marks exam answers. Objective questions are marked on the page; code questions are marked
// in the exam worker (gradeCode) so a student's endless loop can't freeze the page.
import { compileJava, formatException, JArray } from '../java/index.js';
import { T, arrayT, classT, getClass } from '../java/model.js';

// a "find and fix" answer must keep this share of the original program's tokens
const MIN_KEPT = 0.9;

export function outputText(output) {
  return output.filter((l) => l.kind !== 'warn').map((l) => l.text.replace(/\s+$/, '')).join('\n').replace(/\n+$/, '');
}

// "i<=5", "i <= 5" and " i  <=5 ;" all become "i<=5"
export function normalizeBlank(s) {
  let t = String(s ?? '').trim().replace(/;+$/, '').trim().replace(/\s+/g, ' ');
  t = t.replace(/ ?([^\w\s"']) ?/g, '$1');
  return t;
}

export function fillProgram(q, values) {
  return q.template.replace(/\[\[(\d+)\]\]/g, (_, i) => values[Number(i)] ?? '');
}

const result = (q, score, extra = {}) => ({
  score, max: q.points,
  status: score >= q.points ? 'right' : score > 0 ? 'partial' : 'wrong',
  ...extra
});

export function gradeObjective(q, answer) {
  if (q.section === 'mcq' || q.section === 'tf') {
    if (answer === undefined || answer === null) return result(q, 0, { status: 'blank' });
    return result(q, answer === q.answer ? q.points : 0);
  }
  if (q.section === 'fill') {
    const values = Array.isArray(answer) ? answer : [];
    if (!values.some((v) => v && v.trim())) return result(q, 0, { status: 'blank', blanks: q.blanks.map(() => false) });
    const blanks = q.blanks.map((b, i) => b.answers.some((a) => normalizeBlank(a) === normalizeBlank(values[i])));
    const each = q.points / q.blanks.length;
    return result(q, roundHalf(blanks.filter(Boolean).length * each), { blanks });
  }
  throw new Error('not an objective question: ' + q.id);
}

const roundHalf = (x) => Math.round(x * 2) / 2;

// ---------------------------------------------------------------- code questions
export function compileMain(code) {
  return compileJava([{ name: 'Main.java', src: code }]);
}

function compileErrors(prog) {
  return prog.errors.slice(0, 5).map((e) => ({ line: e.line, col: e.col, message: e.message, hint: e.hint }));
}

// share of the original program's tokens still there, in order (1 = untouched)
export function keptRatio(orig, now) {
  const tok = (src) => src.replace(/\/\/[^\n]*/g, '').match(/\w+|"[^"\n]*"?|\S/g) || [];
  const a = tok(orig);
  const b = tok(now);
  let prev = new Array(b.length + 1).fill(0);
  for (let i = a.length - 1; i >= 0; i--) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = b.length - 1; j >= 0; j--) cur[j] = a[i] === b[j] ? prev[j + 1] + 1 : Math.max(prev[j], cur[j + 1]);
    prev = cur;
  }
  return a.length ? prev[0] / a.length : 1;
}

export function gradeCode(q, code) {
  if (q.section === 'fix') return gradeFix(q, code);
  if (q.section === 'write') return gradeWrite(q, code);
  throw new Error('not a code question: ' + q.id);
}

function gradeFix(q, code) {
  code = code ?? q.broken;
  if (code.trim() === q.broken.trim()) return result(q, 0, { status: 'blank', note: 'The program was left as it was.' });
  if (keptRatio(q.broken, code) < MIN_KEPT) {
    return result(q, 0, { note: `Too much of the original program was changed or removed. Fixing ${q.mistakes === 1 ? 'the mistake' : `${q.mistakes} mistakes`} only takes a few small edits, so this counts as a rewrite.` });
  }
  const prog = compileMain(code);
  if (!prog.ok) {
    const errors = prog.errors.length ? compileErrors(prog) : [{ message: 'There is no main method.' }];
    return result(q, 0, { errors, note: 'It still doesn’t compile.' });
  }
  const run = prog.run({ budget: 20_000_000 });
  const out = outputText(run.output);
  if (run.exception || run.error) {
    return result(q, 1, { output: out, note: 'It compiles now, but it crashed when it ran: ' + (run.exception ? formatException(run.exception).split('\n')[0] : run.error.message) });
  }
  if (out !== q.expect) return result(q, 1, { output: out, note: 'It compiles now, but it doesn’t print what it should.' });
  return result(q, q.points, { output: out });
}

const typeOf = (name) => {
  if (name.endsWith('[]')) return arrayT(typeOf(name.slice(0, -2)));
  return T[name] || classT(getClass(name));
};

const show = (v) => {
  if (Array.isArray(v)) return '{' + v.map(show).join(', ') + '}';
  if (typeof v === 'string') return JSON.stringify(v);
  return String(v);
};

const fromJava = (v) => (v instanceof JArray ? v.data.slice() : v);
const same = (a, b) => (Array.isArray(b) ? Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]) : a === b);

function gradeWrite(q, code) {
  code = code ?? q.starter;
  const sig = `${q.method.name}(${q.method.params.join(', ')})`;
  const prog = compileMain(code);
  const failAll = (note, extra = {}) => result(q, 0, { tests: q.tests.map((t) => ({ label: label(q, t), ok: false })), note, ...extra });
  if (prog.errors.length) return failAll('It doesn’t compile, so none of the tests could run.', { errors: compileErrors(prog) });
  const info = prog.classInfo('Main');
  const found = info && info.methods.filter((m) => m.name === q.method.name);
  if (!found || !found.length) return failAll(`There is no method called ${q.method.name} in Main.`);
  const m = found.find((x) => x.params.join(',') === q.method.params.join(','));
  if (!m) return failAll(`${q.method.name} should take (${q.method.params.join(', ')}), but yours takes (${found[0].params.join(', ')}).`);
  if (!m.isStatic) return failAll(`${sig} has to be static, so it can be called without making an object.`);
  if (m.ret !== q.method.ret) return failAll(`${q.method.name} should return ${q.method.ret}, but yours returns ${m.ret}.`);

  let passed = 0;
  const tests = q.tests.map((t) => {
    const args = t.args.map((a, i) => (Array.isArray(a) ? new JArray(typeOf(q.method.params[i]).elem, a.slice()) : a));
    const r = prog.callStatic('Main', q.method.name, args);
    const row = { label: label(q, t), ok: false };
    if (r.exception) row.note = 'crashed: ' + formatException(r.exception).split('\n')[0].replace('Exception in thread "main" ', '');
    else if (r.error) row.note = r.error.message;
    else {
      const got = fromJava(r.value);
      row.got = show(got);
      row.ok = same(got, t.expect);
      if (row.ok && t.unchanged && !same(args[0].data, t.args[0])) {
        row.ok = false;
        row.note = 'the array that was passed in got changed';
      }
    }
    if (row.ok) passed++;
    return row;
  });
  const score = roundHalf((q.points * passed) / q.tests.length);
  return result(q, score, { tests });
}

function label(q, t) {
  return `${q.method.name}(${t.args.map(show).join(', ')}) returns ${show(t.expect)}`;
}

// What the "Run" button on a Write question shows.
export function runForStudent(code) {
  const prog = compileMain(code);
  if (!prog.ok) {
    const errors = prog.errors.length ? compileErrors(prog) : [{ message: 'There is no main method to run. Keep the main method from the starter code.' }];
    return { compiled: false, errors };
  }
  const run = prog.run({ budget: 50_000_000 });
  return {
    compiled: true,
    output: run.output.map((l) => ({ text: l.text, kind: l.kind })),
    exception: run.exception ? formatException(run.exception) : null,
    error: run.error ? run.error.message : null
  };
}
