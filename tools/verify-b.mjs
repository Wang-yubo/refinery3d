// B 批验收：预烘焙/程序化一致性、拾取、天气往返、重放确定性、FPS
//   node tools/verify-b.mjs                    # 全量（含 procedural 一致性，约 4 分钟）
//   node tools/verify-b.mjs --fps-only         # 只测 FPS（可配合 --base=http://127.0.0.1:4322/）
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { CHROME, GL_ARGS } from './chrome.mjs';
import { decodePNG, stats } from './png.mjs';

const argv = process.argv.slice(2);
const BASE = (argv.find((a) => a.startsWith('--base=')) || '').replace('--base=', '') || 'http://127.0.0.1:4321/';
const FPS_ONLY = argv.includes('--fps-only');
const RAF = argv.includes('--raf');
const TAG = BASE.includes('4322') ? 'base' : 'b';
const VP = (argv.find((a) => a.startsWith('--vp=')) || '--vp=1600x900').slice(5).split('x').map(Number);
fs.mkdirSync('diag', { recursive: true });

function diff(a, b) {
  if (a.width !== b.width || a.height !== b.height) return { err: 'size' };
  const n = a.data.length;
  let sum = 0, max = 0, over2 = 0;
  const hist = new Array(8).fill(0);
  for (let i = 0; i < n; i += 4) {
    const d = (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])) / 3;
    sum += d;
    if (d > max) max = d;
    if (d > 2) over2++;
    hist[Math.min(7, d | 0)]++;
  }
  const px = n / 4;
  return {
    mean: +(sum / px).toFixed(3), max: +max.toFixed(1),
    over2Pct: +((over2 / px) * 100).toFixed(2),
    hist: hist.map((v) => +((v / px) * 100).toFixed(1)),
  };
}

const launch = async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new', protocolTimeout: 600000,
    args: ['--no-sandbox', '--disable-gpu-sandbox', '--hide-scrollbars', `--user-data-dir=/tmp/dsh-vb-${Date.now()}-${Math.random()}`, ...GL_ARGS],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: VP[0], height: VP[1], deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return { browser, page, errors };
};

const ready = async (page, url) => {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction('window.__ready === true && window.__fullReady === true', { timeout: 600000, polling: 300 });
};

/** 同步渲染 n 帧的每帧耗时（绕开 rAF 节流/垂直同步），取中位数 */
const bench = async (page, n = 20, reps = 4) => {
  const arr = [];
  for (let i = 0; i < reps; i++) arr.push(await page.evaluate((k) => window.__bench(k).msPerFrame, n));
  const sorted = [...arr].sort((a, b) => a - b);
  const min = sorted[0];                    // 取最快样本：少受后台/降频干扰，用于 A/B 对比
  return { ms: +min.toFixed(2), med: +sorted[1].toFixed(2), samples: arr, fps: +(1000 / min).toFixed(1) };
};

/** 真实 rAF 帧间隔（含 composer / vsync 节流），跑满 dur 毫秒后取中位数 */
const raf = async (page, dur = 3000) => page.evaluate((ms) => new Promise((resolve) => {
  const t = [];
  let last = performance.now();
  const end = last + ms;
  const step = (now) => {
    t.push(now - last); last = now;
    if (now < end) requestAnimationFrame(step);
    else { t.sort((a, b) => a - b); const med = t[t.length >> 1]; resolve({ frames: t.length, medMs: +med.toFixed(2), fps: +(1000 / med).toFixed(1) }); }
  };
  requestAnimationFrame(step);
}), dur);

const out = { base: BASE, errors: [] };

