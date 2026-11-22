// E 批验收：E1 冷/热/离线启动、E2 4K 导出与录屏、E3 参数面板、E4 透视像素差、E5 二维码
//   node tools/verify-e.mjs [--only=e1,e2]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { CHROME, GL_ARGS } from './chrome.mjs';
import { decodePNG, stats } from './png.mjs';

const argv = process.argv.slice(2);
const only = (argv.find((a) => a.startsWith('--only=')) || '').replace('--only=', '').split(',').filter(Boolean);
const want = (id) => !only.length || only.includes(id);
const BASE = 'http://127.0.0.1:4321/';
fs.mkdirSync('diag', { recursive: true });
fs.mkdirSync('renders/e', { recursive: true });
const out = {};
const log = (...a) => console.log(...a);

const launch = (profile = `e-${Date.now()}`) => puppeteer.launch({
  executablePath: CHROME, headless: 'new', protocolTimeout: 600000,
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--hide-scrollbars', `--user-data-dir=/tmp/dsh-${profile}`, ...GL_ARGS],
});

const readyTiming = (page) => page.evaluate(() => ({
  ready: window.__readyAt ?? null,
  full: window.__fullReadyAt ?? null,
  cache: window.__cacheState ? { ...window.__cacheState } : null,
  sw: window.__swState ?? null,
}));

