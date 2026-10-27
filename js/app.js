// The app: lesson panel, editor, output, world and live rooms.
import { LESSONS, lessonById } from './lessons.js';
import { Session, store, PEER_COLORS, sortFiles } from './session.js';
import { CodeEditor } from './editor.js';
import { World } from './world/world.js';
import { buildTimeline } from './world/timeline.js';
import { newRoomId } from './collab.js';

const $ = (id) => document.getElementById(id);
const RUN_TIMEOUT_MS = 12000;

const progress = store.progress();
let user = store.user();
let session = null;
let lesson = null;
let activeFile = 'Main.java';
let running = false;
let lastChecks = {};
let diagnostics = {};
let consoleLines = [];
let waitTimer = null;
let unsubscribers = [];

// ---------------------------------------------------------------- utilities
function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// error text may contain `code`; render it safely
function richText(s) {
  return escapeHtml(s).replace(/(\b(?:System\.out\.println|Integer\.parseInt|Double\.parseDouble|String\.valueOf)\b[^\s,.]*)/g, '<code>$1</code>');
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function saveProgress() { store.saveProgress(progress); }

function initials(name) {
  const parts = (name || '?').trim().split(/\s+/);
  return ((parts[0] || '?')[0] + (parts[1] ? parts[1][0] : (parts[0] || '')[1] || '')).toUpperCase();
}

// ---------------------------------------------------------------- dialogs
function openDialog(build) {
  const d = $('dialog');
  d.innerHTML = '';
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      d.close();
      resolve(v);
    };
    d.append(build(finish));
    d.onclose = () => finish(null);
    d.showModal();
    const first = d.querySelector('input, button.primary, button.blue');
    if (first) first.focus();
  });
}

function confirmDialog(title, text, okLabel = 'Yes') {
  return openDialog((finish) => el('div', {},
    el('h2', {}, title),
    el('p', { html: text }),
    el('div', { class: 'row' },
      el('button', { type: 'button', class: 'btn ghost', onclick: () => finish(false) }, 'Cancel'),
      el('button', { type: 'button', class: 'btn primary', onclick: () => finish(true) }, okLabel))));
}

function nameDialog(reason) {
  let color = user.color || PEER_COLORS[0];
  return openDialog((finish) => {
    const input = el('input', { type: 'text', id: 'nameInput', maxlength: '24', value: user.name || '', autocomplete: 'nickname' });
    const err = el('div', { class: 'error-text' });
    const swatches = PEER_COLORS.map((c) => {
      const b = el('button', { type: 'button', class: 'swatch', 'aria-label': 'Color ' + c, 'aria-pressed': String(c === color), style: `background:${c}` });
      b.onclick = () => {
        color = c;
        for (const s of swatches) s.setAttribute('aria-pressed', String(s === b));
      };
      return b;
    });
    const submit = () => {
      const name = input.value.trim();
      if (!name) { err.textContent = 'Type a name so others know who you are.'; return; }
      finish({ name, color });
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    return el('div', {},
      el('h2', {}, 'What should we call you?'),
      el('p', {}, reason),
      el('label', { for: 'nameInput' }, 'Your name'),
      input,
      el('div', { class: 'colors', role: 'group', 'aria-label': 'Cursor color' }, swatches),
      err,
      el('div', { class: 'row' },
        el('button', { type: 'button', class: 'btn ghost', onclick: () => finish(null) }, 'Cancel'),
        el('button', { type: 'button', class: 'btn primary', onclick: submit }, 'Continue')));
  });
}

async function ensureName(reason) {
  if (user.name) return true;
  const r = await nameDialog(reason);
  if (!r) return false;
  user = { name: r.name, color: r.color };
  store.saveUser(user);
  if (session) session.setUser(user);
  return true;
}

function roomLink(id) {
  const u = new URL(location.href);
  u.hash = 'room=' + id;
  return u.toString();
}

function inviteDialog() {
  const link = roomLink(session.roomId);
  return openDialog((finish) => {
    const input = el('input', { type: 'text', value: link, readonly: true, 'aria-label': 'Room link' });
    const copy = el('button', { type: 'button', class: 'btn blue', onclick: async () => {
      try { await navigator.clipboard.writeText(link); copy.textContent = 'Copied!'; } catch (e) { input.select(); }
    } }, 'Copy');
    return el('div', {},
      el('h2', {}, 'Invite someone'),
      el('p', {}, 'Send this link to your student or tutor. Everyone who opens it shares the same lesson and the same code, sees each other’s cursors, and when anyone presses Run it runs for everybody.'),
      el('div', { class: 'link-box' }, input, copy),
      el('p', { class: 'muted', style: 'margin-top:12px;font-size:13px' }, 'Browsers connect directly to each other (peer to peer). Nothing is stored on a server. Keep this tab open while you work together.'),
      el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn primary', onclick: () => finish(true) }, 'Done')));
  });
}

// ---------------------------------------------------------------- runner
class Runner {
  constructor() {
    this.seq = 0;
    this.pending = new Map();
    this.spawn();
  }

  spawn() {
    this.worker = new Worker(new URL('./runner-worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => {
      const p = this.pending.get(e.data.reqId);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(e.data.reqId);
      p.resolve(e.data);
    };
    this.worker.onerror = (e) => {
      console.error('worker error', e);
      for (const p of this.pending.values()) { clearTimeout(p.timer); p.resolve({ type: 'crash', message: e.message }); }
      this.pending.clear();
    };
  }

  request(msg, timeout) {
    const reqId = ++this.seq;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        this.worker.terminate();
        this.spawn();
        resolve({ type: 'timeout' });
      }, timeout);
      this.pending.set(reqId, { resolve, timer });
      this.worker.postMessage({ ...msg, reqId });
    });
  }

  run(files, lessonId) { return this.request({ type: 'run', files, lessonId }, RUN_TIMEOUT_MS); }
  speak(id) { return this.request({ type: 'speak', id }, 3000); }
}

