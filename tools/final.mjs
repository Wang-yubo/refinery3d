import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { decodePNG, stats, ascii } from './png.mjs';

const shots = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 400000,
  args: ['--no-sandbox','--disable-gpu-sandbox','--hide-scrollbars','--user-data-dir=/tmp/dsh-chrome-shoot','--enable-unsafe-swiftshader','--use-angle=metal'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await page.goto('http://127.0.0.1:4321/?clean=1&shot=aerial', { waitUntil: 'domcontentloaded', timeout: 300000 });
await page.waitForFunction('window.__ready === true && window.__fullReady === true', { timeout: 300000, polling: 300 });
fs.mkdirSync('renders', { recursive: true });
for (const name of (shots.length ? shots : ['aerial','hero','cdu','tanks','fcc','night','flow','day','top'])) {
  await page.evaluate((n) => window.__setShot(n), name);
  await new Promise(r => setTimeout(r, 800));
  const path = `renders/${name}.png`;
  await page.screenshot({ path });
  const img = decodePNG(path);
  const s = stats(img);
  console.log(`\n=== ${name} mean=${s.mean} dark=${s.darkPct}% clip=${s.clipPct}%`);
  console.log(ascii(img, 96, 26));
  if (name === 'flow') console.log('labels', JSON.stringify(await page.evaluate(() => window.__labelProbe())));
  if (['aerial','hero','cdu','fcc'].includes(name)) console.log('probe', JSON.stringify(await page.evaluate(() => window.__probe())));
}
console.log('\n--- logs ---\n' + logs.slice(0, 10).join('\n'));
await browser.close();
