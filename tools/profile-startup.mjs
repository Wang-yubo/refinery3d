// 冷启动耗时分解（可复用）：node tools/profile-startup.mjs [options]
//
// 用法示例：
//   node tools/profile-startup.mjs                       # 默认 3 次冷启动（每次全新 profile）
//   node tools/profile-startup.mjs --runs 1 --profile    # 单次 + GL 编译钩子
//   node tools/profile-startup.mjs --runs 2 --query "?clean=1&shot=aerial&q=high"
//   node tools/profile-startup.mjs --warm 2              # 同一 profile 连续 2 次（第二次为 warm）
//   node tools/profile-startup.mjs --prep compileasync    # 首帧前 compileAsync
//
// 输出：控制台表格 + diag/profile-startup.json
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
};
const RUNS = Number(arg('runs', 3));
const WARM = Number(arg('warm', 0));            // >0：同一 profile 连续跑 N 次
const QUERY = String(arg('query', '?clean=1&shot=aerial&q=high'));
const PROFILE = !!arg('profile', false);
const PREP = arg('prep', null);
const WIDTH = Number(arg('width', 1920));
const HEIGHT = Number(arg('height', 1080));
const BASE = String(arg('base', 'http://127.0.0.1:4321/'));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = 'diag';
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const launch = (dir) => puppeteer.launch({
  executablePath: CHROME,
  headless: 'new', protocolTimeout: 500000,
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--hide-scrollbars',
    `--user-data-dir=${dir}`, '--enable-unsafe-swiftshader', '--use-angle=metal'],
});

function addFlag(q, flag) {
  return q.includes('?') ? `${q}&${flag}` : `${q}?${flag}`;
}
function withPrep(q) {
  let out = q;
  if (PROFILE) out = addFlag(out, 'profile=1');
  if (PREP) out = addFlag(out, `prep=${PREP}`);
  return out;
}

/** 单次加载：返回 wall 时间 + 页面内 marks */
async function measure(dir, query, label) {
  const browser = await launch(dir);
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
  const logs = [];
  const errors = [];
  page.on('console', (m) => {
    logs.push(m.text());
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const url = BASE.replace(/\/$/, '/') + withPrep(query);
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 400000 });
  await page.waitForFunction('window.__ready === true', { timeout: 400000, polling: 200 });
  const wall = +((Date.now() - t0) / 1000).toFixed(2);
  /* 页面内时间戳（不受 full 升级阻塞的影响） */
  const tAfter = Date.now();
  const gotoEpoch = t0;
  const info = await page.evaluate((gotoEpoch) => ({
    timing: window.__timing(),
    render: window.__renderInfo(),
    prebaked: window.__prebaked,
    nav: (() => {
      const n = performance.getEntriesByType('navigation')[0];
      return n ? { domContentLoaded: +n.domContentLoadedEventEnd.toFixed(1), requestStart: +n.requestStart.toFixed(1) } : null;
    })(),
    now: +performance.now().toFixed(1),
    readyAt: window.__readyAt || null,
    fullReadyAt: window.__fullReadyAt || null,
    timeOrigin: performance.timeOrigin,
    wallReady: +(((performance.timeOrigin + (window.__readyAt || performance.now())) - gotoEpoch) / 1000).toFixed(2),
    wallFull: +(((performance.timeOrigin + (window.__fullReadyAt || performance.now())) - gotoEpoch) / 1000).toFixed(2),
    snap: window.__snapProfile || null,
  }), gotoEpoch);
  await browser.close();
  return { label, wall, url, ...info, logs, errors };
}

function fmt(ms) {
  return typeof ms === 'number' ? (ms / 1000).toFixed(2) + 's' : '—';
}