const runner = new Runner();

// ---------------------------------------------------------------- world + editor
const world = new World($('world'), {
  onEntityClick: (hit) => showInspector(hit),
  onPointer: (p) => { if (session && session.shared) session.awareness.setLocalStateField('pointer', p); },
  onTime: (t) => revealConsole(t)
});
const editor = new CodeEditor($('editor'), { onRun: () => run() });

// ---------------------------------------------------------------- lesson panel
function renderDots() {
  const nav = $('lessonDots');
  nav.innerHTML = '';
  let unit = null;
  LESSONS.forEach((l, i) => {
    const cls = ['dot'];
    if (progress.done[l.id]) cls.push('done');
    if (lesson && l.id === lesson.id) cls.push('current');
    if (l.free) cls.push('free');
    if (unit !== null && l.unit !== unit) cls.push('unit-start');
    unit = l.unit;
    const label = l.free ? '★' : String(i + 1);
    nav.append(el('button', {
      type: 'button',
      class: cls.join(' '),
      title: `${l.free ? '' : 'Lesson ' + (i + 1) + ': '}${l.title}${progress.done[l.id] ? ' (done)' : ''}`,
      'aria-label': `${l.free ? '' : 'Lesson ' + (i + 1) + ': '}${l.title}${progress.done[l.id] ? ', done' : ''}${lesson && l.id === lesson.id ? ', current' : ''}`,
      'aria-current': lesson && l.id === lesson.id ? 'step' : null,
      onclick: () => openLesson(l.id)
    }, label));
  });
}

function stepStates() {
  const live = lastChecks[lesson.id];
  if (live) return live;
  const saved = progress.steps[lesson.id] || [];
  return lesson.steps.map((_, i) => ({ done: !!saved[i] }));
}

function renderLesson() {
  const idx = LESSONS.indexOf(lesson);
  $('lessonBadge').textContent = lesson.free ? 'Free play' : `Lesson ${idx + 1} · ${lesson.unit}`;
  $('lessonTitle').textContent = lesson.title;
  $('lessonIntro').innerHTML = lesson.intro;
  const concepts = $('lessonConcepts');
  concepts.innerHTML = '';
  for (const c of lesson.concepts) concepts.append(el('div', { class: 'concept' }, el('code', {}, c.code), el('span', {}, c.text)));
  $('stepsTitle').hidden = !lesson.steps.length;
  $('hintBtn').hidden = !lesson.hints.length;
  $('solutionBtn').hidden = !lesson.solution;
  $('prevBtn').disabled = idx <= 0;
  $('nextBtn').disabled = idx >= LESSONS.length - 1;
  renderSteps();
  renderHints();
}

