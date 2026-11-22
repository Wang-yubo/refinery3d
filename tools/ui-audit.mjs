// UI 布局审计：7 视口 × 9 状态，收集可见浮层块、两两重叠、越界、控件最小边长
//   node tools/ui-audit.mjs [--tag=before] [--only=default] [--json=diag/ui-audit.json]
// 输出：diag/ui-audit[-tag].json + 文本摘要；非设计性重叠 >4px² 记为失败
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { CHROME, GL_ARGS } from './chrome.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => (argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=')[1];
const TAG = arg('tag', '');
const ONLY = arg('only', '');
const OUT = arg('json', TAG ? `diag/ui-audit-${TAG}.json` : 'diag/ui-audit.json');
const BASE = 'http://127.0.0.1:4321/';

const VIEWPORTS = [
  [1920, 1080], [1440, 900], [1280, 720], [1024, 768], [900, 700], [820, 1180], [390, 844],
];

/* 状态矩阵：url 参数 + 进入后执行的脚本（均为页面内已有的公开行为） */
const STATES = [
  { id: 'default', name: '默认展示', url: '?shot=hero', apply: () => {} },
  {
    id: 'explorer', name: '设备清单展开', url: '?shot=hero',
    apply: () => {
      const ex = document.getElementById('explorer');
      ex?.classList.remove('closed');
      document.body.classList.remove('anim', 'flow');
    },
  },
  {
    id: 'animui', name: '流程动画 HUD', url: '?shot=hero',
    apply: () => { document.body.classList.add('anim'); },
  },
  {
    id: 'flow', name: '流程示意 body.flow', url: '?shot=hero',
    apply: () => { document.body.classList.remove('anim'); document.body.classList.add('flow'); },
  },
  {
    id: 'params', name: '参数面板', url: '?shot=hero',
    apply: () => { document.body.classList.remove('anim', 'flow'); document.getElementById('process-panel')?.classList.add('open'); },
  },
  {
    id: 'xray', name: 'X-Ray 开', url: '?shot=hero',
    apply: () => { document.body.classList.remove('anim', 'flow'); window.__setXray?.(true); },
  },
  {
    id: 'equip', name: '选中设备（卡片）', url: '?shot=hero',
    apply: () => { document.body.classList.remove('anim', 'flow'); window.__selectEquip?.('cdu-atm'); },
  },
  {
    id: 'tour', name: '导览进行中', url: '?shot=hero',
    apply: () => { document.body.classList.remove('anim', 'flow'); window.__tourStart?.(0); },
  },
  {
    id: 'share', name: '分享弹层', url: '?shot=hero',
    apply: () => {
      document.body.classList.remove('anim', 'flow');
      document.getElementById('share-btn')?.click();
    },
  },
];

/* 设计上就覆盖全屏 / 瞬时的层：单列，不计失败 */
const OVERLAY_IDS = ['share-toast', 'sw-toast', 'picktip', 'loading', 'perf', 'qr-modal', 'share-modal'];

