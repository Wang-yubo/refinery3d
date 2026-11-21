// A6b 冷启动优化对比截图：renders/opt2/a6b-*.png + stats.json
// 与 A 批（renders/opt/stats.json）同机位对比，验证首帧渐进升级后画面零回退。
// 用法：node tools/opt2-shots.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { decodePNG, stats } from './png.mjs';

const BASE = 'http://127.0.0.1:4321/';
const OUT = 'renders/opt2';
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 500000,
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--hide-scrollbars',
    `--user-data-dir=/tmp/dsh-chrome-opt2-${Date.now()}`, '--enable-unsafe-swiftshader', '--use-angle=metal'],
});
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { generated: new Date().toISOString(), cold: {}, shots: {}, gl: {}, notes: [] };

const pending = fs.existsSync('renders/opt/stats.json') ? JSON.parse(fs.readFileSync('renders/opt/stats.json', 'utf8')) : null;
const REF = {
  aerial: pending?.shots?.['a6-prebaked']?.mean ?? 115.6,
  hero: pending?.shots?.['a1-hero']?.mean ?? 123.1,
  cdu: pending?.shots?.['a3-cdu']?.mean ?? 113.0,
};

const page = await browser.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

async function shot(name, wait = 1100) {
  await sleep(wait);
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path });
  const s = stats(decodePNG(path));
  const perf = await page.evaluate(() => window.__perf());
  console.log(name, 'mean', s.mean, 'clip', s.clipPct, 'perf', JSON.stringify(perf));
  return { s, path, perf };
}

/* ---------- 冷启动（新 profile）：抓首帧时刻 / full 时刻 ---------- */
const t0 = Date.now();
await page.goto(`${BASE}?clean=1&shot=hero`, { waitUntil: 'domcontentloaded', timeout: 400000 });
await page.waitForFunction('window.__ready === true', { timeout: 400000, polling: 100 });
const lean = await page.evaluate(() => ({ readyAt: window.__readyAt, full: window.__fullReady === true }));
if (!lean.full) {
  try { await page.screenshot({ path: `${OUT}/a6b-firstframe.png` }); report.notes.push('a6b-firstframe.png = __ready 时刻的轻量首帧'); } catch {}
}
await page.waitForFunction('window.__fullReady === true', { timeout: 400000, polling: 200 });
report.cold.wallToReady = await page.evaluate((go) => +(((performance.timeOrigin + (window.__readyAt || performance.now())) - go) / 1000).toFixed(2), t0);
report.cold.wallToFull = await page.evaluate((go) => +(((performance.timeOrigin + (window.__fullReadyAt || performance.now())) - go) / 1000).toFixed(2), t0);
report.cold.phases = await page.evaluate(() => window.__timing());
report.cold.renderInfo = await page.evaluate(() => window.__renderInfo());
console.log('cold ready', report.cold.wallToReady, 'full', report.cold.wallToFull);

/* ---------- 高档 1080p：与 A 批同机位 ---------- */
await page.evaluate(() => window.__setShot('aerial'));
const aerial = await shot('a6b-aerial');
await page.evaluate(() => window.__setShot('hero'));
const hero = await shot('a6b-hero');
await page.evaluate(() => window.__setShot('cdu'));
const cdu = await shot('a6b-cdu');

/* ---------- 低档 ---------- */
await page.evaluate(() => window.__setQuality('low'));
await page.evaluate(() => window.__setShot('aerial'));
const low = await shot('a6b-low');
report.shots.low = { mean: low.s.mean, clipPct: low.s.clipPct, perf: low.perf };

/* ---------- 三档位 + 流程动画 + 拾取回归（同一次会话） ---------- */
const quality = {};
for (const q of ['low', 'mid', 'high']) {
  await page.evaluate((x) => window.__setQuality(x), q);
  await sleep(700);
  const s = stats(decodePNG(await (async () => { await page.screenshot({ path: `${OUT}/_q-${q}.png` }); return `${OUT}/_q-${q}.png`; })()));
  quality[q] = { mean: s.mean, clipPct: s.clipPct, perf: await page.evaluate(() => window.__perf()) };
  fs.rmSync(`${OUT}/_q-${q}.png`, { force: true });
}
report.quality = quality;

await page.evaluate(() => window.__setQuality('high'));
await page.evaluate(() => window.__setShot('flow'));
await sleep(1500);
const flowState = await page.evaluate(() => ({ anim: window.__animState ? window.__animState() : null, labels: window.__labelProbe() }));
report.flow = flowState;

const equip = await page.evaluate(() => (window.__equipProbe ? window.__equipProbe() : null));
report.equip = equip;

for (const [name, s, ref] of [['aerial', aerial, REF.aerial], ['hero', hero, REF.hero], ['cdu', cdu, REF.cdu]]) {
  report.shots[name] = { mean: s.s.mean, darkPct: s.s.darkPct, clipPct: s.s.clipPct, hist: s.s.hist, perf: s.perf, refMean: ref, delta: +(s.s.mean - ref).toFixed(1) };
  if (Math.abs(s.s.mean - ref) > 5) report.notes.push(`${name} 与 A 批均值差 ${(s.s.mean - ref).toFixed(1)} 超出 ±5`);
  if (s.s.clipPct >= 1) report.notes.push(`${name} clip=${s.s.clipPct}% ≥ 1%`);
}
report.errors = errors;
fs.writeFileSync(`${OUT}/stats.json`, JSON.stringify(report, null, 2));
console.log('\n--- deltas vs A 批 ---');
for (const k of ['aerial', 'hero', 'cdu']) console.log(k, report.shots[k].mean, 'ref', report.shots[k].refMean, 'delta', report.shots[k].delta);
console.log('errors', errors.length ? errors : 'none');
console.log('notes', report.notes.length ? report.notes : 'none');
await browser.close();