if (FPS_ONLY && RAF) {
  const { browser, page, errors } = await launch();
  await ready(page, BASE + '?clean=1&shot=hero&q=high&autoexposure=0');
  await new Promise((r) => setTimeout(r, 2500));
  out.fps = { day: await raf(page) };
  await page.evaluate(() => window.__setShot('night'));
  await new Promise((r) => setTimeout(r, 2000));
  out.fps.night = await raf(page);
  await page.evaluate(() => { window.__setShot('hero'); window.__setWeather?.('rain'); });
  await new Promise((r) => setTimeout(r, 2000));
  out.fps.rain = await raf(page);
  out.fps.calls = await page.evaluate(() => window.__perf().calls);
  out.errors = errors.slice(0, 5);
  console.log('[' + TAG + '] raf day ' + out.fps.day.medMs + 'ms(' + out.fps.day.fps + 'fps) night ' + out.fps.night.medMs + 'ms rain ' + out.fps.rain.medMs + 'ms calls ' + out.fps.calls);
  fs.writeFileSync('diag/b-raf-' + TAG + '-' + VP[0] + 'x' + VP[1] + '.json', JSON.stringify(out, null, 2));
  await browser.close();
  process.exit(0);
}

if (FPS_ONLY) {
  const { browser, page, errors } = await launch();
  await ready(page, BASE + '?clean=1&shot=hero&q=high&autoexposure=0&motion=0');
  out.fps = { day: await bench(page) };
  await page.evaluate(() => window.__setShot('night'));
  await new Promise((r) => setTimeout(r, 900));
  out.fps.night = await bench(page);
  await page.evaluate(() => { window.__setShot('hero'); window.__setWeather?.('rain'); });
  await new Promise((r) => setTimeout(r, 900));
  out.fps.rain = await bench(page);
  out.fps.calls = await page.evaluate(() => window.__perf().calls);
  out.errors = errors.slice(0, 5);
  console.log(`[${TAG}] day ${out.fps.day.ms}ms night ${out.fps.night.ms}ms rain ${out.fps.rain.ms}ms calls ${out.fps.calls}`);
  fs.writeFileSync(`diag/b-fps-${TAG}.json`, JSON.stringify(out, null, 2));
  await browser.close();
  process.exit(0);
}

/* 1) 预烘焙 vs 程序化：同机位像素差（motion=0 排除动效时间差） */
const CAM = { pos: [-178, 46, 208], target: [-18, 34, -44], fov: 43 };
const a = await launch();
await ready(a.page, BASE + '?clean=1&shot=hero&q=high&autoexposure=0&motion=0');
const shot = async (page, file) => {
  await page.evaluate((c) => window.__setCam(c.pos, c.target, c.fov), CAM);
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: file });
  return decodePNG(file);
};
const pre = await shot(a.page, 'diag/b-prebaked.png');
out.prebaked = { mean: stats(pre).mean, calls: await a.page.evaluate(() => window.__perf().calls) };

const b = await launch();
await ready(b.page, BASE + '?clean=1&shot=hero&q=high&autoexposure=0&procedural=1&motion=0');
const proc = await shot(b.page, 'diag/b-procedural.png');
out.procedural = { mean: stats(proc).mean, calls: await b.page.evaluate(() => window.__perf().calls) };
out.pixelDiff = diff(pre, proc);
out.pixelDiff.pass = out.pixelDiff.mean < 2;

/* 2) 拾取代理：所有设备投影中心点击应命中设备（命中任一设备即说明代理对准），天空点击应为空 */
const picks = [];
const list = await a.page.evaluate(() => window.__equipList().map((e) => ({ id: e.id, x: e.x, y: e.y, z: e.z })));
let hitCount = 0;
for (const e of list) {
  const p = await a.page.evaluate((q) => window.__project(q.x, q.y, q.z), e);
  if (!p.front) continue;
  if (p.px < 4 || p.py < 4 || p.px > 1596 || p.py > 896) continue;
  await a.page.mouse.click(p.px, p.py);
  await new Promise((r) => setTimeout(r, 220));
  const sel = await a.page.evaluate(() => window.__equipState().selected);
  picks.push({ id: e.id, selected: sel });
  if (sel) hitCount++;
}
await a.page.mouse.click(6, 6);
await new Promise((r) => setTimeout(r, 250));
const skySel = await a.page.evaluate(() => window.__equipState().selected);
out.picking = { tested: picks.length, hits: hitCount, hitPct: +((hitCount / Math.max(1, picks.length)) * 100).toFixed(1), skySelected: skySel, picks: picks.slice(0, 6) };
out.picking.pass = hitCount / Math.max(1, picks.length) >= 0.85 && !skySel;

