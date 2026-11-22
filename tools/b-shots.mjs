// B 批截图 / 指标：9 张效果图 + 近景细节 + 天气/夜间 + 性能，输出 JSON
//   node tools/b-shots.mjs --tag baseline          # 只跑 9 张（对比基线）
//   node tools/b-shots.mjs --tag b1 --extras       # 9 张 + renders/b/*.png 近景
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { CHROME, GL_ARGS } from './chrome.mjs';
import { decodePNG, stats } from './png.mjs';

const argv = process.argv.slice(2);
const tag = (() => { const i = argv.indexOf('--tag'); return i >= 0 ? argv[i + 1] : 'run'; })();
const EXTRAS = argv.includes('--extras');
const PROC = argv.includes('--procedural') ? '&procedural=1' : '';
const ONLY = (argv.find((a) => a.startsWith('--only=')) || '').replace('--only=', '');
const SHOTS = ONLY ? ONLY.split(',') : ['aerial', 'hero', 'cdu', 'tanks', 'fcc', 'night', 'flow', 'day', 'top'];

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', protocolTimeout: 400000,
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--hide-scrollbars',
    `--user-data-dir=/tmp/dsh-bshots-${Date.now()}`, ...GL_ARGS],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const t0 = Date.now();
await page.goto('http://127.0.0.1:4321/?clean=1&shot=aerial&q=high' + PROC, { waitUntil: 'domcontentloaded', timeout: 400000 });
await page.waitForFunction('window.__ready === true && window.__fullReady === true', { timeout: 400000, polling: 300 });
const bootSec = (Date.now() - t0) / 1000;
fs.mkdirSync('diag', { recursive: true });
fs.mkdirSync('renders/b', { recursive: true });

const bench = async (n = 24) => page.evaluate((k) => window.__bench(k), n);
const info = async () => page.evaluate(() => {
  const p = window.__perf();
  return { calls: p.calls, triangles: p.triangles, quality: p.quality, pixelRatio: p.pixelRatio, ao: p.ao, bloom: p.bloom };
});

const out = { tag, bootSec: +bootSec.toFixed(1), shots: {}, errors };
const base = await info();
out.perf = { ...base, bench: await bench() };

for (const name of SHOTS) {
  await page.evaluate((n) => window.__setShot(n), name);
  await new Promise((r) => setTimeout(r, 900));
  const path = `renders/b/${name}.png`;
  await page.screenshot({ path });
  const s = stats(decodePNG(path));
  const pr = await page.evaluate(() => window.__perf());
  out.shots[name] = { mean: s.mean, darkPct: s.darkPct, clipPct: s.clipPct, calls: pr.calls, triangles: pr.triangles, bench: await bench(16) };
  console.log(`${name.padEnd(6)} mean=${String(s.mean).padStart(6)} dark=${s.darkPct}% clip=${s.clipPct}% calls=${pr.calls} bench=${out.shots[name].bench.msPerFrame}ms`);
}

const near = async (id, cam, { weather = null, extra = null, path = null, wait = 900 } = {}) => {
  await page.evaluate(({ cam, weather }) => {
    if (weather) window.__setWeather?.(weather);
    window.__setCam(cam.pos, cam.target, cam.fov);
  }, { cam, weather });
  if (extra) await page.evaluate(extra);
  await new Promise((r) => setTimeout(r, wait));
  const p = path || `renders/b/${id}.png`;
  await page.screenshot({ path: p });
  const s = stats(decodePNG(p));
  console.log(`  · ${id} mean=${s.mean} clip=${s.clipPct}% → ${p}`);
  return { mean: s.mean, clipPct: s.clipPct, path: p };
};

if (EXTRAS) {
  out.extras = {};
  // B1 材质近景：罐体 + 管廊 + 钢结构
  out.extras.b1 = await near('b1-material', { pos: [-176, 9, -9], target: [-181, 9, -76], fov: 34 }, { path: 'renders/b/b1-material.png' });
  // B2 结构细节：FCC + 重整
  out.extras.b2 = await near('b2-structure', { pos: [62, 30, -34], target: [86, 26, -76], fov: 42 }, { path: 'renders/b/b2-structure.png' });
  // B4 夜间
  await page.evaluate(() => window.__setShot('night'));
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: 'renders/b/b4-night.png' });
  out.extras.b4 = stats(decodePNG('renders/b/b4-night.png'));
  out.extras.b4NightBench = await bench(16);
  // B3 天气（黄昏机位）
  await page.evaluate(() => window.__setShot('hero'));
  await new Promise((r) => setTimeout(r, 600));
  for (const w of ['rain', 'snow', 'fog']) {
    out.extras[w] = await near(`b3-${w}`, { pos: [-178, 46, 208], target: [-18, 34, -44], fov: 43 }, { weather: w, path: `renders/b/b3-${w}.png` });
    out.extras.rain = out.extras.rain || null;
  }
  out.extras.rainBench = await bench(16);
  await page.evaluate(() => window.__setWeather?.('clear'));
  out.extras.clear = await near('b3-clear', { pos: [-178, 46, 208], target: [-18, 34, -44], fov: 43 }, { path: 'renders/b/b3-clear.png' });
  // B5 动态细节
  await page.evaluate(() => window.__setCam([-30, 26, 120], [0, 30, 60], 40));
  await page.evaluate(() => window.__setAnimTime?.(12));
  out.extras.b5 = await near('b5-motion', { pos: [-30, 26, 120], target: [0, 30, 60], fov: 40 }, { path: 'renders/b/b5-motion.png' });
}

out.totalSec = +((Date.now() - t0) / 1000).toFixed(1);
out.errors = errors.slice(0, 8);
fs.writeFileSync(`diag/b-${tag}.json`, JSON.stringify(out, null, 2));
console.log(`\ntag=${tag} boot=${out.bootSec}s total=${out.totalSec}s calls=${out.perf.calls} bench=${out.perf.bench.msPerFrame}ms errors=${errors.length}`);
await browser.close();