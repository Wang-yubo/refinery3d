import puppeteer from 'puppeteer-core';
import { CHROME, GL_ARGS } from './chrome.mjs';
import { decodePNG, stats } from './png.mjs';
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new', protocolTimeout: 400000,
  args: ['--no-sandbox','--disable-gpu-sandbox','--hide-scrollbars',`--user-data-dir=/tmp/dsh-chrome-equip-${Date.now()}`,...GL_ARGS],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push('console: ' + m.text()); });
const t0 = Date.now();
await page.goto('http://127.0.0.1:4321/?shot=hero', { waitUntil: 'domcontentloaded', timeout: 400000 });
await page.waitForFunction('window.__ready === true && window.__fullReady === true && window.__equipReady === true', { timeout: 400000, polling: 400 });
console.log('ready', ((Date.now()-t0)/1000).toFixed(1)+'s');
console.log('equip count', await page.evaluate(() => window.__equipList ? window.__equipList().length : -1));
await page.evaluate(() => window.__focusEquip('cdu-atm', true));
await new Promise(r => setTimeout(r, 900));
console.log('state', JSON.stringify(await page.evaluate(() => window.__equipState())));
await page.screenshot({ path: 'renders/equip.png' });
console.log('shot', JSON.stringify(stats(decodePNG('renders/equip.png'))));
console.log('errors', errors.length ? errors.slice(0,4) : 'none');
await browser.close();
