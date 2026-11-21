// A 批优化对比截图：renders/opt/a1..a6 + stats.json
// 用法：node tools/opt-shots.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { decodePNG, stats } from './png.mjs';

const BASE = 'http://127.0.0.1:4321/';
const OUT = 'renders/opt';
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 500000,
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--hide-scrollbars',
    `--user-data-dir=/tmp/dsh-chrome-opt-${Date.now()}`, '--enable-unsafe-swiftshader', '--use-angle=metal'],
});
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { generated: new Date().toISOString(), shots: {}, performance: {} };
const BASELINE = { aerial: 114.8, hero: 118.8, cdu: 109.1, tanks: 118.3, fcc: 115.8, night: 74.7, flow: 103.5, day: 141.5, top: 136.3 };

function wire(page) {
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
}
async function ready(page, url) {
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 400000 });
  await page.waitForFunction('window.__ready === true && window.__fullReady === true', { timeout: 400000, polling: 300 });
  return +((Date.now() - t0) / 1000).toFixed(1);
}
async function shot(page, name, wait = 1100) {
  await sleep(wait);
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path });
  const s = stats(decodePNG(path));
  const perf = await page.evaluate(() => window.__perf());
  report.shots[name] = { mean: s.mean, darkPct: s.darkPct, clipPct: s.clipPct, hist: s.hist, perf };
  console.log(name, 'mean', s.mean, 'clip', s.clipPct, 'perf', JSON.stringify(perf));
  return { s, path };
}

/* ---------------- 1920×1080 high ---------------- */
const page = await browser.newPage();
wire(page);
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
report.performance.highReady = await ready(page, `${BASE}?clean=1&shot=aerial&q=high&procedural=1&autoexposure=0`);
report.performance.high = await page.evaluate(() => window.__perf());
report.performance.highBench1080 = await page.evaluate(() => window.__bench(20));
const aerial = await shot(page, 'a1-aerial');
report.shots['a1-aerial'].baselineMean = BASELINE.aerial;
report.shots['a1-aerial'].delta = +(aerial.s.mean - BASELINE.aerial).toFixed(1);

await page.evaluate(() => window.__setShot('hero'));
const hero = await shot(page, 'a1-hero');
report.shots['a1-hero'].baselineMean = BASELINE.hero;
report.shots['a1-hero'].delta = +(hero.s.mean - BASELINE.hero).toFixed(1);

await page.evaluate(() => window.__setShot('cdu'));
const cdu = await shot(page, 'a3-cdu');
report.shots['a3-cdu'].baselineMean = BASELINE.cdu;
report.shots['a3-cdu'].delta = +(cdu.s.mean - BASELINE.cdu).toFixed(1);
report.shots['a3-cdu'].shadow = await page.evaluate(() => window.__shadowInfo());

await page.evaluate(() => { window.__setAO(false); window.__setContactShadows(true); window.__setDof(false); });
await sleep(400);
await page.evaluate(() => window.__setShot('cdu'));
await page.evaluate(() => { window.__setAO(false); window.__setDof(false); });
await shot(page, 'a4-shadow');
report.shots['a4-shadow'].note = 'close-up: shadow frustum 1024/2048 focused; AO off to isolate sun shadows';

await page.evaluate(() => { window.__setAO(true); window.__setDof(true); window.__setShot('hero'); });
await page.evaluate(() => window.__setDof(true));
const cine = await shot(page, 'a5-cinematic');
report.shots['a5-cinematic'].baselineMean = BASELINE.hero;
report.shots['a5-cinematic'].delta = +(cine.s.mean - BASELINE.hero).toFixed(1);

// 同机位连拍，检查颗粒/自适应曝光不闪烁
await sleep(300);
const p1 = `${OUT}/.flicker-a.png`, p2 = `${OUT}/.flicker-b.png`;
await page.screenshot({ path: p1 });
await sleep(350);
await page.screenshot({ path: p2 });
const a = decodePNG(p1), b = decodePNG(p2);
let d = 0, n = 0;
for (let i = 0; i < a.data.length; i += 4) {
  d += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]); n += 3;
}
report.performance.flickerPixelDiff = +(d / n).toFixed(3);
fs.rmSync(p1); fs.rmSync(p2);

/* ---------------- 1280×720 low ---------------- */
const lowPage = await browser.newPage();
wire(lowPage);
await lowPage.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
report.performance.lowReady = await ready(lowPage, `${BASE}?clean=1&shot=aerial&q=low&autoexposure=0`);
report.performance.low = await lowPage.evaluate(() => window.__perf());
report.performance.lowBench720 = await lowPage.evaluate(() => window.__bench(30));
report.performance.lowRaf = await lowPage.evaluate(() => new Promise((res) => {
  let n = 0; const t = performance.now();
  function f() { n++; if (performance.now() - t < 3000) requestAnimationFrame(f); else res(+(n / ((performance.now() - t) / 1000)).toFixed(1)); }
  requestAnimationFrame(f);
}));
await shot(lowPage, 'a2-low');

/* ---------------- prebaked（默认路径，独立 cold browser） ---------------- */
await browser.close();
const browser2 = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 500000,
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--hide-scrollbars',
    `--user-data-dir=/tmp/dsh-chrome-opt6-${Date.now()}`, '--enable-unsafe-swiftshader', '--use-angle=metal'],
});
const p6 = await browser2.newPage();
wire(p6);
await p6.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
report.performance.prebakedReady = await ready(p6, `${BASE}?clean=1&shot=aerial&q=high&autoexposure=0`);
report.performance.prebaked = await p6.evaluate(() => ({ perf: window.__perf(), prebaked: window.__prebaked }));
const pb = await shot(p6, 'a6-prebaked');
report.shots['a6-prebaked'].baselineMean = BASELINE.aerial;
report.shots['a6-prebaked'].delta = +(pb.s.mean - BASELINE.aerial).toFixed(1);
// 与 a1 同机位比较
let pd = 0, pn = 0;
const im1 = decodePNG(`${OUT}/a1-aerial.png`), im2 = decodePNG(`${OUT}/a6-prebaked.png`);
for (let i = 0; i < im1.data.length; i += 4) {
  pd += Math.abs(im1.data[i] - im2.data[i]) + Math.abs(im1.data[i + 1] - im2.data[i + 1]) + Math.abs(im1.data[i + 2] - im2.data[i + 2]); pn += 3;
}
report.performance.prebakedVsProceduralPixelDiff = +(pd / pn).toFixed(3);

report.errors = errors;
fs.writeFileSync(`${OUT}/stats.json`, JSON.stringify(report, null, 2));
console.log('\nperformance', JSON.stringify(report.performance, null, 2));
console.log('errors', errors.length ? errors : 'none');
await browser2.close();
