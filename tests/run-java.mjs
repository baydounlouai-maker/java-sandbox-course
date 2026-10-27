// quick runner: node tests/run-java.mjs File.java [More.java]
import { readFileSync } from 'fs';
import { compileJava, formatException } from '../js/java/index.js';
const files = process.argv.slice(2).map((p) => ({ name: p.split('/').pop(), src: readFileSync(p, 'utf8') }));
const prog = compileJava(files);
for (const e of prog.errors) console.log(`ERROR ${e.file}:${e.line}:${e.col} ${e.message}${e.hint ? '\n   hint: ' + e.hint : ''}`);
for (const w of prog.warnings) console.log(`WARN ${w.file}:${w.line} ${w.message}`);
if (prog.ok) {
  const r = prog.run();
  for (const l of r.output) console.log((l.kind !== 'out' ? '[' + l.kind + '] ' : '') + l.text);
  if (r.exception) console.log(formatException(r.exception));
  if (r.error) console.log('HALT', r.error);
  console.log('-- events:', r.world.events.length, 'ms', r.ms.toFixed(1));
}
