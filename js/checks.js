// Builds the object that lesson checks receive after a run.
import { buildTimeline, finalState } from './world/timeline.js';

export function makeCheckContext(prog, res) {
  const tl = buildTimeline(res.world.events);
  const out = res.output.filter((l) => l.kind === 'out').map((l) => l.text);
  const objects = [...res.world.ids.keys()];
  const entities = tl.entities
    .filter((e) => e.removeT === Infinity)
    .map((e) => {
      const fin = finalState(e);
      return { id: e.id, cls: e.cls, chain: e.chain, props: fin.props, fields: fin.fields, keys: e.keys };
    });
  const ctx = {
    prog,
    res,
    tl,
    out,
    text: out.join('\n'),
    ok: !res.exception && !res.error,
    has: (f) => prog.features.has(f),
    cls: (n) => prog.classInfo(n),
    classes: prog.classNames(),
    entities,
    ofClass: (n) => entities.filter((e) => e.chain.includes(n)),
    objects,
    objectsOf: (n) => objects.filter((o) => prog.isInstanceOf(o, n)),
    call: (o, m, args = []) => prog.callMethod(o, m, args),
    callStatic: (c, m, args = []) => prog.callStatic(c, m, args),
    get: (o, f) => prog.getField(o, f),
    getStatic: (c, f) => prog.getStatic(c, f),
    newObj: (c, args = []) => prog.newObject(c, args),
    line: (s) => out.some((l) => l.trim() === s),
    lineMatch: (re) => {
      for (const l of out) {
        const m = l.match(re);
        if (m) return m;
      }
      return null;
    },
    blocks: tl.blocks,
    trees: tl.trees,
    flowers: tl.flowers,
    says: tl.says,
    sky: tl.sky.length ? tl.sky[tl.sky.length - 1].color : null,
    // a class's own field by name (case-insensitive)
    field: (clsName, fieldName) => {
      const c = prog.classInfo(clsName);
      return c ? c.fields.find((f) => f.name.toLowerCase() === fieldName.toLowerCase()) : null;
    },
    method: (clsName, name, nParams) => {
      const c = prog.classInfo(clsName);
      return c ? c.methods.find((m) => m.name === name && (nParams === undefined || m.params.length === nParams)) : null;
    },
    // columns of stacked blocks, keyed by "x,z"
    columns: () => {
      const cols = new Map();
      for (const b of tl.blocks) {
        const k = b.x + ',' + b.z;
        if (!cols.has(k)) cols.set(k, new Set());
        cols.get(k).add(b.y);
      }
      return cols;
    }
  };
  return ctx;
}

export function runChecks(lesson, ctx) {
  return lesson.steps.map((s) => {
    if (!ctx.ok && !s.allowException) return { done: false };
    try {
      const r = s.check(ctx);
      if (r === true) return { done: true };
      return { done: false, note: typeof r === 'string' ? r : null };
    } catch (e) {
      return { done: false };
    }
  });
}
