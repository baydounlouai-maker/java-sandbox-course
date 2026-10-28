// Proves the exam's answer key with the real engine: output questions print the right option,
// every accepted blank compiles and prints the expected output, broken programs really are
// broken, and the model solutions get full marks while the starters get none.
import { compileJava, formatException } from '../js/java/index.js';
import { QUESTIONS, SECTIONS, TOTAL_POINTS } from '../js/exam/questions.js';
import { gradeObjective, gradeCode, fillProgram, outputText, normalizeBlank, keptRatio } from '../js/exam/grade.js';

let bad = 0;
const fail = (id, ...msg) => { bad++; console.log('FAIL', id.padEnd(18), ...msg); };
const ok = (id, ...msg) => console.log('ok  ', id.padEnd(18), ...msg);

function runSrc(src) {
  const p = compileJava([{ name: 'Main.java', src }]);
  if (!p.ok) return { errors: p.errors.map((e) => `${e.line}: ${e.message}`) };
  const r = p.run();
  return { out: outputText(r.output), exception: r.exception && formatException(r.exception), error: r.error };
}

const wrapMain = (code) => `public class Main {\n    public static void main(String[] args) {\n${code}\n    }\n}`;
const plain = (s) => s.replace(/^`|`$/g, '');

if (TOTAL_POINTS !== 100) fail('total', `points add up to ${TOTAL_POINTS}, not 100`);
const ids = new Set();
for (const q of QUESTIONS) {
  if (ids.has(q.id)) fail(q.id, 'duplicate id');
  ids.add(q.id);
  if (!SECTIONS.some((s) => s.id === q.section)) fail(q.id, 'unknown section');

  if (q.section === 'mcq' || q.section === 'tf') {
    if (gradeObjective(q, q.answer).status !== 'right') fail(q.id, 'answer key does not grade as right');
    if (q.run) {
      const r = runSrc(q.run === 'file' ? q.file : wrapMain(q.code));
      const want = plain(q.options[q.answer]);
      if (r.errors || r.exception) fail(q.id, 'snippet does not run', r.errors || r.exception);
      else if (r.out !== want) fail(q.id, `prints ${JSON.stringify(r.out)}, key says ${JSON.stringify(want)}`);
      else if (q.options.filter((o) => plain(o) === r.out).length !== 1) fail(q.id, 'more than one option matches');
      else ok(q.id, 'prints', JSON.stringify(r.out));
    } else ok(q.id);
  }

  if (q.section === 'fill') {
    let good = true;
    const n = (q.template.match(/\[\[\d+\]\]/g) || []).length;
    if (n !== q.blanks.length) { fail(q.id, `${n} blanks in template, ${q.blanks.length} in key`); continue; }
    // every accepted answer, with the other blanks at their first answer
    q.blanks.forEach((b, i) => b.answers.forEach((a) => {
      const vals = q.blanks.map((x) => x.answers[0]);
      vals[i] = a;
      const r = runSrc(fillProgram(q, vals));
      if (r.errors || r.exception || r.out !== q.expect) { good = false; fail(q.id, `blank ${i} = ${a}:`, r.errors || r.exception || JSON.stringify(r.out)); }
    }));
    if (gradeObjective(q, q.blanks.map((b) => ' ' + b.answers[0].replace(/ /g, '') + ' ')).status !== 'right') { good = false; fail(q.id, 'spacing changes the mark'); }
    if (gradeObjective(q, q.blanks.map(() => 'x')).score !== 0) { good = false; fail(q.id, 'wrong answers score'); }
    if (good) ok(q.id, `${q.blanks.length} blanks`);
  }

  if (q.section === 'fix') {
    const p = compileJava([{ name: 'Main.java', src: q.broken }]);
    const r = runSrc(q.solution);
    const g = gradeCode(q, q.solution);
    const blank = gradeCode(q, q.broken);
    const printIt = `System.out.println("${q.expect.replace(/\n/g, '\\n')}");`;
    const cheatSrc = wrapMain('        ' + printIt);
    // keep every class but replace main's body with a print of the answer
    const cheat2Src = q.solution.replace(/(public static void main\(String\[\] args\) \{)[\s\S]*?\n    \}/, `$1\n        ${printIt}\n    }`);
    const cheat = gradeCode(q, cheatSrc);
    const cheat2 = gradeCode(q, cheat2Src);
    if (p.ok) fail(q.id, 'broken program compiles');
    else if (r.out !== q.expect) fail(q.id, 'solution prints', JSON.stringify(r.out), r.errors || r.exception || '');
    else if (g.score !== q.points) fail(q.id, 'solution scores', g.score, g.note || '');
    else if (blank.score !== 0) fail(q.id, 'untouched program scores', blank.score);
    else if (cheat.score !== 0) fail(q.id, 'a rewrite that just prints the answer scores', cheat.score);
    else if (cheat2.score !== 0) fail(q.id, 'replacing main with a print scores', cheat2.score, keptRatio(q.broken, cheat2Src).toFixed(2));
    else ok(q.id, `broken: ${p.errors[0].message.slice(0, 60)}`, `| kept ${keptRatio(q.broken, q.solution).toFixed(2)}, cheat ${keptRatio(q.broken, cheatSrc).toFixed(2)}, keep-classes cheat ${keptRatio(q.broken, cheat2Src).toFixed(2)}`);
  }

  if (q.section === 'write') {
    const g = gradeCode(q, q.solution);
    const s = gradeCode(q, q.starter);
    const sol = runSrc(q.solution);
    if (g.score !== q.points) fail(q.id, 'solution scores', g.score, JSON.stringify(g.tests || g.errors || g.note));
    else if (s.score !== 0) fail(q.id, 'starter scores', s.score);
    else if (sol.errors || sol.exception) fail(q.id, 'solution main does not run');
    else ok(q.id, `${q.tests.length} tests`, `| starter: ${s.note}`);
  }
}

// a few grader edge cases
const vowels = QUESTIONS.find((q) => q.id === 'write-vowels');
const g1 = gradeCode(vowels, vowels.solution.replace('public static int countVowels', 'public int countVowels').replace(/System.out.println\(countVowels\("Banana"\)\);/, ''));
if (g1.score !== 0 || !/static/.test(g1.note)) fail('edge-static', g1.note);
const g2 = gradeCode(vowels, vowels.solution.replace('word.toLowerCase()', 'word'));
if (!(g2.score > 0 && g2.score < 10)) fail('edge-partial', g2.score);
const g3 = gradeCode(vowels, vowels.solution.replace('i++', 'i += 0'));
if (g3.score > 2) fail('edge-loop', g3.score, JSON.stringify(g3.tests));
const run = QUESTIONS.find((q) => q.id === 'write-running');
const g4 = gradeCode(run, run.solution.replace('int[] result = new int[nums.length];', 'int[] result = nums;'));
if (g4.tests.at(-1).ok) fail('edge-unchanged', 'mutating the input was not caught');
if (normalizeBlank(' i  <= 5 ; ') !== 'i<=5') fail('edge-normalize', normalizeBlank(' i  <= 5 ; '));
console.log(bad ? `\n${bad} problem(s)` : `\nexam ok: ${QUESTIONS.length} questions, ${TOTAL_POINTS} points`);
process.exit(bad ? 1 : 0);
