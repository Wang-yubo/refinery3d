// UI 布局修复的前后对比截图（3 视口 × 3 状态）
//   node tools/fix-shots.mjs --tag=after|before
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { CHROME, GL_ARGS } from './chrome.mjs';

const TAG = (process.argv.find((a) => a.startsWith('--tag=')) || '--tag=after').split('=')[1];
const BASE = 'http://127.0.0.1:4321/';
const VIEWPORTS = [[1920, 1080], [1440, 900], [1280, 720]];
const STATES = [
  { id: 'default', name: '默认态', apply: () => {} },
  {
    id: 'explorer', name: '清单展开',
    apply: () => {
      const ex = document.getElementById('explorer');
      ex?.classList.remove('closed');
    },
  },
  {
    id: 'all', name: '参数+清单+设备卡',
    apply: () => {
      document.getElementById('process-panel')?.classList.add('open');
      document.getElementById('explorer')?.classList.remove('closed');
      window.__selectEquip?.('cdu-atm');
    },
  },
];

fs.mkdirSync('renders/fix', { recursive: true });
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', timeout: 400000, protocolTimeout: 600000,
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--hide-scrollbars', `--user-data-dir=/tmp/fixshot-${Date.now()}`, ...GL_ARGS],
});
const page = await browser.newPage();
for (const [w, h] of VIEWPORTS) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.goto(BASE + '?shot=hero&q=high', { waitUntil: 'domcontentloaded', timeout: 400000 });
  await page.waitForFunction('window.__ready === true', { timeout: 400000, polling: 150 });
  await page.waitForFunction('window.__fullReady === true', { timeout: 400000, polling: 200 });
  await new Promise((r) => setTimeout(r, 1600));
  for (const st of STATES) {
    await page.evaluate(() => {
      document.body.classList.remove('anim', 'flow');
      window.__setXray?.(false);
      window.__selectEquip && document.getElementById('equip-close')?.click();
      window.__applyResponsiveUi?.();
    });
    await new Promise((r) => setTimeout(r, 350));
    await page.evaluate(st.apply);
    await new Promise((r) => setTimeout(r, 700));
    const file = `renders/fix/${TAG}-${w}x${h}-${st.id}.png`;
    await page.screenshot({ path: file });
    console.log(TAG, `${w}x${h}`, st.id, '→', file);
  }
}
await browser.close();
