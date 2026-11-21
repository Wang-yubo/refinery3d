import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { decodePNG, stats, ascii } from './png.mjs';

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
await page.waitForFunction('window.__ready === true', { timeout: 300000, polling: 300 });
fs.mkdirSync('diag', { recursive: true });

async function shot(name, prep) {
  if (prep) await page.evaluate(prep);
  await new Promise(r => setTimeout(r, 700));
  const path = `diag/${name}.png`;
  await page.screenshot({ path });
  const img = decodePNG(path);
  const s = stats(img);
  console.log(`\n=== ${name} mean=${s.mean} dark=${s.darkPct}% clip=${s.clipPct}%`);
  console.log(ascii(img, 104, 30));
  return img;
}

const shots = ['aerial','hero','cdu','fcc','tanks','night'];
for (const name of shots) {
  await page.evaluate((n) => window.__setShot(n), name);
  await shot('c-' + name);
  console.log('probe', name, JSON.stringify(await page.evaluate(() => window.__probe())));
}
await page.evaluate(() => window.__clay());
await page.evaluate(() => window.__setShot('aerial'));
await shot('clay-aerial');
await page.evaluate(() => window.__setShot('cdu'));
await shot('clay-cdu');
console.log('\n--- logs ---\n' + logs.slice(0, 12).join('\n'));
await browser.close();
