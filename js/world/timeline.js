// Turns the recorded world events of one program run into something easy to play back.

export function buildTimeline(events) {
  const entities = new Map();
  const blocks = [];
  const trees = [];
  const flowers = [];
  const sky = [];
  const ground = [];
  const says = [];
  let duration = 0;

  for (const ev of events) {
    duration = Math.max(duration, ev.t);
    switch (ev.type) {
      case 'add': {
        entities.set(ev.id, {
          id: ev.id,
          chain: ev.state.chain,
          cls: ev.state.chain[0],
          addT: ev.t,
          removeT: Infinity,
          keys: [{ t: ev.t, props: ev.state.props, fields: ev.state.fields }]
        });
        break;
      }
      case 'remove': {
        const e = entities.get(ev.id);
        if (e) e.removeT = ev.t;
        break;
      }
      case 'snap': {
        for (const [id, state] of ev.states) {
          const e = entities.get(id);
          if (!e) continue;
          const last = e.keys[e.keys.length - 1];
          if (last.t === ev.t) {
            last.props = state.props;
            last.fields = state.fields;
          } else {
            e.keys.push({ t: ev.t, props: state.props, fields: state.fields });
          }
        }
        break;
      }
      case 'block': blocks.push(ev); break;
      case 'tree': trees.push(ev); break;
      case 'flower': flowers.push(ev); break;
      case 'sky': sky.push(ev); break;
      case 'ground': ground.push(ev); break;
      case 'say': says.push(ev); break;
    }
  }

  const list = [...entities.values()];
  autoLayout(list);
  return { entities: list, blocks, trees, flowers, sky, ground, says, duration };
}

// entities without x/z fields get spread out in a row so they don't overlap
function autoLayout(list) {
  const unplaced = list.filter((e) => !e.keys.some((k) => 'x' in k.props || 'z' in k.props));
  const n = unplaced.length;
  const gap = n > 8 ? 1.6 : 2.2;
  unplaced.forEach((e, i) => {
    e.autoX = (i - (n - 1) / 2) * gap;
    e.autoZ = 0;
  });
}

// props of an entity at time t (tweened between keyframes)
export function propsAt(e, t) {
  const keys = e.keys;
  if (t <= keys[0].t) return keys[0].props;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t >= a.t && t < b.t) {
      const k = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
      return lerpProps(a.props, b.props, ease(k));
    }
  }
  return keys[keys.length - 1].props;
}

function ease(k) {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

function lerpProps(a, b, k) {
  const out = { ...b };
  for (const key of ['x', 'y', 'z', 'height', 'size', 'health']) {
    if (typeof a[key] === 'number' && typeof b[key] === 'number') out[key] = a[key] + (b[key] - a[key]) * k;
  }
  if (k < 0.5) {
    for (const key of ['color', 'name', 'angry', 'eyeColor', 'hat']) if (key in a) out[key] = a[key];
  }
  return out;
}

export function finalState(e) {
  return e.keys[e.keys.length - 1];
}
