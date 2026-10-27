// Runs student programs off the main thread so a stuck loop never freezes the page.
import { compileJava, isColor } from './java/index.js';
import { lessonById } from './lessons.js';
import { makeCheckContext, runChecks } from './checks.js';

let last = null; // { prog, objectsById }

self.onmessage = (ev) => {
  const msg = ev.data;
  try {
    if (msg.type === 'run') handleRun(msg);
    else if (msg.type === 'speak') handleSpeak(msg);
  } catch (e) {
    self.postMessage({ type: 'crash', reqId: msg.reqId, message: String(e && e.stack || e) });
  }
};

function handleRun({ reqId, files, lessonId }) {
  const t0 = performance.now();
  const prog = compileJava(files);
  if (!prog.ok) {
    self.postMessage({ type: 'result', reqId, compiled: false, errors: prog.errors, warnings: prog.warnings });
    return;
  }
  const res = prog.run();
  const output = res.output.slice();
  const objectsById = new Map();
  for (const [obj, id] of res.world.ids) objectsById.set(id, obj);
  // colors written into fields are never checked by Java, so check them here
  const warned = new Set();
  for (const ev of res.world.events) {
    if (ev.type !== 'add') continue;
    const c = ev.state.props.color;
    if (c !== undefined && !isColor(c) && !warned.has(c)) {
      warned.add(c);
      output.push({ kind: 'warn', t: ev.t, text: `"${c}" isn't a color the world knows, so ${ev.state.props.name || 'a ' + ev.state.chain[0]} got its default color. Try a name like "green" or a hex code like "#33aa55".` });
    }
  }
  let checks = null;
  const lesson = lessonById(lessonId);
  if (lesson && lesson.steps.length) {
    const ctx = makeCheckContext(prog, res);
    checks = runChecks(lesson, ctx);
  }
  last = { prog, objectsById };
  self.postMessage({
    type: 'result',
    reqId,
    compiled: true,
    warnings: prog.warnings,
    output,
    events: res.world.events,
    exception: res.exception,
    error: res.error,
    checks,
    classes: prog.classNames(),
    ms: performance.now() - t0
  });
}

function handleSpeak({ reqId, id }) {
  if (!last) return;
  const obj = last.objectsById.get(id);
  if (!obj) return;
  const has = [...obj.cls.vtable.values()].some((m) => m.name === 'speak' && m.params.length === 0 && !m.native);
  let text = null;
  let output = [];
  let exception = null;
  if (has) {
    const r = last.prog.callMethod(obj, 'speak', []);
    output = r.output || [];
    exception = r.exception || null;
    if (r.value !== undefined && r.value !== null) text = typeof r.value === 'string' ? r.value : String(r.value);
  }
  self.postMessage({ type: 'spoke', reqId, id, text, hasSpeak: has, output, exception });
}