function renderSteps() {
  const ol = $('lessonSteps');
  ol.innerHTML = '';
  const states = stepStates();
  const firstOpen = states.findIndex((s) => !s.done);
  lesson.steps.forEach((s, i) => {
    const st = states[i] || {};
    const li = el('li', { class: 'step' + (st.done ? ' done' : '') + (i === firstOpen ? ' current' : '') });
    const num = el('span', { class: 'step-num', 'aria-hidden': 'true' });
    if (st.done) num.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>';
    else num.textContent = String(i + 1);
    const text = el('span', { class: 'step-text', html: s.text });
    if (st.note) text.append(el('span', { class: 'step-note' }, st.note));
    li.append(num, text, el('span', { class: 'sr-only', style: 'position:absolute;left:-9999px' }, st.done ? ' (done)' : ''));
    ol.append(li);
  });
  const old = $('lessonCard').querySelector('.complete-banner');
  if (old) old.remove();
  if (lesson.steps.length && states.length === lesson.steps.length && states.every((s) => s.done)) {
    const idx = LESSONS.indexOf(lesson);
    const next = LESSONS[idx + 1];
    const banner = el('div', { class: 'complete-banner' },
      el('strong', {}, 'Lesson complete!'),
      next ? el('button', { type: 'button', class: 'btn primary', onclick: () => openLesson(next.id) }, `Next: ${next.title}`) : el('span', {}, 'You finished the course!'));
    $('lessonSteps').after(banner);
  }
}

function renderHints() {
  const box = $('hints');
  box.innerHTML = '';
  const n = progress.hints[lesson.id] || 0;
  lesson.hints.slice(0, n).forEach((h, i) => box.append(el('div', { class: 'hint', html: `<b>Hint ${i + 1}.</b> ${h}` })));
  const btn = $('hintBtn');
  btn.disabled = n >= lesson.hints.length;
  btn.textContent = n === 0 ? 'Give me a hint' : n >= lesson.hints.length ? 'No more hints' : 'Another hint';
}

// ---------------------------------------------------------------- tabs + editor binding
function renderTabs() {
  const tabs = $('tabs');
  tabs.innerHTML = '';
  if (!session || !lesson) return;
  const names = session.fileNames(lesson.id);
  const viewers = {};
  for (const p of session.peers()) {
    if (p.self || !p.file) continue;
    const [lid, f] = p.file.split('/');
    if (lid !== lesson.id) continue;
    (viewers[f] = viewers[f] || []).push(p.user);
  }
  for (const name of names) {
    const hasErr = (diagnostics[name] || []).some((d) => d.severity !== 'warning');
    const tab = el('button', {
      type: 'button',
      role: 'tab',
      class: 'tab' + (name === activeFile ? ' active' : '') + (hasErr ? ' error' : ''),
      'aria-selected': String(name === activeFile),
      onclick: () => switchFile(name)
    }, name);
    if (viewers[name]) {
      tab.append(el('span', { class: 'peer-dots', 'aria-label': viewers[name].map((u) => u.name).join(', ') + ' here' },
        viewers[name].map((u) => el('span', { class: 'peer-dot', style: `background:${u.color}`, title: u.name }))));
    }
    if (name !== 'Main.java') {
      const close = el('span', { class: 'close', role: 'button', tabindex: '0', 'aria-label': 'Delete ' + name, title: 'Delete ' + name, html: '&times;' });
      const del = async (e) => {
        e.stopPropagation();
        const ok = await confirmDialog(`Delete ${name}?`, `The file and its code will be removed${session.shared ? ' for everyone in the room' : ''}.`, 'Delete');
        if (ok) {
          session.deleteFile(lesson.id, name);
          if (activeFile === name) activeFile = 'Main.java';
          bindEditor();
        }
      };
      close.addEventListener('click', del);
      close.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') del(e); });
      tab.append(close);
    }
    tabs.append(tab);
  }
}

function switchFile(name) {
  activeFile = name;
  bindEditor();
}

function bindEditor() {
  const overlay = $('editorOverlay');
  if (!session.ready) {
    editor.destroy();
    renderTabs();
    return;
  }
  overlay.hidden = true;
  const files = session.ensureLesson(lesson);
  if (!files.has(activeFile)) activeFile = sortFiles([...files.keys()])[0];
  editor.bind(files.get(activeFile), session.awareness);
  editor.showDiagnostics(diagnostics[activeFile] || []);
  session.awareness.setLocalStateField('file', lesson.id + '/' + activeFile);
  renderTabs();
}

