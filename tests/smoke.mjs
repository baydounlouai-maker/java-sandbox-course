// Browser smoke test: node tests/smoke.mjs [outDir]
import { chromium } from 'playwright';
const out = process.argv[2] || '.';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto('http://localhost:8765/');
await page.waitForSelector('.cm-editor', { timeout: 15000 });
await page.waitForTimeout(800);
await page.screenshot({ path: out + '/01-start.png' });
// jump to the polymorphism lesson, load the solution, run
const lessonIdx = Number(process.env.LESSON || 15);
await page.click(`#lessonDots .dot:nth-child(${lessonIdx})`);
await page.click('#solutionBtn');
await page.click('dialog .btn.primary');
await page.waitForTimeout(300);
await page.click('#runBtn');
await page.waitForTimeout(Number(process.env.WAIT || 3500));
await page.screenshot({ path: out + '/02-run.png' });
const steps = await page.$$eval('.step', (els) => els.map((e) => e.className));
console.log('steps', steps);
console.log('output', (await page.textContent('#outputBody')).slice(0, 400));
console.log('errors', errors.slice(0, 20));
await browser.close();
