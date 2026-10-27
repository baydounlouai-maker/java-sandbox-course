import { compileJava, formatException } from '../js/java/index.js';
import { LESSONS } from '../js/lessons.js';
import { makeCheckContext, runChecks } from '../js/checks.js';
const files = (o) => Object.entries(o).map(([name, src]) => ({ name, src }));
let bad = 0;
for (const l of LESSONS) {
  const sp = compileJava(files(l.starter));
  const starterOk = sp.errors.length === 0 || (sp.errors.length === 1 && /no main/.test(sp.errors[0].message));
  if (!starterOk) { bad++; console.log('STARTER FAIL', l.id, sp.errors.map((e) => `${e.file}:${e.line} ${e.message}`)); }
  if (!l.solution) continue;
  const p = compileJava(files(l.solution));
  if (!p.ok) { bad++; console.log('SOLUTION COMPILE FAIL', l.id, p.errors.map((e) => `${e.file}:${e.line} ${e.message}`)); continue; }
  const res = p.run();
  if (res.exception || res.error) { bad++; console.log('RUN FAIL', l.id, formatException(res.exception), res.error); continue; }
  const results = runChecks(l, makeCheckContext(p, res));
  const failed = results.map((r, i) => [r, i]).filter(([r]) => !r.done);
  // starter should not already pass everything
  const sres = sp.ok ? sp.run() : null;
  const sdone = sres ? runChecks(l, makeCheckContext(sp, sres)).filter((r) => r.done).length : 0;
  if (failed.length) bad++;
  console.log(failed.length ? 'FAIL' : 'ok  ', l.id.padEnd(16), `${results.length - failed.length}/${results.length}`, `starter passes ${sdone}`,
    failed.map(([r, i]) => `#${i + 1} ${r.note || ''}`).join('; '), p.warnings.map((w) => 'WARN ' + w.message).join(' '));
}
process.exit(bad ? 1 : 0);