function showWaiting() {
  const overlay = $('editorOverlay');
  overlay.hidden = false;
  overlay.innerHTML = '';
  overlay.append(el('div', { class: 'spinner', role: 'img', 'aria-label': 'Connecting' }), el('h3', {}, 'Joining the room…'),
    el('p', {}, 'Looking for the person who shared this link.'));
  clearTimeout(waitTimer);
  waitTimer = setTimeout(() => {
    if (session.ready) return;
    overlay.innerHTML = '';
    overlay.append(el('h3', {}, 'Nobody has answered yet'),
      el('p', {}, 'The person who sent the link needs to have the page open. You can keep waiting, or start the lesson yourself and they will join you.'),
      el('div', { class: 'row', style: 'display:flex;gap:8px;flex-wrap:wrap;justify-content:center' },
        el('button', { type: 'button', class: 'btn', onclick: () => showWaiting() }, 'Keep waiting'),
        el('button', { type: 'button', class: 'btn primary', onclick: () => { session.ready = true; onReady(); } }, 'Start on my own')));
  }, 9000);
}

// ---------------------------------------------------------------- lessons
function openLesson(id, { fromRemote = false } = {}) {
  const next = lessonById(id) || LESSONS[0];
  const changed = !lesson || next.id !== lesson.id;
  lesson = next;
  progress.current = lesson.id;
  saveProgress();
  if (session.shared && !fromRemote && session.meta.get('lesson') !== lesson.id) session.meta.set('lesson', lesson.id);
  if (changed) {
    activeFile = 'Main.java';
    diagnostics = {};
    world.setTimeline(buildTimeline([]));
    $('worldChip').textContent = 'Empty island';
    hideInspector();
    $('outputBody').innerHTML = '';
    $('outputBody').append(el('p', { class: 'muted', html: 'Write some code and press <b>Run it!</b> (or Ctrl+Enter).' }));
    $('runMeta').textContent = '';
    $('lessonCard').querySelector('.lesson-scroll').scrollTop = 0;
  }
  session.awareness.setLocalStateField('lesson', lesson.id);
  renderDots();
  renderLesson();
  bindEditor();
}

// ---------------------------------------------------------------- running
async function run({ remote = false, by = null } = {}) {
  if (!session || !session.ready || running) return;
  session.ensureLesson(lesson);
  const files = session.snapshot(lesson.id);
  running = true;
  const btn = $('runBtn');
  btn.classList.add('running');
  btn.querySelector('span').textContent = 'Running…';
  if (session.shared && !remote) session.provider.broadcastRun({ lesson: lesson.id, by: user.name || 'Someone' });
  if (remote) toast(`${by || 'Someone'} ran the code`);
  const lessonAtStart = lesson.id;
  const res = await runner.run(files, lesson.id);
  running = false;
  btn.classList.remove('running');
  btn.querySelector('span').textContent = 'Run it!';
  if (lesson.id !== lessonAtStart) return;
  showResult(res);
}

const EXPLAIN = {
  NullPointerException: 'Something was <b>null</b> (it had no object in it) when the code tried to use it. Check that every object was created with <code>new</code> before you use it.',
  ArrayIndexOutOfBoundsException: 'The code asked for an array position that doesn’t exist. Positions go from <code>0</code> to <code>length - 1</code>.',
  StringIndexOutOfBoundsException: 'The code asked for a character position outside the String. Positions go from <code>0</code> to <code>length() - 1</code>.',
  IndexOutOfBoundsException: 'The list has no item at that position. Positions go from <code>0</code> to <code>size() - 1</code>.',
  ArithmeticException: 'A whole number (int) was divided by zero, which has no answer.',
  ClassCastException: 'An object was cast to a class it isn’t. Check with <code>instanceof</code> before casting.',
  NumberFormatException: 'That text isn’t a number, so it can’t be turned into one.',
  StackOverflowError: 'Methods kept calling each other (or themselves) without ever stopping.',
  ConcurrentModificationException: 'A list was changed while a for-each loop was going through it.',
  NegativeArraySizeException: 'An array can’t have a negative size.',
  IllegalArgumentException: 'A method was given a value it doesn’t accept.',
  IllegalStateException: 'Something was used at the wrong moment.',
  IllegalFormatConversionException: 'A printf/format placeholder doesn’t match its value. Use <code>%d</code> for int, <code>%f</code> for double, <code>%s</code> for anything.'
};