/* 3) 天气往返 + 三种天气 */
await a.page.evaluate(() => { window.__setShot('hero'); window.__setWeather('clear'); });
await new Promise((r) => setTimeout(r, 700));
const clear1 = await shot(a.page, 'diag/b-clear1.png');
await a.page.evaluate(() => window.__setWeather('rain'));
await new Promise((r) => setTimeout(r, 900));
const rain = await shot(a.page, 'diag/b-rain.png');
await a.page.evaluate(() => window.__setWeather('snow'));
await new Promise((r) => setTimeout(r, 900));
const snow = await shot(a.page, 'diag/b-snow.png');
await a.page.evaluate(() => window.__setWeather('fog'));
await new Promise((r) => setTimeout(r, 900));
const fog = await shot(a.page, 'diag/b-fog.png');
await a.page.evaluate(() => window.__setWeather('clear'));
await new Promise((r) => setTimeout(r, 900));
const clear2 = await shot(a.page, 'diag/b-clear2.png');
out.weather = {
  clear1: stats(clear1).mean, rain: stats(rain).mean, snow: stats(snow).mean, fog: stats(fog).mean, clear2: stats(clear2).mean,
  clearRoundTripDiff: +Math.abs(stats(clear1).mean - stats(clear2).mean).toFixed(2),
};
out.weather.clearRoundTrip = out.weather.clearRoundTripDiff <= 5;
out.weather.state = await a.page.evaluate(() => window.__weatherState());

/* 4) 重放确定性：固定 anim/weather 时间，两次相同操作应完全一致 */
const replaySeq = async () => {
  await a.page.evaluate(() => {
    window.__setDof(false); window.__pauseAnim(); window.__setWeather('clear'); window.__setWeather('rain');
    window.__setAnimTime(7); window.__setWeatherTime(3.5);
  });
  await new Promise((r) => setTimeout(r, 800));
  return shot(a.page, `diag/b-replay-${Math.random().toString(36).slice(2, 7)}.png`);
};
const r1 = await replaySeq();
const r2 = await replaySeq();
out.replay = { diff: diff(r1, r2) };
out.replay.pass = out.replay.diff.mean <= 0.01;
await a.page.evaluate(() => { window.__resumeTime(); window.__setWeather('clear'); });

/* 5) FPS：day / night / rain（__bench 同步渲染） */
await a.page.evaluate(() => { window.__setShot('hero'); window.__setWeather('clear'); });
await new Promise((r) => setTimeout(r, 700));
const fDay = await bench(a.page);
await a.page.evaluate(() => window.__setShot('night'));
await new Promise((r) => setTimeout(r, 900));
const fNight = await bench(a.page);
await a.page.evaluate(() => { window.__setShot('hero'); window.__setWeather('rain'); });
await new Promise((r) => setTimeout(r, 900));
const fRain = await bench(a.page);
out.fps = { day: fDay, night: fNight, rain: fRain };
out.calls = await a.page.evaluate(() => window.__perf().calls);
out.errors = [...a.errors, ...b.errors].slice(0, 8);
out.pass = {
  bakedParity: out.pixelDiff.pass, picking: out.picking.pass,
  weatherRoundTrip: out.weather.clearRoundTrip, replay: out.replay.pass,
  noErrors: out.errors.length === 0,
};
fs.writeFileSync('diag/b-verify.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify({ pixelDiff: out.pixelDiff, picking: out.picking, weather: out.weather, replay: out.replay, fps: out.fps, pass: out.pass }, null, 1));
await a.browser.close();
await b.browser.close();