// The exam page: start screen, one hour of questions, then marks and a full review.
import { EditorView, basicSetup, EditorState, keymap, indentWithTab, indentUnit, java, syntaxHighlighting } from '../../vendor/editor.js';
import { theme, highlight } from '../editor.js';
import { store } from '../session.js';
import { QUESTIONS, SECTIONS, EXAM_MINUTES, PASS_PERCENT, TOTAL_POINTS } from './questions.js';
import { gradeObjective } from './grade.js';

const $ = (id) => document.getElementById(id);
const KEY = 'javaIsland.exam.v1';
const RUN_TIMEOUT_MS = 8000;
const GRADE_TIMEOUT_MS = 8000;

const LESSON_FOR_TOPIC = {
  Variables: 'variables', Types: 'math', Strings: 'strings', Conditions: 'conditions', Loops: 'loops',
  'Loops and Strings': 'loops', Methods: 'methods', Arrays: 'arrays', Classes: 'classes',
  Constructors: 'constructors', Encapsulation: 'encapsulation', Static: 'static', Inheritance: 'inheritance',
  Polymorphism: 'polymorphism', 'Abstract classes': 'abstract', Composition: 'weapons'
};

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

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// option text: `backticks` become code
const richText = (s) => escapeHtml(s).replace(/`([^`]+)`/g, '<code>$1</code>');

const KEYWORDS = new Set('abstract boolean break byte case catch char class continue default do double else extends final finally float for if implements import int interface long new null package private protected public return short static super switch this throw throws true false try void while'.split(' '));

// a small Java highlighter for read-only code
function hl(code) {
  const re = /(\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"?)|('(?:[^'\\\n]|\\.)*'?)|(@\w+)|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_]\w*\b)/g;
  let out = '';
  let last = 0;
  for (let m; (m = re.exec(code));) {
    out += escapeHtml(code.slice(last, m.index));
    last = re.lastIndex;
    const t = escapeHtml(m[0]);
    if (m[1]) out += `<span class="tk-com">${t}</span>`;
    else if (m[2] || m[3]) out += `<span class="tk-str">${t}</span>`;
    else if (m[4]) out += `<span class="tk-ann">${t}</span>`;
    else if (m[5]) out += `<span class="tk-num">${t}</span>`;
    else if (KEYWORDS.has(m[0])) out += `<span class="tk-kw">${t}</span>`;
    else if (/^[A-Z]/.test(m[0])) out += `<span class="tk-type">${t}</span>`;
    else out += t;
  }
  return out + escapeHtml(code.slice(last));
}

const codeBlock = (code, cls = '') => el('pre', { class: 'code-block ' + cls, html: hl(code) });

function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function fmtDuration(ms) {
  const m = Math.round(ms / 60000);
  return m < 1 ? 'under a minute' : m === 1 ? '1 minute' : `${m} minutes`;
}

let toastTimer = null;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

function confirmDialog(title, body, yes, no = 'Cancel') {
  const d = $('dialog');
  return new Promise((resolve) => {
    d.replaceChildren(el('div', {},
      el('h2', {}, title),
      el('p', { html: body }),
      el('div', { class: 'row' },
        el('button', { type: 'button', class: 'btn ghost', onclick: () => { d.close(); resolve(false); } }, no),
        el('button', { type: 'button', class: 'btn primary', onclick: () => { d.close(); resolve(true); } }, yes))));
    d.onclose = () => resolve(false);
    d.showModal();
  });
}

// ---------------------------------------------------------------- storage
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && typeof s === 'object') return { attempt: s.attempt || null, last: s.last || null, history: s.history || [] };
  } catch (e) { /* fall through */ }
  return { attempt: null, last: null, history: [] };
}

let state = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage full or blocked */ }
}

// another tab with the exam open keeps the same attempt
window.addEventListener('storage', (e) => {
  if (e.key !== KEY) return;
  const had = state.attempt && state.attempt.id;
  state = load();
  if (screen === 'exam' && (!state.attempt || state.attempt.id !== had)) route();
});

// ---------------------------------------------------------------- worker
class Marker {
  constructor() {
    this.seq = 0;
    this.pending = new Map();
    this.spawn();
  }

  spawn() {
    this.worker = new Worker(new URL('./exam-worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => {
      const p = this.pending.get(e.data.reqId);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(e.data.reqId);
      p.resolve(e.data);
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

  run(code) { return this.request({ type: 'run', code }, RUN_TIMEOUT_MS); }
  grade(id, code) { return this.request({ type: 'grade', id, code }, GRADE_TIMEOUT_MS); }
}

const marker = new Marker();

// ---------------------------------------------------------------- answers
const isCode = (q) => q.section === 'fix' || q.section === 'write';
const original = (q) => (q.section === 'fix' ? q.broken : q.starter);

function isAnswered(q, a) {
  if (a === undefined || a === null) return false;
  if (q.section === 'fill') return Array.isArray(a) && a.some((v) => v && v.trim());
  if (isCode(q)) return a.trim() !== original(q).trim();
  return true;
}

function shuffled(n) {
  const order = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function newAttempt() {
  const now = Date.now();
  const perm = {};
  for (const q of QUESTIONS) if (q.section === 'mcq') perm[q.id] = shuffled(q.options.length);
  return { id: now.toString(36), startedAt: now, endsAt: now + EXAM_MINUTES * 60000, answers: {}, flags: {}, current: 0, perm };
}

// ---------------------------------------------------------------- screens
let screen = null;
let tick = null;
let editor = null;
let warned = {};

function setBar(...children) { $('examBar').replaceChildren(...children); }

function route() {
  clearInterval(tick);
  if (editor) { editor.destroy(); editor = null; }
  if (state.attempt && Date.now() >= state.attempt.endsAt) { submit(true); return; }
  if (state.attempt) renderExam();
  else renderIntro();
}

function renderIntro() {
  screen = 'intro';
  setBar();
  document.title = 'Final exam · Java Island';
  const sections = SECTIONS.map((s) => {
    const qs = QUESTIONS.filter((q) => q.section === s.id);
    const pts = qs.reduce((n, q) => n + q.points, 0);
    return el('li', { class: 'intro-section' },
      el('span', { class: 'sec-mark sec-' + s.id }, s.short),
      el('div', {}, el('strong', {}, s.title), el('span', { class: 'muted' }, ` · ${qs.length} question${qs.length === 1 ? '' : 's'}`), el('p', {}, s.blurb)),
      el('span', { class: 'sec-pts' }, `${pts} pts`));
  });
  const last = state.last;
  const main = el('div', { class: 'intro' },
    el('section', { class: 'card intro-card' },
      el('span', { class: 'badge' }, 'Final exam'),
      el('h1', {}, 'How much Java do you know?'),
      el('p', { class: 'lead' }, `${QUESTIONS.length} questions, ${TOTAL_POINTS} points, ${EXAM_MINUTES} minutes. It covers everything from variables to abstract classes and composition. Interfaces and generics aren’t in it.`),
      el('ol', { class: 'intro-sections' }, sections),
      el('div', { class: 'rules' },
        el('h2', {}, 'Before you start'),
        el('ul', {},
          el('li', {}, `The clock starts when you press Start and keeps running even if you close the tab. At 0:00 the exam is handed in for you.`),
          el('li', {}, 'Your answers are saved in this browser as you go.'),
          el('li', {}, 'You can jump between questions and flag the ones you want to come back to.'),
          el('li', {}, 'No hints during the exam. You can run your code on the Write questions, but not on Find and fix.'),
          el('li', { html: `You pass with ${PASS_PERCENT}% or more. Afterwards you get every answer explained.` }))),
      el('div', { class: 'intro-actions' },
        el('button', { type: 'button', class: 'btn run', onclick: start }, 'Start the exam'),
        last ? el('button', { type: 'button', class: 'btn', onclick: () => renderResults() }, 'See my last result') : null,
        el('a', { class: 'btn link', href: './' }, 'Back to the lessons'))),
    state.history.length ? historyCard() : null);
  $('examMain').replaceChildren(main);
}

function historyCard() {
  return el('section', { class: 'card history-card' },
    el('h2', {}, 'Past attempts'),
    el('table', { class: 'history' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Date'), el('th', {}, 'Score'), el('th', {}, 'Time'), el('th', {}, ''))),
      el('tbody', {}, state.history.slice().reverse().map((h) => {
        const pct = Math.round((100 * h.score) / h.max);
        return el('tr', {},
          el('td', {}, new Date(h.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })),
          el('td', {}, el('strong', {}, `${h.score} / ${h.max}`), ` (${pct}%)`),
          el('td', {}, fmtDuration(h.ms)),
          el('td', {}, el('span', { class: 'chip ' + (pct >= PASS_PERCENT ? 'pass' : 'fail') }, pct >= PASS_PERCENT ? 'Passed' : 'Not yet')));
      }))));
}

function start() {
  state.attempt = newAttempt();
  warned = {};
  save();
  route();
}

// ---------------------------------------------------------------- the exam
function renderExam() {
  screen = 'exam';
  const a = state.attempt;
  const timer = el('div', { class: 'timer', role: 'timer', 'aria-label': 'Time left' },
    el('svg', { width: 18, height: 18, viewBox: '0 0 24 24', 'aria-hidden': 'true', html: '<circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M12 9v4l2.5 2M9 2h6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>' }),
    el('span', { id: 'timerText' }, fmtClock(a.endsAt - Date.now())));
  setBar(timer, el('button', { type: 'button', class: 'btn primary', onclick: () => askSubmit() }, 'Hand in'));
  const layout = el('div', { class: 'exam-layout' },
    el('aside', { class: 'card exam-nav', id: 'examNav', 'aria-label': 'Questions' }),
    el('section', { class: 'card exam-q', id: 'examQ', 'aria-live': 'polite' }));
  $('examMain').replaceChildren(layout);
  renderNav();
  renderQuestion();
  const update = () => {
    const left = a.endsAt - Date.now();
    const t = $('timerText');
    if (t) t.textContent = fmtClock(left);
    timer.classList.toggle('low', left < 5 * 60000);
    for (const m of [10, 5, 1]) {
      if (left < m * 60000 && left > (m - 1) * 60000 && !warned[m]) {
        warned[m] = true;
        toast(m === 1 ? 'One minute left!' : `${m} minutes left.`);
      }
    }
    if (left <= 0) submit(true);
  };
  update();
  tick = setInterval(update, 1000);
}

function renderNav() {
  const a = state.attempt;
  const nav = $('examNav');
  if (!nav) return;
  let n = 0;
  const answered = QUESTIONS.filter((q) => isAnswered(q, a.answers[q.id])).length;
  nav.replaceChildren(
    el('div', { class: 'nav-head' },
      el('strong', {}, `${answered} of ${QUESTIONS.length} answered`),
      el('div', { class: 'progress' }, el('span', { style: `width:${(100 * answered) / QUESTIONS.length}%` }))),
    ...SECTIONS.map((s) => el('div', { class: 'nav-section' },
      el('span', { class: 'nav-title' }, s.title),
      el('div', { class: 'nav-nums' }, QUESTIONS.map((q, i) => {
        if (q.section !== s.id) return null;
        n++;
        const cls = ['qnum'];
        if (isAnswered(q, a.answers[q.id])) cls.push('answered');
        if (i === a.current) cls.push('current');
        if (a.flags[q.id]) cls.push('flagged');
        return el('button', {
          type: 'button', class: cls.join(' '), 'aria-label': `Question ${i + 1}${a.flags[q.id] ? ', flagged' : ''}`,
          'aria-current': i === a.current ? 'true' : null,
          onclick: () => go(i)
        }, String(i + 1));
      })))),
    el('div', { class: 'nav-legend' },
      el('span', {}, el('i', { class: 'qnum answered mini' }), 'answered'),
      el('span', {}, el('i', { class: 'qnum flagged mini' }), 'flagged')));
}

function go(i) {
  const a = state.attempt;
  a.current = Math.max(0, Math.min(QUESTIONS.length - 1, i));
  save();
  renderNav();
  renderQuestion();
  const q = $('examQ');
  if (q) { q.scrollTop = 0; if (window.innerWidth < 900) q.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
}

function setAnswer(q, value, { rerender = false } = {}) {
  state.attempt.answers[q.id] = value;
  save();
  renderNav();
  if (rerender) renderQuestion();
}

function renderQuestion() {
  const a = state.attempt;
  const i = a.current;
  const q = QUESTIONS[i];
  const sec = SECTIONS.find((s) => s.id === q.section);
  if (editor) { editor.destroy(); editor = null; }
  const box = $('examQ');
  const flagged = !!a.flags[q.id];
  const flag = el('button', {
    type: 'button', class: 'btn small ' + (flagged ? 'flag-on' : 'ghost'), 'aria-pressed': String(flagged),
    onclick: () => { a.flags[q.id] = !a.flags[q.id]; save(); renderNav(); renderQuestion(); }
  }, el('svg', { width: 14, height: 14, viewBox: '0 0 24 24', 'aria-hidden': 'true', html: '<path d="M5 21V4M5 4h11l-2 4 2 4H5" fill="' + (flagged ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' }), flagged ? 'Flagged' : 'Flag');

  const body = el('div', { class: 'q-body' });
  const firstOfSection = QUESTIONS.findIndex((x) => x.section === q.section) === i;
  if (firstOfSection) body.append(el('div', { class: 'sec-intro sec-' + q.section }, el('strong', {}, sec.title), ' ', sec.blurb));
  if (q.section === 'fix') body.append(el('p', { class: 'q-prompt', html: `${q.prompt} It has <b>${q.mistakes === 1 ? 'one mistake' : q.mistakes + ' mistakes'}</b> that stop it from compiling. Fix ${q.mistakes === 1 ? 'it' : 'them'}.` }));
  else if (q.section === 'write') body.append(el('div', { class: 'q-prompt', html: q.prompt }));
  else body.append(el('p', { class: 'q-prompt', html: q.prompt }));

  if (q.section === 'mcq') renderMcq(q, body);
  else if (q.section === 'tf') renderTf(q, body);
  else if (q.section === 'fill') renderFill(q, body);
  else renderCode(q, body);

  const last = i === QUESTIONS.length - 1;
  box.replaceChildren(
    el('div', { class: 'q-head' },
      el('span', { class: 'q-num' }, `Question ${i + 1}`),
      el('span', { class: 'chip' }, q.topic),
      el('span', { class: 'muted q-pts' }, `${q.points} point${q.points === 1 ? '' : 's'}`),
      el('div', { class: 'spacer' }),
      flag),
    body,
    el('div', { class: 'q-foot' },
      el('button', { type: 'button', class: 'btn', disabled: i === 0, onclick: () => go(i - 1) }, '← Back'),
      el('div', { class: 'spacer' }),
      last
        ? el('button', { type: 'button', class: 'btn primary', onclick: () => askSubmit() }, 'Hand in')
        : el('button', { type: 'button', class: 'btn blue', onclick: () => go(i + 1) }, 'Next →')));
}

function renderMcq(q, body) {
  if (q.code) body.append(codeBlock(q.code));
  const a = state.attempt;
  const order = a.perm[q.id] || q.options.map((_, k) => k);
  const chosen = a.answers[q.id];
  body.append(el('div', { class: 'options', role: 'radiogroup', 'aria-label': 'Answers' }, order.map((k, pos) =>
    el('button', {
      type: 'button', role: 'radio', class: 'option' + (chosen === k ? ' chosen' : ''), 'aria-checked': String(chosen === k),
      onclick: () => setAnswer(q, k, { rerender: true })
    }, el('span', { class: 'opt-letter' }, 'ABCD'[pos]), el('span', { class: 'opt-text', html: richText(q.options[k]) })))));
}

function renderTf(q, body) {
  if (q.code) body.append(codeBlock(q.code));
  const chosen = state.attempt.answers[q.id];
  body.append(el('div', { class: 'tf', role: 'radiogroup', 'aria-label': 'True or false' }, [true, false].map((v) =>
    el('button', {
      type: 'button', role: 'radio', class: 'option tf-' + v + (chosen === v ? ' chosen' : ''), 'aria-checked': String(chosen === v),
      onclick: () => setAnswer(q, v, { rerender: true })
    }, v ? 'True' : 'False'))));
}

function renderFill(q, body) {
  const values = (state.attempt.answers[q.id] || []).slice();
  const pre = el('pre', { class: 'code-block fill' });
  const parts = q.template.split(/\[\[(\d+)\]\]/);
  const inputs = [];
  parts.forEach((p, k) => {
    if (k % 2 === 0) { pre.insertAdjacentHTML('beforeend', hl(p)); return; }
    const idx = Number(p);
    const base = Math.max(5, ...q.blanks[idx].answers.map((s) => s.length)) + 2;
    const input = el('input', {
      type: 'text', class: 'blank', value: values[idx] || '', 'aria-label': `Blank ${idx + 1}`,
      spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', style: `width:${base}ch`
    });
    const fit = () => { input.style.width = Math.max(base, input.value.length + 2) + 'ch'; };
    fit();
    input.addEventListener('input', () => {
      fit();
      values[idx] = input.value;
      setAnswer(q, values);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); const next = inputs[inputs.indexOf(input) + 1]; if (next) next.focus(); }
    });
    inputs.push(input);
    pre.append(input);
  });
  body.append(pre, el('p', { class: 'muted small' }, 'Type just the missing piece in each box. Spaces don’t matter.'));
}

function renderCode(q, body) {
  const a = state.attempt;
  const start = a.answers[q.id] ?? original(q);
  const wrap = el('div', { class: 'q-editor' });
  const out = el('div', { class: 'q-output', hidden: true });
  const runBtn = q.section === 'write' ? el('button', { type: 'button', class: 'btn run small-run', onclick: () => runIt() },
    el('svg', { width: 12, height: 12, viewBox: '0 0 24 24', 'aria-hidden': 'true', html: '<path d="M6 3l15 9-15 9z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' }), 'Run') : null;
  const reset = el('button', {
    type: 'button', class: 'btn small ghost', onclick: async () => {
      const ok = await confirmDialog(q.section === 'fix' ? 'Undo your changes?' : 'Start this question over?', 'Your code for this question goes back to how it started.', 'Start over');
      if (!ok) return;
      delete a.answers[q.id];
      save();
      renderNav();
      renderQuestion();
    }
  }, 'Start over');
  body.append(el('div', { class: 'editor-head' },
    el('span', { class: 'file-tab' }, 'Main.java'),
    el('div', { class: 'spacer' }),
    reset, runBtn), wrap, out);
  if (q.section === 'fix') body.append(el('p', { class: 'muted small' }, 'You won’t see compiler messages here. That’s the point: spot the mistakes yourself.'));
  else body.append(el('p', { class: 'muted small' }, 'Run shows what your main method prints. Your method is marked with hidden tests when you hand in.'));

  let saveTimer = null;
  const onChange = (code) => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => setAnswer(q, code), 250);
  };
  const runIt = async () => {
    if (!editor) return;
    const code = editor.state.doc.toString();
    setAnswer(q, code);
    runBtn.disabled = true;
    out.hidden = false;
    out.replaceChildren(el('p', { class: 'muted' }, 'Running…'));
    const r = await marker.run(code);
    runBtn.disabled = false;
    out.replaceChildren(...runOutput(r));
  };
  editor = new EditorView({
    parent: wrap,
    state: EditorState.create({
      doc: start,
      extensions: [
        keymap.of([
          { key: 'Mod-Enter', run: () => { if (runBtn) runIt(); return true; } },
          indentWithTab
        ]),
        basicSetup,
        java(),
        indentUnit.of('    '),
        EditorState.tabSize.of(4),
        theme,
        syntaxHighlighting(highlight),
        EditorView.updateListener.of((u) => { if (u.docChanged) onChange(u.state.doc.toString()); }),
        EditorView.contentAttributes.of({ 'aria-label': 'Java code for this question', spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' })
      ]
    })
  });
}

function runOutput(r) {
  if (r.type === 'timeout') return [el('div', { class: 'msg error' }, el('strong', {}, 'Your program took too long and was stopped.'), el('span', {}, 'Is there a loop that never ends?'))];
  if (r.type === 'crash') return [el('div', { class: 'msg error' }, el('strong', {}, 'Something went wrong running that. Try again.'))];
  if (!r.compiled) {
    return r.errors.map((e) => el('div', { class: 'msg error' },
      e.line ? el('span', { class: 'where' }, `line ${e.line}`) : null,
      el('strong', { html: richText(e.message) }),
      e.hint ? el('span', { class: 'hint-line', html: richText(e.hint) }) : null));
  }
  const nodes = [];
  if (r.output.length) {
    nodes.push(el('div', { class: 'console' }, r.output.map((l) => el('div', { class: l.kind === 'err' ? 'line-err' : l.kind === 'warn' ? 'line-warn' : '' }, l.text === '' ? ' ' : l.text))));
  } else if (!r.exception && !r.error) {
    nodes.push(el('p', { class: 'muted' }, 'It ran, but nothing was printed. Call your method from main and print the result to see it.'));
  }
  if (r.exception) nodes.push(el('div', { class: 'msg error' }, el('strong', {}, r.exception.split('\n')[0].replace('Exception in thread "main" ', ''))));
  if (r.error) nodes.push(el('div', { class: 'msg error' }, el('strong', {}, r.error)));
  return nodes;
}

// ---------------------------------------------------------------- handing in
async function askSubmit() {
  const a = state.attempt;
  if (editor) setAnswer(QUESTIONS[a.current], editor.state.doc.toString());
  const open = QUESTIONS.filter((q) => !isAnswered(q, a.answers[q.id])).length;
  const flags = QUESTIONS.filter((q) => a.flags[q.id]).length;
  const notes = [];
  if (open) notes.push(`<b>${open}</b> question${open === 1 ? ' is' : 's are'} still unanswered.`);
  if (flags) notes.push(`<b>${flags}</b> question${flags === 1 ? ' is' : 's are'} flagged.`);
  notes.push(`You have ${fmtClock(a.endsAt - Date.now())} left. Once you hand in, you can’t change your answers.`);
  const ok = await confirmDialog('Hand in your exam?', notes.join(' '), 'Hand in', 'Keep working');
  if (ok && state.attempt === a) submit(false);
}

let submitting = false;
async function submit(auto) {
  if (submitting || !state.attempt) return;
  submitting = true;
  clearInterval(tick);
  const a = state.attempt;
  if (editor) {
    a.answers[QUESTIONS[a.current].id] = editor.state.doc.toString();
    editor.destroy();
    editor = null;
  }
  save();
  setBar();
  const status = el('p', { class: 'muted' }, '');
  $('examMain').replaceChildren(el('section', { class: 'card marking' },
    el('div', { class: 'spinner', 'aria-hidden': 'true' }),
    el('h2', {}, auto ? 'Time’s up! Marking your exam…' : 'Marking your exam…'),
    status));

  const results = {};
  for (const q of QUESTIONS) {
    const ans = a.answers[q.id];
    if (!isCode(q)) { results[q.id] = gradeObjective(q, ans); continue; }
    if (!isAnswered(q, ans)) {
      results[q.id] = { score: 0, max: q.points, status: 'blank', note: q.section === 'fix' ? 'The program was left as it was.' : 'Nothing was written.' };
      continue;
    }
    status.textContent = `Running your code for question ${QUESTIONS.indexOf(q) + 1}…`;
    const r = await marker.grade(q.id, ans);
    if (r.type === 'timeout') results[q.id] = { score: 0, max: q.points, status: 'wrong', note: 'Your code ran for too long and was stopped. Is there a loop that never ends?' };
    else if (r.type === 'crash') results[q.id] = { score: 0, max: q.points, status: 'wrong', note: 'The marker crashed on this answer.' };
    else { const { reqId, ...rest } = r; results[q.id] = rest; }
  }
  const sections = {};
  for (const s of SECTIONS) sections[s.id] = { score: 0, max: 0 };
  let score = 0;
  for (const q of QUESTIONS) {
    sections[q.section].score += results[q.id].score;
    sections[q.section].max += q.points;
    score += results[q.id].score;
  }
  const finishedAt = Math.min(Date.now(), a.endsAt);
  state.last = { at: finishedAt, startedAt: a.startedAt, auto, score, max: TOTAL_POINTS, sections, results, answers: a.answers, perm: a.perm };
  state.history.push({ at: finishedAt, score, max: TOTAL_POINTS, ms: finishedAt - a.startedAt });
  state.history = state.history.slice(-20);
  state.attempt = null;
  save();
  submitting = false;
  renderResults();
}

// ---------------------------------------------------------------- results
const STATUS = {
  right: { icon: '✓', label: 'Right' },
  partial: { icon: '½', label: 'Part marks' },
  wrong: { icon: '✗', label: 'Wrong' },
  blank: { icon: '–', label: 'Not answered' }
};

function verdict(pct) {
  if (pct >= 90) return 'Outstanding. You really know your Java.';
  if (pct >= 75) return 'Great work. Just a few things to polish.';
  if (pct >= PASS_PERCENT) return 'You passed! Look over the questions you missed below.';
  if (pct >= 40) return 'Not quite yet. The review below shows what to practise.';
  return 'Keep going. Revisit the lessons below, then try again.';
}

function renderResults() {
  screen = 'results';
  setBar();
  const L = state.last;
  if (!L) { renderIntro(); return; }
  document.title = 'Exam results · Java Island';
  const pct = Math.round((100 * L.score) / L.max);
  const passed = pct >= PASS_PERCENT;

  // weakest topics, with the lesson to revisit
  const topics = {};
  for (const q of QUESTIONS) {
    const t = topics[q.topic] = topics[q.topic] || { score: 0, max: 0 };
    t.score += L.results[q.id].score;
    t.max += q.points;
  }
  const weak = Object.entries(topics).filter(([, t]) => t.score / t.max < 0.6).sort((x, y) => x[1].score / x[1].max - y[1].score / y[1].max);

  const hero = el('section', { class: 'card result-hero' },
    el('div', { class: 'score-ring ' + (passed ? 'pass' : 'fail'), style: `--p:${pct}` },
      el('div', {}, el('strong', {}, String(L.score)), el('span', {}, `/ ${L.max}`))),
    el('div', { class: 'result-text' },
      el('span', { class: 'chip ' + (passed ? 'pass' : 'fail') }, passed ? `Passed · ${pct}%` : `${pct}% · pass mark is ${PASS_PERCENT}%`),
      el('h1', {}, verdict(pct)),
      el('p', { class: 'muted' }, `Handed in ${new Date(L.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} after ${fmtDuration(L.at - L.startedAt)}${L.auto ? ', automatically when time ran out' : ''}.`),
      el('div', { class: 'intro-actions' },
        el('button', { type: 'button', class: 'btn run', onclick: async () => { if (await confirmDialog('Take the exam again?', `You get a fresh ${EXAM_MINUTES} minutes and empty answers. This result stays in your history.`, 'Start')) start(); } }, 'Take it again'),
        el('a', { class: 'btn', href: './' }, 'Back to the lessons'))));

  const bars = el('section', { class: 'card breakdown' },
    el('h2', {}, 'By section'),
    SECTIONS.map((s) => {
      const r = L.sections[s.id];
      return el('div', { class: 'bar-row' },
        el('span', { class: 'bar-label' }, s.title),
        el('div', { class: 'bar' }, el('span', { class: 'bar-fill sec-' + s.id, style: `width:${(100 * r.score) / r.max}%` })),
        el('span', { class: 'bar-num' }, `${r.score} / ${r.max}`));
    }),
    weak.length ? el('div', { class: 'weak' },
      el('h3', {}, 'Worth another look'),
      el('div', { class: 'weak-list' }, weak.map(([t, v]) => {
        const lesson = LESSON_FOR_TOPIC[t];
        return el('button', { type: 'button', class: 'btn small', onclick: () => openLesson(lesson) }, `${t} · ${v.score}/${v.max}`);
      }))) : null);

  const review = el('section', { class: 'card review' },
    el('div', { class: 'review-head' },
      el('h2', {}, 'Every question'),
      el('div', { class: 'spacer' }),
      el('button', { type: 'button', class: 'btn small ghost', onclick: () => review.querySelectorAll('details').forEach((d) => { d.open = true; }) }, 'Open all'),
      el('button', { type: 'button', class: 'btn small ghost', onclick: () => review.querySelectorAll('details').forEach((d) => { d.open = false; }) }, 'Close all')),
    SECTIONS.map((s) => el('div', { class: 'review-section' },
      el('h3', {}, s.title, el('span', { class: 'muted' }, ` · ${L.sections[s.id].score} / ${L.sections[s.id].max}`)),
      QUESTIONS.map((q, i) => (q.section === s.id ? reviewItem(q, i, L) : null)))));

  $('examMain').replaceChildren(el('div', { class: 'results' }, hero, bars, review, state.history.length > 1 ? historyCard() : null));
  window.scrollTo(0, 0);
}

function openLesson(id) {
  if (id) {
    const p = store.progress();
    p.current = id;
    store.saveProgress(p);
  }
  location.href = './';
}

function reviewItem(q, i, L) {
  const r = L.results[q.id];
  const ans = L.answers[q.id];
  const st = STATUS[r.status] || STATUS.wrong;
  const body = el('div', { class: 'rv-body' });
  body.append(el('div', { class: 'q-prompt', html: q.prompt }));

  if (q.section === 'mcq' || q.section === 'tf') {
    if (q.code) body.append(codeBlock(q.code));
    const opts = q.section === 'tf' ? [true, false] : (L.perm && L.perm[q.id]) || q.options.map((_, k) => k);
    body.append(el('div', { class: 'options review-opts' }, opts.map((k, pos) => {
      const right = k === q.answer;
      const mine = k === ans;
      const text = q.section === 'tf' ? (k ? 'True' : 'False') : q.options[k];
      return el('div', { class: 'option' + (right ? ' is-right' : '') + (mine && !right ? ' is-wrong' : '') },
        el('span', { class: 'opt-letter' }, q.section === 'tf' ? (k ? 'T' : 'F') : 'ABCD'[pos]),
        el('span', { class: 'opt-text', html: richText(text) }),
        mine ? el('span', { class: 'opt-tag' }, 'your answer') : null);
    })));
  } else if (q.section === 'fill') {
    const values = Array.isArray(ans) ? ans : [];
    const pre = el('pre', { class: 'code-block fill' });
    q.template.split(/\[\[(\d+)\]\]/).forEach((p, k) => {
      if (k % 2 === 0) { pre.insertAdjacentHTML('beforeend', hl(p)); return; }
      const idx = Number(p);
      const ok = r.blanks && r.blanks[idx];
      const mine = (values[idx] || '').trim();
      pre.append(el('span', { class: 'blank-review ' + (ok ? 'ok' : 'bad') },
        ok ? mine : el('span', {}, mine ? el('s', {}, mine) : el('i', {}, 'empty'), ' ', el('b', {}, q.blanks[idx].answers[0]))));
    });
    body.append(pre);
  } else {
    const code = ans ?? original(q);
    body.append(el('h4', {}, 'Your code'), codeBlock(code, 'mine'));
    if (r.note) body.append(el('div', { class: 'msg ' + (r.score > 0 ? 'warn' : 'error') }, el('strong', {}, r.note)));
    if (r.errors && r.errors.length) {
      body.append(el('div', { class: 'msg error' }, el('strong', {}, 'What the compiler said'),
        r.errors.map((e) => el('span', { class: 'hint-line', html: `${e.line ? `<b>line ${e.line}:</b> ` : ''}${richText(e.message)}` }))));
    }
    if (q.section === 'fix' && r.output !== undefined && r.status !== 'right') {
      body.append(el('div', { class: 'compare' },
        el('div', {}, el('h4', {}, 'It printed'), el('pre', { class: 'console-box' }, r.output || ' ')),
        el('div', {}, el('h4', {}, 'It should print'), el('pre', { class: 'console-box' }, q.expect))));
    }
    if (r.tests) {
      const passed = r.tests.filter((t) => t.ok).length;
      body.append(el('h4', {}, `Tests: ${passed} of ${r.tests.length} passed`),
        el('ul', { class: 'tests' }, r.tests.map((t) => el('li', { class: t.ok ? 'ok' : 'bad' },
          el('span', { class: 'ti' }, t.ok ? '✓' : '✗'),
          el('code', {}, t.label),
          !t.ok && (t.got !== undefined || t.note) ? el('span', { class: 'muted' }, t.note ? ` · ${t.note}` : ` · yours returned ${t.got}`) : null))));
    }
    body.append(el('details', { class: 'model' }, el('summary', {}, q.section === 'fix' ? 'Show the fixed program' : 'Show a model answer'), codeBlock(q.solution)));
  }
  body.append(el('div', { class: 'explain' }, el('strong', {}, 'Why: '), el('span', { html: q.explain })));
  const lesson = LESSON_FOR_TOPIC[q.topic];
  if (lesson && r.status !== 'right') body.append(el('button', { type: 'button', class: 'btn link small', onclick: () => openLesson(lesson) }, `Review the ${q.topic.toLowerCase()} lesson →`));

  return el('details', { class: 'rv rv-' + r.status, open: r.status !== 'right' ? true : null },
    el('summary', {},
      el('span', { class: 'rv-icon', 'aria-label': st.label, title: st.label }, st.icon),
      el('span', { class: 'rv-num' }, `Q${i + 1}`),
      el('span', { class: 'rv-title', html: summaryText(q) }),
      el('span', { class: 'rv-pts' }, `${r.score} / ${r.max}`)),
    body);
}

function summaryText(q) {
  const tmp = document.createElement('div');
  tmp.innerHTML = q.prompt;
  const plain = tmp.textContent.replace(/\s+/g, ' ').trim();
  const short = plain.length > 80 ? plain.slice(0, 78) + '…' : plain;
  return `<span class="chip tiny">${escapeHtml(q.topic)}</span> ${escapeHtml(short)}`;
}

route();