function whereButton(file, line, col) {
  return el('button', { type: 'button', class: 'where', onclick: () => jumpTo(file, line, col) }, `${file} line ${line}`);
}

function jumpTo(file, line, col = 1) {
  if (file && file !== activeFile && session.files(lesson.id)?.has(file)) {
    activeFile = file;
    bindEditor();
  }
  requestAnimationFrame(() => editor.goto(line, col));
}

function showResult(res) {
  const body = $('outputBody');
  body.innerHTML = '';
  consoleLines = [];
  diagnostics = {};
  if (res.type === 'timeout') {
    body.append(el('div', { class: 'msg error' }, el('strong', {}, 'Your program took too long and was stopped.'),
      el('span', {}, 'It ran for more than 12 seconds. Is there a loop that never ends, like a while loop whose condition never becomes false?')));
    $('runMeta').textContent = '';
    editor.showDiagnostics([]);
    renderTabs();
    return;
  }
  if (res.type === 'crash') {
    body.append(el('div', { class: 'msg error' }, el('strong', {}, 'The sandbox crashed.'), el('span', {}, 'This is a bug in Java Island, not in your code. Try running again.')));
    console.error(res.message);
    return;
  }
  for (const w of res.warnings || []) {
    (diagnostics[w.file] = diagnostics[w.file] || []).push({ ...w, severity: 'warning' });
  }
  if (!res.compiled) {
    const n = res.errors.length;
    $('runMeta').textContent = `${n} problem${n === 1 ? '' : 's'} to fix`;
    body.append(el('div', { class: 'msg info' }, el('strong', {}, n === 1 ? 'Java found a problem before it could run your code.' : `Java found ${n} problems before it could run your code.`),
      el('span', {}, 'Fix the first one, then run again. Later problems are often caused by the first.')));
    for (const e of res.errors.slice(0, 8)) {
      (diagnostics[e.file] = diagnostics[e.file] || []).push(e);
      body.append(el('div', { class: 'msg error' },
        e.file ? whereButton(e.file, e.line, e.col) : null,
        el('strong', { html: richText(e.message) }),
        e.hint ? el('span', { class: 'hint-line', html: richText(e.hint) }) : null));
    }
    if (res.errors.length && res.errors[0].file && res.errors[0].file !== activeFile) {
      const f = res.errors[0];
      jumpTo(f.file, f.line, f.col);
    }
    editor.showDiagnostics(diagnostics[activeFile] || []);
    renderTabs();
    return;
  }
  editor.showDiagnostics(diagnostics[activeFile] || []);
  renderTabs();
  for (const w of res.warnings || []) {
    body.append(el('div', { class: 'msg warn' }, w.file ? whereButton(w.file, w.line, w.col) : null, el('span', { html: richText(w.message) })));
  }
  const tl = buildTimeline(res.events);
  world.setTimeline(tl);
  hideInspector();
  const nObj = tl.entities.length;
  const parts = [];
  if (nObj) parts.push(`${nObj} object${nObj === 1 ? '' : 's'}`);
  if (tl.blocks.length) parts.push(`${tl.blocks.length} block${tl.blocks.length === 1 ? '' : 's'}`);
  if (tl.trees.length) parts.push(`${tl.trees.length} tree${tl.trees.length === 1 ? '' : 's'}`);
  $('worldChip').textContent = parts.length ? parts.join(' · ') : 'Empty island';
  $('runMeta').textContent = `ran in ${Math.max(1, Math.round(res.ms))} ms${tl.duration ? ` · ${tl.duration.toFixed(1)} s of animation` : ''}`;

  const con = el('div', { class: 'console', role: 'log', 'aria-label': 'Program output' });
  for (const line of res.output) {
    const span = el('div', { class: line.kind === 'err' ? 'line-err' : line.kind === 'warn' ? 'line-warn' : '' }, line.text === '' ? ' ' : line.text);
    span.dataset.t = line.t;
    consoleLines.push(span);
    con.append(span);
  }
  if (res.output.length) body.append(con);
  else if (!res.exception && !res.error) body.append(el('p', { class: 'muted' }, nObj || tl.blocks.length || tl.says.length || tl.sky.length ? 'Nothing was printed. Look at the world!' : 'The program ran, but it didn’t print anything or change the world.'));

  if (res.exception) {
    const ex = res.exception;
    const explain = ex.userDefined ? `Your own exception <code>${escapeHtml(ex.simpleName)}</code> was thrown and nothing caught it.` : EXPLAIN[ex.simpleName] || 'Something went wrong while the program was running.';
    const trace = el('div', { class: 'trace' }, ex.trace.slice(0, 6).map((t) => el('button', { type: 'button', onclick: () => jumpTo(t.file, t.line) }, `at ${t.cls}.${t.method}(${t.file}:${t.line})`)));
    body.append(el('div', { class: 'msg error' },
      ex.trace[0] ? whereButton(ex.trace[0].file, ex.trace[0].line) : null,
      el('strong', {}, `${ex.simpleName}${ex.message != null ? ': ' + ex.message : ''}`),
      el('span', { class: 'hint-line', html: explain }), trace));
  }
  if (res.error) {
    body.append(el('div', { class: 'msg error' }, el('strong', {}, res.error.message)));
  }
  revealConsole(tl.duration ? 0 : Infinity);

  if (res.checks) {
    const was = !!progress.done[lesson.id];
    lastChecks[lesson.id] = res.checks;
    const prev = progress.steps[lesson.id] || [];
    progress.steps[lesson.id] = res.checks.map((c, i) => c.done || !!prev[i]);
    lastChecks[lesson.id] = res.checks.map((c, i) => ({ ...c, done: c.done || !!prev[i] }));
    const allDone = progress.steps[lesson.id].every(Boolean);
    if (allDone && !was) {
      progress.done[lesson.id] = true;
      toast('Lesson complete! Great work.');
    }
    const newly = res.checks.filter((c, i) => c.done && !prev[i]).length;
    if (newly && !allDone) toast(newly === 1 ? 'Task done!' : `${newly} tasks done!`);
    saveProgress();
    renderSteps();
    renderDots();
  }
}

