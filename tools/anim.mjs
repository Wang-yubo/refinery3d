// 工艺流程动画：无头渲染 + 自检
// 用法：node tools/anim.mjs [check|render]
//   check  - 只做 API/像素自检，输出统计与诊断，不写 renders/
//   render - 生成 renders/anim-01..06.png 与 renders/anim-overview.png（默认）
import puppeteer from 'puppeteer-core';
import { CHROME, GL_ARGS } from './chrome.mjs';
import fs from 'node:fs';
import { decodePNG, stats, ascii, colorMap } from './png.mjs';

const mode = process.argv[2] || 'render';
const STAGE_COUNT = 6;
const W = 1920, H = 1080;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new', protocolTimeout: 500000,
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--hide-scrollbars',
    '--user-data-dir=/tmp/dsh-chrome-anim', ...GL_ARGS],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });

const logs = [];
const errors = [];
page.on('console', (m) => {
  const line = `[${m.type()}] ${m.text()}`;
  logs.push(line);
  if (m.type() === 'error') errors.push(line);
});
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
page.on('requestfailed', (r) => errors.push('[requestfailed] ' + r.url()));

const t0 = Date.now();
await page.goto('http://127.0.0.1:4321/?clean=1&anim=1&stage=0', { waitUntil: 'domcontentloaded', timeout: 300000 });
await page.waitForFunction('window.__ready === true && window.__fullReady === true && window.__animReady === true', { timeout: 300000, polling: 300 });
await page.evaluate(() => window.__pauseAnim());
console.log(`loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

fs.mkdirSync('renders', { recursive: true });
fs.mkdirSync('/tmp/animcheck', { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function grab(path) {
  await sleep(420);
  await page.screenshot({ path });
  return decodePNG(path);
}

function patchMax(img, px, py, r = 6) {
  let best = 0;
  for (let y = Math.max(0, py - r); y < Math.min(img.height, py + r); y++) {
    for (let x = Math.max(0, px - r); x < Math.min(img.width, px + r); x++) {
      const i = (y * img.width + x) * 4;
      best = Math.max(best, img.data[i], img.data[i + 1], img.data[i + 2]);
    }
  }
  return best;
}

function meanDiff(a, b, step = 24) {
  let sum = 0, n = 0;
  for (let y = 0; y < a.height; y += step) {
    for (let x = 0; x < a.width; x += step) {
      const i = (y * a.width + x) * 4;
      sum += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
      n++;
    }
  }
  return +(sum / n / 3).toFixed(2);
}

const flowInfo = await page.evaluate(() => window.__flowInfo());
const stageNames = await page.evaluate(() => window.__animState && null);
const results = [];

/* ---------- per stage ---------- */
for (let i = 0; i < STAGE_COUNT; i++) {
  const t = 5.5 + i * 0.8;
  await page.evaluate(({ i, t }) => {
    window.__pauseAnim();
    window.__setStage(i);
    window.__setAnimTime(t);
    window.__renderOnce();
  }, { i, t });
  const st = await page.evaluate(() => window.__animState());
  const hud = await page.evaluate(() => ({
    cn: document.getElementById('astage-cn').textContent,
    en: document.getElementById('astage-en').textContent,
    num: document.getElementById('astage-num').textContent,
    bar: document.getElementById('abar').style.width,
  }));
  const path = `${mode === 'render' ? `renders/anim-0${i + 1}.png` : `/tmp/animcheck/stage-${i}.png`}`;
  const img = await grab(path);
  const s = stats(img);

  // 活跃流线可见性：沿折线取多个点投影，只统计落在画面内的点
  const active = flowInfo.filter((f) => f.stages.includes(i));
  const samples = [];
  for (const f of active) {
    for (const frac of [0.12, 0.3, 0.5, 0.68]) {
      const p = f.points[Math.min(f.points.length - 1, Math.floor(f.points.length * frac))];
      samples.push({ id: f.id, p });
    }
  }
  const projs = await page.evaluate((list) => list.map((s) => window.__project(s.p[0], s.p[1], s.p[2])), samples);
  const vis = { ok: false, best: 0, samples: [] };
  projs.forEach((pr, k) => {
    if (!pr.front || pr.px < 8 || pr.px > W - 8 || pr.py < 8 || pr.py > H - 8) return;
    const val = patchMax(img, pr.px, pr.py, 7);
    vis.samples.push({ id: samples[k].id, px: pr.px, py: pr.py, max: val });
    if (val > vis.best) vis.best = val;
  });
  vis.ok = vis.best > 110;

  results.push({ stage: i + 1, cn: hud.cn, en: hud.en, num: hud.num, t, mean: s.mean, dark: s.darkPct, clip: s.clipPct, vis, path });
  console.log(`\n=== stage 0${i + 1} ${hud.cn} / ${hud.en} | t=${t} mean=${s.mean} dark=${s.darkPct}% clip=${s.clipPct}% bar=${hud.bar}`);
  console.log(`    flow: ${vis.ok ? 'OK' : 'WEAK'} max=${vis.best} ${JSON.stringify(vis.samples)}`);
  if (mode === 'check') console.log(ascii(img, 96, 26));
}

/* ---------- overview ---------- */
await page.evaluate(() => {
  window.__pauseAnim();
  window.__animOverview();
  window.__setAnimTime(5);
  window.__renderOnce();
});
const ovPath = mode === 'render' ? 'renders/anim-overview.png' : '/tmp/animcheck/overview.png';
const ovImg = await grab(ovPath);
const ovStats = stats(ovImg);
const labelProbes = await page.evaluate(() => window.__labelProbe());
const ovState = await page.evaluate(() => ({
  labels: window.__labelProbe().length,
  hud: document.getElementById('astage-cn').textContent,
  en: document.getElementById('astage-en').textContent,
}));
const labelsIn = labelProbes.filter((l) => l.px[0] > 24 && l.px[0] < W - 24 && l.px[1] > 24 && l.px[1] < H - 24).length;
console.log(`\n=== overview mean=${ovStats.mean} dark=${ovStats.darkPct}% clip=${ovStats.clipPct}% labels=${ovState.labels} inView=${labelsIn} hud=${ovState.hud} / ${ovState.en}`);
console.log('    label px', labelProbes.map((l) => l.px.join(',')).join(' | '));
if (mode === 'check') console.log(ascii(ovImg, 96, 26));

/* ---------- reproducibility: same stage, different times ---------- */
await page.evaluate(() => { window.__setStage(2); });
const rImgs = [];
for (const t of [0, 10, 30]) {
  await page.evaluate((t) => { window.__pauseAnim(); window.__setAnimTime(t); window.__renderOnce(); }, t);
  rImgs.push(await grab(`/tmp/animcheck/time-${t}.png`));
}
const d01 = meanDiff(rImgs[0], rImgs[1]);
const d12 = meanDiff(rImgs[1], rImgs[2]);
console.log(`\n=== time diff 0->10: ${d01}  10->30: ${d12}`);

/* ---------- replay determinism (same t twice) ---------- */
/* 曝光自适应会让同一帧的曝光值缓慢漂移几 %，先钉住曝光再做重放对比 */
await page.evaluate(() => { window.__setAutoExposure?.(false); });
await page.evaluate(() => { window.__setAnimTime(21.5); window.__renderOnce(); });
const detA = await grab('/tmp/animcheck/det-a.png');
await page.evaluate(() => { window.__setAnimTime(3); window.__renderOnce(); });
await page.evaluate(() => { window.__setAnimTime(21.5); window.__renderOnce(); });
const detB = await grab('/tmp/animcheck/det-b.png');
const detDiff = meanDiff(detA, detB, 8);
console.log(`=== replay same t diff: ${detDiff}`);

/* ---------- HUD toggle / keyboard / cruise ---------- */
await page.evaluate(() => { window.__playAnim(); window.__setCruise(true); window.__setAnimSpeed(2); });
await sleep(500);
const st2 = await page.evaluate(() => window.__animState());
console.log(`=== play/2x state: ${JSON.stringify({ playing: st2.playing, speed: st2.speed, cruise: st2.cruise, stage: st2.stage, time: st2.time })}`);
await page.evaluate(() => { window.__pauseAnim(); window.__setAnimSpeed(1); });

const fails = [];
for (const r of results) {
  if (r.mean < 20 || r.mean > 180) fails.push(`stage ${r.stage} mean ${r.mean}`);
  if (r.clip > 3) fails.push(`stage ${r.stage} clip ${r.clip}`);
  if (!r.vis.ok) fails.push(`stage ${r.stage} flow invisible (${r.vis.best})`);
  if (!r.cn) fails.push(`stage ${r.stage} hud empty`);
}
if (ovStats.mean < 20 || ovStats.mean > 180) fails.push(`overview mean ${ovStats.mean}`);
if (ovStats.clip > 3) fails.push(`overview clip ${ovStats.clip}`);
if (ovState.labels < 7) fails.push(`overview labels ${ovState.labels}`);
if (labelsIn < 6) fails.push(`overview labels in view ${labelsIn}`);
if (d01 < 1.5) fails.push(`time 0 vs 10 too similar (${d01})`);
if (d12 < 1.5) fails.push(`time 10 vs 30 too similar (${d12})`);
if (detDiff > 0.6) fails.push(`replay not deterministic (${detDiff})`);
if (errors.length) fails.push(`console errors: ${errors.slice(0, 3).join(' | ')}`);

console.log('\n--- console (non-timing) ---');
console.log(logs.filter((l) => !l.includes('[timing]')).slice(0, 16).join('\n') || '(none)');
console.log('\n--- result ---');
if (fails.length) {
  console.log('FAIL\n - ' + fails.join('\n - '));
  process.exitCode = 1;
} else {
  console.log('ALL CHECKS PASSED');
}
await browser.close();