const collect = () => {
  const OVERLAY_IDS = ['share-toast', 'sw-toast', 'picktip', 'loading', 'perf', 'qr-modal'];
  const EXCLUDE_SELF = /^(ui|flowui|animui|tourui|left-rail|right-rail|qr-modal|e1-evidence)$/;
  const EXCLUDE_CLOSE = '#loading, #sw-toast, #share-toast, #picktip, #perf, #e1-evidence';
  const vis = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return null;
    if (r.right < 1 || r.bottom < 1 || r.left > innerWidth - 1 || r.top > innerHeight - 1) return null;
    return r;
  };
  const cands = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
    if (EXCLUDE_SELF.test(el.id || '')) continue;
    if (el.closest(EXCLUDE_CLOSE)) continue;
    if (el.closest('#qr-modal') && el.id !== 'qr-canvas' && !el.classList.contains('qr-card')) continue;
    const r = vis(el);
    if (!r) continue;
    cands.push({
      el, r,
      id: el.id || null,
      cls: (el.className && typeof el.className === 'string' ? el.className : '').split(/\s+/).filter(Boolean).slice(0, 2).join('.'),
      tag: el.tagName.toLowerCase(),
      area: r.width * r.height,
    });
  }
  /* 剔除被其他候选包含的后代（卡片里的小按钮 / 角标不算独立块） */
  const blocks = cands.filter((c) => !cands.some((o) => o !== c && o.r.left <= c.r.left + 1 && o.r.top <= c.r.top + 1 &&
    o.r.right >= c.r.right - 1 && o.r.bottom >= c.r.bottom - 1 && o.area > c.area));
  const rect = (r) => [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)];
  const overlaps = [];
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i].r, b = blocks[j].r;
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 0 && h > 0 && w * h > 4) {
        overlaps.push({
          a: blocks[i].id || blocks[i].el.className, b: blocks[j].id || blocks[j].el.className,
          area: Math.round(w * h), w: Math.round(w), h: Math.round(h),
        });
      }
    }
  }
  const overflow = blocks
    .filter((b) => b.r.left < -1 || b.r.top < -1 || b.r.right > innerWidth + 1 || b.r.bottom > innerHeight + 1)
    .map((b) => ({ id: b.id || b.cls, rect: rect(b.r) }));
  /* 可点控件最小边长（按钮级） */
  const targets = [];
  for (const el of document.querySelectorAll('button, [role=button], .xp-row, #xp-toggle, #equip-close')) {
    if (!vis(el)) continue;
    if (el.closest('#qr-modal, #share-toast, #sw-toast')) continue;
    const r = el.getBoundingClientRect();
    targets.push({ id: el.id || el.className || el.tagName, w: Math.round(r.width), h: Math.round(r.height), min: Math.round(Math.min(r.width, r.height)) });
  }
  const minButton = targets.length ? Math.min(...targets.map((t) => t.min)) : null;
  const smallButtons = targets.filter((t) => t.min < (innerWidth <= 900 ? 44 : 36)).map((t) => `${t.id} ${t.w}x${t.h}`);
  return {
    blocks: blocks.map((b) => ({ id: b.id || b.cls || b.tag, rect: rect(b.r), area: Math.round(b.area) })),
    overlaps, overflow, minButton, smallButtons,
    overlays: OVERLAY_IDS.filter((id) => { const el = document.getElementById(id); return el && getComputedStyle(el).display !== 'none'; }),
    vw: innerWidth, vh: innerHeight,
  };
};

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', timeout: 400000, protocolTimeout: 600000,
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--hide-scrollbars', `--user-data-dir=/tmp/uiaudit-${Date.now()}`, ...GL_ARGS],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const report = { generatedAt: new Date().toISOString(), tag: TAG || null, viewports: [], failures: 0, states: STATES.map((s) => s.id) };

const RESET = () => {
  document.body.classList.remove('anim', 'flow', 'tour');
  window.__setXray?.(false);
  window.__tourStop?.();
  document.getElementById('equip-close')?.click();
  document.getElementById('qr-modal')?.classList.remove('show');
  window.__applyResponsiveUi?.();
  document.getElementById('process-panel')?.classList.remove('open');
};

for (const [w, h] of VIEWPORTS) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.goto(BASE + '?shot=hero', { waitUntil: 'domcontentloaded', timeout: 400000 });
  await page.waitForFunction('window.__ready === true', { timeout: 400000, polling: 150 });
  await new Promise((r) => setTimeout(r, 1200));
  for (const st of STATES) {
    if (ONLY && !ONLY.split(',').includes(st.id)) continue;
    await page.evaluate(RESET);
    await new Promise((r) => setTimeout(r, 250));
    await page.evaluate(st.apply);
    await new Promise((r) => setTimeout(r, 550));
    const res = await page.evaluate(collect);
    const entry = { viewport: `${w}x${h}`, state: st.id, ...res };
    entry.pass = entry.overlaps.length === 0 && entry.overflow.length === 0 && entry.smallButtons.length === 0;
    if (!entry.pass) report.failures++;
    report.viewports.push(entry);
    const flag = entry.pass ? '✔' : '✘';
    console.log(`${flag} ${w}x${h} ${st.id}: 块 ${res.blocks.length} · 重叠 ${res.overlaps.length} · 越界 ${res.overflow.length} · 最小控件 ${res.minButton}${res.smallButtons.length ? ' · 过小 ' + res.smallButtons.join(', ') : ''}`);
    for (const o of res.overlaps) console.log(`    ↳ ${o.a} × ${o.b} = ${o.area}px² (${o.w}×${o.h})`);
    for (const o of res.overflow) console.log(`    ↳ 越界 ${o.id} ${o.rect.join(',')}`);
  }
}

report.errors = errors.slice(0, 6);
report.summary = {
  pairs: report.viewports.reduce((a, v) => a + v.overlaps.length, 0),
  maxOverlap: Math.max(0, ...report.viewports.flatMap((v) => v.overlaps.map((o) => o.area))),
  overflow: report.viewports.reduce((a, v) => a + v.overflow.length, 0),
  minButton: Math.min(...report.viewports.map((v) => v.minButton ?? 999)),
  combos: report.viewports.length,
  failed: report.failures,
};
fs.mkdirSync('diag', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`\n${report.failures === 0 ? 'UI AUDIT PASS' : 'UI AUDIT FAIL'} · ${report.summary.combos} 组合 · 重叠 ${report.summary.pairs} 对 · 最大 ${report.summary.maxOverlap}px² · 越界 ${report.summary.overflow} · 最小控件 ${report.summary.minButton}px → ${OUT}`);
await browser.close();
process.exit(report.failures === 0 ? 0 : 1);