function revealConsole(t) {
  for (const s of consoleLines) s.classList.toggle('line-pending', Number(s.dataset.t) > t);
}

// ---------------------------------------------------------------- inspector
function hideInspector() { $('inspector').hidden = true; }

async function showInspector(hit) {
  const box = $('inspector');
  if (!hit) { hideInspector(); return; }
  const chain = hit.entity.chain.filter((c) => c !== 'Object');
  const name = hit.props.name;
  box.innerHTML = '';
  box.append(el('div', { class: 'inspector-head' },
    el('span', { class: 'inspector-title', html: `${name ? escapeHtml(name) + ' : ' : ''}<b>${escapeHtml(hit.entity.cls)}</b>` }),
    el('button', { type: 'button', class: 'round-btn', style: 'width:32px;height:32px', 'aria-label': 'Close', onclick: hideInspector, html: '&times;' })));
  box.append(el('div', { class: 'chain', 'aria-label': 'Class chain' },
    [...chain].reverse().flatMap((c, i, arr) => [el('span', { class: 'c' + (i === arr.length - 1 ? ' me' : '') }, c), i < arr.length - 1 ? el('span', { 'aria-hidden': 'true' }, '›') : null])));
  if (hit.fields.length) {
    const table = el('table', { class: 'fields' });
    for (const f of hit.fields) {
      table.append(el('tr', {}, el('td', { class: 'n' }, f.name), el('td', { class: 'v' }, f.value), el('td', { class: 'o' }, f.owner === hit.entity.cls ? '' : 'from ' + f.owner)));
    }
    box.append(table);
  } else {
    box.append(el('p', { class: 'muted', style: 'margin:4px 0;font-size:13px' }, 'This object has no fields yet.'));
  }
  const said = el('div', { class: 'said' }, '…');
  box.append(said);
  box.hidden = false;
  const r = await runner.speak(hit.id);
  if (r.type !== 'spoke') { said.remove(); return; }
  if (!r.hasSpeak) {
    said.innerHTML = 'Give this class a <code>String speak()</code> method and it will answer when you click it.';
  } else if (r.exception) {
    said.textContent = `speak() threw ${r.exception.simpleName}${r.exception.message ? ': ' + r.exception.message : ''}`;
  } else {
    said.innerHTML = `<code>speak()</code> returned ${r.text === null ? 'null' : '"' + escapeHtml(r.text) + '"'}`;
    if (r.text) world.say(hit.id, r.text);
  }
}

