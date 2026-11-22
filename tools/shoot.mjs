import puppeteer from 'puppeteer-core';
import { CHROME, GL_ARGS } from './chrome.mjs';
import fs from 'node:fs';

const shots = process.argv.slice(2);
const list = shots.length ? shots : ['aerial'];
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  protocolTimeout: 240000,
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--hide-scrollbars', '--user-data-dir=/tmp/dsh-chrome-shoot',
         ...GL_ARGS, '--force-device-scale-factor=1'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));
page.on('requestfailed', (req) => logs.push(`[reqfail] ${req.url()} ${req.failure()?.errorText}`));

const t0 = Date.now();
await page.goto('http://127.0.0.1:4321/?clean=1&shot=aerial', { waitUntil: 'domcontentloaded', timeout: 120000 });
try {
  await page.waitForFunction('window.__ready === true', { timeout: 180000, polling: 250 });
} catch (e) {
  console.log('READY TIMEOUT'); console.log(logs.join('\n')); await browser.close(); process.exit(1);
}
console.log('ready in', ((Date.now() - t0) / 1000).toFixed(1), 's');
fs.mkdirSync('renders', { recursive: true });
for (const shot of list) {
  const ts = Date.now();
  await page.evaluate((s) => window.__setShot(s), shot);
  await new Promise((r) => setTimeout(r, 900));
  const info = await page.evaluate(() => ({ shot: window.__shots, gl: !!document.querySelector('canvas') }));
  await page.screenshot({ path: `renders/${shot}.png` });
  console.log('shot', shot, ((Date.now() - ts) / 1000).toFixed(1), 's');
}
console.log('--- console ---');
console.log(logs.slice(0, 40).join('\n'));
await browser.close();
