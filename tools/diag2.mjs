import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { decodePNG, stats, ascii } from './png.mjs';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000,
  args: ['--no-sandbox','--disable-gpu-sandbox','--hide-scrollbars','--user-data-dir=/tmp/dsh-chrome-shoot','--enable-unsafe-swiftshader','--use-angle=metal'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await page.goto('http://127.0.0.1:4321/?clean=1&shot=aerial', { waitUntil: 'domcontentloaded', timeout: 240000 });
await page.waitForFunction('window.__ready === true', { timeout: 240000, polling: 300 });
fs.mkdirSync('/Users/wangyubo/Documents/project/refinery3d/diag', { recursive: true });
async function shot(name, prep) {
  if (prep) await page.evaluate(prep);
  await new Promise(r => setTimeout(r, 600));
  const path = `/Users/wangyubo/Documents/project/refinery3d/diag/${name}.png`;
  await page.screenshot({ path });
  const img = decodePNG(path);
  console.log(`\n=== ${name} ${JSON.stringify(stats(img))}`);
  console.log(ascii(img, 110, 34));
}
await page.evaluate(() => window.__setShot('aerial'));
await shot('aerial-fixed');
await page.evaluate(() => window.__setShot('cdu'));
await shot('cdu-color');
await page.evaluate(() => window.__clay());
await page.evaluate(() => window.__setShot('aerial'));
await shot('aerial-clay');
await page.evaluate(() => window.__setShot('cdu'));
await shot('cdu-clay');
console.log('\n--- logs ---\n' + logs.slice(0, 20).join('\n'));
await browser.close();
