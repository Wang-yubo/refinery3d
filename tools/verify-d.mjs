// D 批验收：重构前后像素对比（同机位/同阶段/同 t）、设备拾取元数据对比、音频开销
//   node tools/verify-d.mjs --tag base      # 重构前基线（写 diag/d-base.json + diag/d-base-*.png）
//   node tools/verify-d.mjs --tag after     # 重构后对比
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { CHROME, GL_ARGS } from './chrome.mjs';
import { decodePNG, stats } from './png.mjs';

const argv = process.argv.slice(2);
const tag = (() => { const i = argv.indexOf('--tag'); return i >= 0 ? argv[i + 1] : 'run'; })();
fs.mkdirSync('diag', { recursive: true });

const CASES = [
  { id: 'stage2t9', url: '?clean=1&q=high&autoexposure=0&motion=0&anim=1&stage=2&t=9&playing=0', cam: null },
  { id: 'stage4t5', url: '?clean=1&q=high&autoexposure=0&motion=0&anim=1&stage=4&t=5&playing=0', cam: null },
  { id: 'flowcam', url: '?clean=1&q=high&autoexposure=0&motion=0&anim=1&stage=1&t=3&playing=0', cam: { pos: [-120, 40, 22], target: [-100, 12, -2], fov: 46 } },
];

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', protocolTimeout: 400000,
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--hide-scrollbars', `--user-data-dir=/tmp/dsh-vd-${Date.now()}`, ...GL_ARGS],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const out = { tag, shots: {}, errors: [] };
for (const c of CASES) {
  await page.goto('http://127.0.0.1:4321/' + c.url, { waitUntil: 'domcontentloaded', timeout: 400000 });
  await page.waitForFunction('window.__ready === true && window.__fullReady === true', { timeout: 400000, polling: 300 });
  await page.evaluate(() => { window.__pauseAnim?.(); });
  if (c.cam) await page.evaluate((cam) => window.__setCam(cam.pos, cam.target, cam.fov), c.cam);
  await new Promise((r) => setTimeout(r, 900));
  const file = `diag/d-${tag}-${c.id}.png`;
  await page.screenshot({ path: file });
  const st = stats(decodePNG(file));
  out.shots[c.id] = { file, mean: st.mean, clipPct: st.clipPct };
  console.log(`${c.id} mean=${st.mean} clip=${st.clipPct}%`);
}

// 设备元数据（35 台）
await page.goto('http://127.0.0.1:4321/?clean=1&shot=aerial&q=low', { waitUntil: 'domcontentloaded', timeout: 400000 });
await page.waitForFunction('window.__ready === true', { timeout: 400000, polling: 300 });
out.equip = await page.evaluate(() => window.__equipList().map((e) => ({ id: e.id, cn: e.cn, en: e.en, unit: e.unit, kind: e.kind, x: e.x, y: e.y, z: e.z, w: e.w, h: e.h, d: e.d })));
out.flow = await page.evaluate(() => window.__flowInfo().map((f) => ({ id: f.id, color: f.color, stages: f.stages, points: f.points })));
out.audio = await page.evaluate(() => (window.__audioState ? window.__audioState() : null));
/* 音频：默认静音 / 开关 / 记忆 / 隐藏挂起 / 帧开销 / 蒸汽包络 */
const audio = {};
await page.goto('http://127.0.0.1:4321/?clean=0&q=low&shot=hero', { waitUntil: 'domcontentloaded', timeout: 400000 });
await new Promise((r) => setTimeout(r, 12000));
audio.default = await page.evaluate(() => window.__audioState());
audio.btnInitial = await page.evaluate(() => document.getElementById('audio-btn')?.textContent);
const raf = (ms) => page.evaluate((dur) => new Promise((res) => {
  const t = []; let last = performance.now(); const end = last + dur;
  const step = (now) => { t.push(now - last); last = now; if (now < end) requestAnimationFrame(step); else { t.sort((a, b) => a - b); res(+t[t.length >> 1].toFixed(2)); } };
  requestAnimationFrame(step);
}), ms);
audio.frameMs = { off: await raf(2000), on: [], offAgain: await raf(2000) };
await page.evaluate(() => document.getElementById('audio-btn').click());
await new Promise((r) => setTimeout(r, 2000));
audio.afterClick = await page.evaluate(() => window.__audioState());
audio.btnOn = await page.evaluate(() => document.getElementById('audio-btn')?.textContent);
audio.frameMs.on.push(await raf(2000));
await page.evaluate(() => window.__setAudio(false));
await new Promise((r) => setTimeout(r, 1200));
audio.afterOff = await page.evaluate(() => window.__audioState());
// 隐藏标签页 → suspend
await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
await new Promise((r) => setTimeout(r, 600));
audio.hiddenCtx = await page.evaluate(() => window.__audioState().ctx);
// 重新打开，等一次蒸汽（6–14s）
await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); window.__setAudio(true); });
await new Promise((r) => setTimeout(r, 16000));
audio.steamBursts = await page.evaluate(() => window.__audioState().steamBursts);
audio.stored = await page.evaluate(() => localStorage.getItem('refinery3d.audio'));
const onArr = audio.frameMs.on.filter((v) => Number.isFinite(v));
audio.frameAvg = {
  off: +((audio.frameMs.off + audio.frameMs.offAgain) / 2).toFixed(2),
  on: +(onArr.reduce((x, y) => x + y, 0) / Math.max(1, onArr.length)).toFixed(2),
};
audio.frameOverheadPct = +(((audio.frameAvg.on - audio.frameAvg.off) / audio.frameAvg.off) * 100).toFixed(2);
audio.pass = !audio.default.on && audio.afterClick.on && audio.hiddenCtx === "suspended" && audio.steamBursts > 0 && Math.abs(audio.frameOverheadPct) < 2;
out.audio = audio;
out.errors = errors.slice(0, 8);
fs.writeFileSync(`diag/d-${tag}.json`, JSON.stringify(out, null, 2));
console.log(`tag=${tag} equip=${out.equip.length} errors=${errors.length} → diag/d-${tag}.json`);
await browser.close();