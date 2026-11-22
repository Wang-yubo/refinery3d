import puppeteer from 'puppeteer-core';
import { CHROME, GL_ARGS } from './chrome.mjs';
import fs from 'node:fs';
import { decodePNG, stats, ascii, colorMap } from './png.mjs';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new', protocolTimeout: 300000,
  args: ['--no-sandbox','--disable-gpu-sandbox','--hide-scrollbars','--user-data-dir=/tmp/dsh-chrome-shoot',...GL_ARGS],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
const t0 = Date.now();
await page.goto('http://127.0.0.1:4321/?clean=1&shot=aerial', { waitUntil: 'domcontentloaded', timeout: 240000 });
await page.waitForFunction('window.__ready === true', { timeout: 240000, polling: 300 });
console.log('ready', ((Date.now()-t0)/1000).toFixed(1), 's');
fs.mkdirSync('diag', { recursive: true });
const variants = JSON.parse(process.argv[2] || '[["base",{}],["nofog",{"fog":false}],["nosky",{"fog":false,"sky":false}],["nopost",{"bloom":false,"grade":false,"fog":false}]]');
for (const [name, opt] of variants) {
  await page.evaluate((o) => window.__debug(o), opt);
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: `diag/${name}.png` });
  const img = decodePNG(`diag/${name}.png`);
  console.log(`\n=== ${name} ${JSON.stringify(stats(img))}`);
  console.log(ascii(img, 84, 30));
  if (name === 'nosky') console.log(colorMap(img, 84, 30));
}
console.log('\nprobe', JSON.stringify(await page.evaluate(() => window.__probe())));
console.log('\n--- logs ---\n' + logs.slice(0, 30).join('\n'));
await browser.close();