// ---------------------------------------------------------------- collaboration UI
function renderCollab() {
  const box = $('collab');
  box.innerHTML = '';
  if (!session.shared) {
    box.append(el('button', { type: 'button', class: 'btn', onclick: startRoom, title: 'Work on the same code together, live' },
      el('span', { html: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M17 8v6M14 11h6"/></svg>' }),
      'Invite someone'));
    return;
  }
  const peers = session.peers();
  const others = peers.filter((p) => !p.self).length;
  const pill = el('div', { class: 'pill' },
    el('span', { class: 'live-dot' + (others ? '' : ' waiting'), 'aria-hidden': 'true' }),
    el('span', {}, others ? `Live · ${others + 1} here` : 'Waiting for others'),
    el('div', { class: 'avatars' }, peers.slice(0, 6).map((p) => el('span', { class: 'avatar', style: `background:${p.user.color}`, title: p.user.name + (p.self ? ' (you)' : '') }, initials(p.user.name)))));
  box.append(pill,
    el('button', { type: 'button', class: 'btn small', onclick: () => inviteDialog() }, 'Invite'),
    el('button', { type: 'button', class: 'btn small ghost', onclick: leaveRoom }, 'Leave'));
}

async function startRoom() {
  if (!(await ensureName('Your name and color show next to your cursor so the other person can tell who is typing.'))) return;
  const id = newRoomId();
  sessionStorage.setItem('javaIsland.host.' + id, '1');
  location.hash = 'room=' + id;
  // hashchange starts the session; then show the link
  setTimeout(() => inviteDialog(), 50);
}

async function leaveRoom() {
  const ok = await confirmDialog('Leave the room?', 'You’ll go back to your own code. The room’s code is kept in this browser in case you rejoin with the same link.', 'Leave');
  if (ok) location.hash = '';
}

function roomFromHash() {
  const m = /room=([a-z0-9]{6,32})/i.exec(location.hash);
  return m ? m[1].toLowerCase() : null;
}

function onReady() {
  $('editorOverlay').hidden = true;
  const shared = session.meta.get('lesson');
  if (shared && shared !== lesson.id) openLesson(shared, { fromRemote: true });
  else {
    if (session.isHost || !shared) session.meta.set('lesson', lesson.id);
    bindEditor();
  }
}

function onPresence() {
  renderCollab();
  renderTabs();
  if (!session) return;
  world.setPeers(session.peers().filter((p) => !p.self && p.lesson === lesson.id).map((p) => ({ id: p.id, name: p.user.name, color: p.user.color, pointer: p.pointer || null })));
}

async function startSession(roomId) {
  for (const u of unsubscribers) u();
  unsubscribers = [];
  if (session) session.destroy();
  session = null;
  if (roomId && !user.name) {
    const ok = await ensureName('You’re joining a shared room. Your name and color show next to your cursor.');
    if (!ok) { location.hash = ''; return; }
  }
  const isHost = !!roomId && sessionStorage.getItem('javaIsland.host.' + roomId) === '1';
  session = new Session({
    roomId,
    isHost,
    user: user.name ? user : { ...user, name: 'Me' },
    handlers: {
      onReady: () => onReady(),
      onPeers: () => onPresence(),
      onRemoteRun: (payload) => { if (payload && payload.lesson === lesson.id) run({ remote: true, by: payload.by }); },
      onError: (d) => console.warn('room error', d)
    }
  });
  const onAw = () => onPresence();
  session.awareness.on('change', onAw);
  unsubscribers.push(() => session && session.awareness.off('change', onAw));
  const onLessons = (events) => {
    for (const ev of events) {
      if (ev.target === session.lessons && ev.changes.keys.has(lesson.id)) { bindEditor(); return; }
      if (ev.target === session.files(lesson.id) && ev.changes.keys.size) { bindEditor(); return; }
    }
  };
  session.lessons.observeDeep(onLessons);
  const onMeta = (ev) => {
    if (!ev.changes.keys.has('lesson')) return;
    const id = session.meta.get('lesson');
    if (id && id !== lesson.id && session.ready) {
      const l = lessonById(id);
      openLesson(id, { fromRemote: true });
      if (l) toast(`Switched to “${l.title}”`);
    }
  };
  session.meta.observe(onMeta);

  lesson = null;
  const startId = (roomId && session.meta.get('lesson')) || progress.current || LESSONS[0].id;
  openLesson(startId, { fromRemote: true });
  if (roomId && session.ready && !session.meta.get('lesson')) session.meta.set('lesson', lesson.id);
  if (!session.ready) showWaiting();
  renderCollab();
}

// ---------------------------------------------------------------- wiring
$('runBtn').addEventListener('click', () => run());
$('replayBtn').addEventListener('click', () => world.replay());
$('cameraBtn').addEventListener('click', () => world.resetCamera());
$('prevBtn').addEventListener('click', () => { const i = LESSONS.indexOf(lesson); if (i > 0) openLesson(LESSONS[i - 1].id); });
$('nextBtn').addEventListener('click', () => { const i = LESSONS.indexOf(lesson); if (i < LESSONS.length - 1) openLesson(LESSONS[i + 1].id); });
$('hintBtn').addEventListener('click', () => {
  progress.hints[lesson.id] = Math.min(lesson.hints.length, (progress.hints[lesson.id] || 0) + 1);
  saveProgress();
  renderHints();
});
$('solutionBtn').addEventListener('click', async () => {
  const seen = progress.hints[lesson.id] || 0;
  const text = seen < lesson.hints.length
    ? 'Try the hints first. Working it out yourself is how it sticks! Still want to see a working solution? It will <b>replace</b> the code in this lesson' + (session.shared ? ' for everyone in the room.' : '.')
    : 'This will <b>replace</b> the code in this lesson with a working solution' + (session.shared ? ' for everyone in the room.' : '.');
  if (await confirmDialog('Show the solution?', text, 'Show solution')) {
    session.replaceFiles(lesson.id, lesson.solution);
    activeFile = 'Main.java';
    bindEditor();
  }
});
$('resetBtn').addEventListener('click', async () => {
  if (await confirmDialog('Start this lesson over?', 'Your code for this lesson goes back to the starting code' + (session.shared ? ' for everyone in the room.' : '.'), 'Start over')) {
    session.replaceFiles(lesson.id, lesson.starter);
    activeFile = 'Main.java';
    bindEditor();
  }
});
$('newFileBtn').addEventListener('click', async () => {
  if (!session.ready) return;
  const result = await openDialog((finish) => {
    const input = el('input', { type: 'text', id: 'classInput', placeholder: 'Zombie', autocomplete: 'off', spellcheck: 'false' });
    const err = el('div', { class: 'error-text' });
    let kind = 'class';
    const kinds = ['class', 'abstract class', 'interface'].map((k) => {
      const b = el('button', { type: 'button', class: 'btn small' + (k === kind ? ' blue' : ''), onclick: () => { kind = k; kinds.forEach((x) => x.classList.toggle('blue', x === b)); } }, k);
      return b;
    });
    const submit = () => {
      const name = input.value.trim().replace(/\.java$/, '');
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) { err.textContent = 'Use letters and numbers only, starting with a letter. No spaces.'; return; }
      if (session.files(lesson.id).has(name + '.java')) { err.textContent = `${name}.java already exists.`; return; }
      finish({ name: name[0].toUpperCase() + name.slice(1), kind });
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    return el('div', {},
      el('h2', {}, 'New class'),
      el('p', {}, 'Each class usually gets its own file, named after the class.'),
      el('label', { for: 'classInput' }, 'Class name'),
      input,
      el('div', { class: 'colors' }, kinds),
      err,
      el('div', { class: 'row' },
        el('button', { type: 'button', class: 'btn ghost', onclick: () => finish(null) }, 'Cancel'),
        el('button', { type: 'button', class: 'btn primary', onclick: submit }, 'Create')));
  });
  if (!result) return;
  const body = result.kind === 'interface' ? `public interface ${result.name} {\n\n}\n` : `public ${result.kind} ${result.name} {\n\n}\n`;
  session.addFile(lesson.id, result.name + '.java', body);
  activeFile = result.name + '.java';
  bindEditor();
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !e.defaultPrevented) {
    e.preventDefault();
    run();
  }
});
window.addEventListener('hashchange', () => {
  const id = roomFromHash();
  if ((session && session.roomId) !== id) startSession(id);
});

startSession(roomFromHash());