function printRun(r) {
  console.log(`\n=== ${r.label}  wall(goto→ready)=${r.wallReady}s  wall(goto→full)=${r.wallFull}s  [poll wall=${r.wall}s]`);
  const marks = r.timing.marks || [];
  for (const m of marks) {
    const extra = m.extra ? ' ' + JSON.stringify(m.extra) : '';
    console.log(`  ${String(m.name).padEnd(20)} t=${(m.t / 1000).toFixed(2)}s  dt=${String(m.dt).padStart(8)}ms${extra}`);
  }
  const rd = r.render;
  console.log(`  programs=${rd.programs} byType=${JSON.stringify(rd.programsByType)} parallelCompile=${rd.parallelCompile} gpu="${rd.gpu}"`);
  console.log(`  calls=${rd.render.calls} tris=${rd.render.triangles} geoms=${rd.memory.geometries} textures=${rd.memory.textures}`);
  console.log(`  material groups (${rd.groups.length}):`);
  for (const g of rd.groups) console.log(`    ${String(g.meshes).padStart(5)} meshes  ${g.materials.length} mats  ${g.key}`);
  if (r.timing.gl) console.log(`  GL: programs linked=${r.timing.gl.linkCount} in ${r.timing.gl.linkTotalMs}ms; shaders compiled=${r.timing.gl.compileCount} in ${r.timing.gl.compileTotalMs}ms`);
  if (r.timing.programs) {
    const rows = r.timing.programs.filter((p) => p.ms != null).sort((a, b) => b.ms - a.ms);
    console.log('  per-program link ms:');
    for (const p of rows) console.log(`    ${String(p.ms).padStart(8)}ms  ${p.name}  used=${p.usedTimes}`);
    console.log(`    total ${rows.reduce((a, p) => a + p.ms, 0).toFixed(0)}ms over ${rows.length} programs`);
  }
  if (r.snap) {
    const it = r.snap.items.slice().sort((a, b) => b.ms - a.ms).slice(0, 8);
    console.log(`  snapshot rebuild total=${r.snap.totalMs}ms; progressMs=${r.snap.progressMs} slowest: ` +
      it.map((x) => `${x.mat}/${x.verts}v=${x.ms}ms`).join(' '));
  }
  if (r.errors.length) console.log('  ERRORS: ' + r.errors.slice(0, 5).join(' | '));
}

const results = [];
if (WARM > 0) {
  const dir = `/tmp/dsh-prof-warm-${Date.now()}`;
  for (let i = 0; i <= WARM; i++) {
    const r = await measure(dir, QUERY, `${i === 0 ? 'run1 (cold)' : `run${i + 1} (warm)`}`);
    printRun(r);
    results.push(r);
  }
} else {
  for (let i = 0; i < RUNS; i++) {
    const r = await measure(`/tmp/dsh-prof-cold-${Date.now()}-${i}`, QUERY, `cold ${i + 1}/${RUNS}`);
    printRun(r);
    results.push(r);
  }
}

const cold = results.filter((r) => !/warm/.test(r.label));
if (cold.length) {
  const walls = cold.map((r) => r.wallReady).sort((a, b) => a - b);
  const median = walls[Math.floor(walls.length / 2)];
  console.log(`\n### wall to __ready: n=${walls.length} values=[${walls.join(', ')}] median=${median}s`);
  const phase = {};
  for (const r of cold) for (const m of r.timing.marks) phase[m.name] = phase[m.name] || m.dt;
  console.log('### median-ish phase dts: ' + Object.entries(phase).map(([k, v]) => `${k}=${v}ms`).join('  '));
}
if (results.some((r) => /warm/.test(r.label))) {
  console.log('### warm runs: ' + results.filter((r) => /warm/.test(r.label)).map((r) => `${r.label}=ready ${r.wallReady}s/full ${r.wallFull}s`).join('  '));
}

fs.writeFileSync(path.join(OUT, 'profile-startup.json'), JSON.stringify({
  generated: new Date().toISOString(), query: QUERY, prep: PREP, width: WIDTH, height: HEIGHT,
  runs: results.map((r) => ({
    label: r.label, wall: r.wall, wallReady: r.wallReady, wallFull: r.wallFull, marks: r.timing.marks, gl: r.timing.gl,
    programs: r.render.programs, programsByType: r.render.programsByType,
    groups: r.render.groups, render: r.render.render, memory: r.render.memory,
    gpu: r.render.gpu, parallelCompile: r.render.parallelCompile,
    programList: r.render.programList, timingPrograms: r.timing.programs, errors: r.errors,
  })),
}, null, 2));
console.log(`\nsaved ${OUT}/profile-startup.json`);