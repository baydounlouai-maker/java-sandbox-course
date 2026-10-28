// Takes the exam in a real browser: node tests/exam-browser.mjs [outDir]
// Answers everything correctly except a few deliberate mistakes, hands in, and checks the score.
import { chromium } from 'playwright';
import { QUESTIONS } from '../js/exam/questions.js';

const out = process.argv[2] || '.';
const base = process.env.BASE || 'http://localhost:8765/';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(base + 'exam.html');
await page.evaluate(() => localStorage.removeItem('javaIsland.exam.v1'));
await page.reload();
await page.waitForSelector('.intro-card');
await page.screenshot({ path: out + '/exam-01-intro.png', fullPage: true });
await page.click('text=Start the exam');
await page.waitForSelector('.exam-q');
await page.screenshot({ path: out + '/exam-02-q1.png' });

const plain = (s) => s.replace(/`/g, '');
// deliberate mistakes: one wrong MCQ, one wrong blank, one unfixed program, one partly right method
const WRONG_MCQ = 'mc-static';
const WRONG_BLANK = 'fill-array-sum';
const SKIP = 'fix-types';
const PARTIAL = 'write-vowels';
let expected = 0;

for (let i = 0; i < QUESTIONS.length; i++) {
  const q = QUESTIONS[i];
  await page.click(`#examNav .qnum >> text="${i + 1}"`);
  await page.waitForSelector(`.q-num:text("Question ${i + 1}")`);
  if (q.section === 'mcq') {
    const want = q.id === WRONG_MCQ ? plain(q.options[(q.answer + 1) % q.options.length]) : plain(q.options[q.answer]);
    const opts = await page.$$('.option');
    for (const o of opts) if ((await o.$eval('.opt-text', (e) => e.textContent)) === want) { await o.click(); break; }
    if (q.id !== WRONG_MCQ) expected += q.points;
  } else if (q.section === 'tf') {
    await page.click(`.tf-${q.answer}`);
    expected += q.points;
  } else if (q.section === 'fill') {
    const inputs = await page.$$('.blank');
    for (let k = 0; k < inputs.length; k++) await inputs[k].fill(q.id === WRONG_BLANK && k === 1 ? '=' : q.blanks[k].answers.at(-1));
    expected += q.id === WRONG_BLANK ? q.points / 2 : q.points;
  } else if (q.id !== SKIP) {
    let code = q.solution;
    if (q.id === PARTIAL) code = code.replace('word.toLowerCase()', 'word'); // misses capital vowels
    await page.click('.q-editor .cm-content');
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    await page.keyboard.insertText(code);
    await page.waitForTimeout(350);
    const typed = await page.$eval('.q-editor .cm-content', (e) => e.cmView ? null : e.innerText);
    if (q.section === 'write') {
      await page.click('.small-run');
      await page.waitForSelector('.q-output .console, .q-output .msg', { timeout: 10000 });
      if (q.id === 'write-grade') await page.screenshot({ path: out + '/exam-03-write-run.png' });
    }
    expected += q.id === PARTIAL ? null : q.points;
    void typed;
  }
  if (i === 22) await page.screenshot({ path: out + '/exam-04-fill.png' });
  if (i === 26) await page.screenshot({ path: out + '/exam-05-fix.png' });
}
// flag one question to check the dialog mentions it
await page.click('#examNav .qnum >> text="3"');
await page.click('.q-head button:has-text("Flag")');
await page.click('.exam-bar .btn.primary');
await page.waitForSelector('dialog[open]');
console.log('dialog:', (await page.textContent('dialog')).replace(/\s+/g, ' '));
await page.click('dialog .btn.primary');
await page.waitForSelector('.result-hero', { timeout: 60000 });
await page.waitForTimeout(300);
await page.screenshot({ path: out + '/exam-06-results.png', fullPage: true });
const score = await page.textContent('.score-ring strong');
const vowelPts = await page.$$eval('.rv', (els) => els.map((e) => e.querySelector('.rv-pts').textContent));
console.log('score', score, 'expected (without partial)', expected, 'per question', vowelPts.join(' '));

// reload keeps the result; a fresh attempt survives a reload too
await page.reload();
await page.waitForSelector('.intro-card');
console.log('history rows', await page.$$eval('.history tbody tr', (r) => r.length));
await page.click('text=Start the exam');
await page.click('.option >> nth=0');
await page.reload();
await page.waitForSelector('.exam-q');
console.log('resumed answered:', await page.textContent('.nav-head strong'));

// phone width
await page.setViewportSize({ width: 390, height: 844 });
await page.click('#examNav .qnum >> text="30"');
await page.waitForTimeout(300);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
await page.screenshot({ path: out + '/exam-07-phone.png', fullPage: false });
console.log('phone horizontal overflow px:', overflow);
console.log('errors', errors);
await browser.close();