/* ---------------- E1：冷 / 热 / 离线 ---------------- */
if (want('e1')) {
  const profile = `e1-${Date.now()}`;
  // 第一次（冷）：清 SW / IDB / cache
  let browser = await launch(profile);
  let page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto(BASE + '?q=low&shot=hero', { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.evaluate(async () => {
    const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
    await Promise.all(regs.map((r) => r.unregister()));
    const dbs = await indexedDB.databases?.() || [];
    await Promise.all(dbs.map((d) => new Promise((res) => { const r = indexedDB.deleteDatabase(d.name); r.onsuccess = r.onerror = r.onblocked = res; })));
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction('window.__fullReady === true', { timeout: 600000, polling: 200 });
  const cold = await readyTiming(page);
  log('E1 cold', JSON.stringify(cold));
  await new Promise((r) => setTimeout(r, 2500)); // 等 SW 安装 + 首次缓存写入
  // 第二次（热）：同一 profile，新页面
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  await page2.goto(BASE + '?q=low&shot=hero', { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page2.waitForFunction('window.__fullReady === true', { timeout: 600000, polling: 200 });
  const warm = await readyTiming(page2);
  log('E1 warm', JSON.stringify(warm));
  // 离线：断网后重载
  await page2.setOfflineMode(true);
  let offline = { ok: false };
  try {
    await page2.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
    await page2.waitForFunction('window.__fullReady === true', { timeout: 300000, polling: 200 });
    const t = await readyTiming(page2);
    offline = { ok: true, ...t };
  } catch (e) {
    offline = { ok: false, error: e.message };
  }
  log('E1 offline', JSON.stringify(offline));
  const speedup = cold.full && warm.full ? +(((cold.full - warm.full) / cold.full) * 100).toFixed(1) : null;
  out.e1 = { cold, warm, offline, speedupPct: speedup, errors: errs.slice(0, 5) };
  await browser.close();
}

/* ---------------- E2：4K 导出 + 录屏 ---------------- */
if (want('e2')) {
  const browser = await launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto(BASE + '?q=high&shot=hero&clean=1&autoexposure=0&motion=0&anim=1&stage=2&t=6&playing=0', { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction('window.__fullReady === true', { timeout: 600000, polling: 200 });
  await new Promise((r) => setTimeout(r, 1200));
  const before = await page.screenshot({ encoding: 'base64' });
  fs.writeFileSync('diag/e2-before.png', Buffer.from(before, 'base64'));
  const png = await page.evaluate(() => window.__exportPNG({ width: 3840, height: 2160 }));
  fs.writeFileSync('renders/e/e2-export-4k.png', Buffer.from(png.dataUrl.split(',')[1], 'base64'));
  const px = decodePNG('renders/e/e2-export-4k.png');
  await new Promise((r) => setTimeout(r, 800));
  const after = await page.screenshot({ encoding: 'base64' });
  fs.writeFileSync('diag/e2-after.png', Buffer.from(after, 'base64'));
  const a = decodePNG('diag/e2-before.png');
  const b = decodePNG('diag/e2-after.png');
  let sum = 0, mx = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])) / 3;
    sum += d; if (d > mx) mx = d;
  }
  const st = stats(px);
  out.e2 = {
    png: { w: px.width, h: px.height, mean: st.mean, clipPct: st.clipPct, bytes: Math.round(png.dataUrl.length * 0.75), ms: png.ms },
    restore: { mean: +(sum / (a.data.length / 4)).toFixed(4), max: +mx.toFixed(1) },
    errors: errs.slice(0, 5),
  };
  log('E2 png', JSON.stringify(out.e2.png), 'restore', JSON.stringify(out.e2.restore));
  // 录屏（3 s 代替 30 s，验证管线与时长/大小；正式 30 s 由按钮触发）
  const rec = await page.evaluate(async (sec) => {
    const r = await window.__recordTour({ seconds: sec, fps: 30 });
    return { ms: r.ms, bytes: r.bytes, mime: r.mime, duration: r.duration, fpsDrop: r.fpsDrop };
  }, 3);
  out.e2.record = rec;
  log('E2 record', JSON.stringify(rec));
  await browser.close();
}

/* ---------------- E4：透视像素差 + 截图 ---------------- */
if (want('e4')) {
  const browser = await launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto(BASE + '?q=high&shot=cdu&clean=1&autoexposure=0&motion=0&anim=1&stage=1&t=5&playing=0', { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction('window.__fullReady === true', { timeout: 600000, polling: 200 });
  await new Promise((r) => setTimeout(r, 1500));
  const off1 = await page.screenshot({ path: 'diag/e4-off1.png' });
  await page.evaluate(() => window.__setXray(true));
  await new Promise((r) => setTimeout(r, 900));
  const on = await page.screenshot({ path: 'renders/e/e4-xray.png' });
  const fpsOn = await page.evaluate(() => window.__bench(20).msPerFrame);
  await page.evaluate(() => window.__setXray(false));
  await new Promise((r) => setTimeout(r, 900));
  const off2 = await page.screenshot({ path: 'diag/e4-off2.png' });
  const fpsOff = await page.evaluate(() => window.__bench(20).msPerFrame);
  const d = (x, y) => {
    const A = decodePNG(x), B = decodePNG(y);
    let s = 0, mx = 0;
    for (let i = 0; i < A.data.length; i += 4) {
      const v = (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2])) / 3;
      s += v; if (v > mx) mx = v;
    }
    return { mean: +(s / (A.data.length / 4)).toFixed(3), max: +mx.toFixed(1) };
  };
  out.e4 = { offVsOff: d('diag/e4-off1.png', 'diag/e4-off2.png'), onVsOff: d('diag/e4-off1.png', 'renders/e/e4-xray.png'), fps: { on: fpsOn, off: fpsOff }, errors: errs.slice(0, 5) };
  log('E4', JSON.stringify(out.e4));
  await browser.close();
}

/* ---------------- E3：参数面板布局 + 数据 ---------------- */
if (want('e3')) {
  const browser = await launch();
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const layout = {};
  for (const vp of [[1920, 1080], [1280, 800]]) {
    await page.setViewport({ width: vp[0], height: vp[1], deviceScaleFactor: 1 });
    await page.goto(BASE + '?q=high&shot=hero&anim=1&stage=2&t=6&playing=0&autoexposure=0&motion=0', { waitUntil: 'domcontentloaded', timeout: 600000 });
    await page.waitForFunction('window.__fullReady === true', { timeout: 600000, polling: 200 });
    await new Promise((r) => setTimeout(r, 2500));
    layout[vp.join('x')] = await page.evaluate(() => {
      const r = (id) => { const el = document.getElementById(id); if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
      const overlap = (a, b) => a && b && !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
      const p = r('process-panel');
      const ap = document.querySelector('#animui .apanel');
      const rr = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
      const boxes = { apanel: rr(ap), explorer: r('explorer'), bar: r('bar'), panel: p };
      return {
        panel: p,
        overlaps: Object.entries(boxes).filter(([k, v]) => k !== 'panel' && overlap(p, v)).map(([k]) => k),
        rows: [...document.querySelectorAll('#process-panel .pp-row')].length,
        balanceSum: [...document.querySelectorAll('#process-panel .pb-val')].reduce((a, el) => a + parseFloat(el.textContent), 0),
        visible: !!p && p.w > 0,
      };
    });
    if (vp[0] === 1920) await page.screenshot({ path: 'renders/e/e3-params.png' });
  }
  out.e3 = { layout, errors: errs.slice(0, 5) };
  log('E3', JSON.stringify(out.e3));
  await browser.close();
}

/* ---------------- E5：二维码 ---------------- */
if (want('e5')) {
  const browser = await launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto(BASE + '?q=high&shot=hero&autoexposure=0&motion=0', { waitUntil: 'domcontentloaded', timeout: 600000 });
  await page.waitForFunction('window.__fullReady === true', { timeout: 600000, polling: 200 });
  await new Promise((r) => setTimeout(r, 1000));
  await page.click('#share-btn');
  await new Promise((r) => setTimeout(r, 700));
  const qr = await page.evaluate(() => ({ ...window.__qrState(), canvas: (() => { const c = document.getElementById('qr-canvas'); return { w: c.width, h: c.height }; })(), modalShown: document.getElementById('qr-modal').classList.contains('show'), urlText: document.getElementById('qr-url').textContent.slice(0, 40) }));
  await page.screenshot({ path: 'renders/e/e5-qr.png' });
  out.e5 = { qr, errors: errs.slice(0, 5) };
  log('E5', JSON.stringify(out.e5));
  await browser.close();
}

fs.writeFileSync('diag/e-verify.json', JSON.stringify(out, null, 2));
console.log('→ diag/e-verify.json');
