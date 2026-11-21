// 构建期导出：运行一次实时建模 + bakeStatic，把合并几何写成 assets/baked.bin/json
// 用法：node tools/build-baked.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('assets');
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 600000,
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--hide-scrollbars',
    `--user-data-dir=/tmp/dsh-chrome-baked-${Date.now()}`, '--enable-unsafe-swiftshader', '--use-angle=metal'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
page.on('console', (m) => {
  const t = m.text();
  if (t.includes('[timing]') || m.type() === 'error') console.log(t);
});
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
const t0 = Date.now();
await page.goto('http://127.0.0.1:4321/?procedural=1&clean=1&shot=aerial&q=low', {
  waitUntil: 'domcontentloaded', timeout: 400000,
});
await page.waitForFunction('window.__ready === true', { timeout: 400000, polling: 300 });
console.log(`scene ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const meta = await page.evaluate(() => window.__buildSnapshot());
const binPath = path.join(OUT, 'baked.bin');
const jsonPath = path.join(OUT, 'baked.json');
fs.writeFileSync(jsonPath, JSON.stringify(meta));
// 同步生成内联元数据，运行时无需再请求 baked.json
fs.writeFileSync(path.resolve('src/bakedMeta.js'), `// 由 tools/build-baked.mjs 自动生成：避免冷启动时再请求 10KB 元数据\nexport const BAKED_META = ${JSON.stringify(meta)};\n`);
const chunkSize = 4 * 1024 * 1024;
const chunks = Math.ceil(meta.bytes / chunkSize);
const fd = fs.openSync(binPath, 'w');
let written = 0;
for (let i = 0; i < chunks; i++) {
  const b64 = await page.evaluate(({ i, chunkSize }) => window.__snapshotChunk(i, chunkSize), { i, chunkSize });
  const buf = Buffer.from(b64, 'base64');
  fs.writeSync(fd, buf);
  written += buf.length;
  process.stdout.write(`\rchunk ${i + 1}/${chunks} ${(written / 1048576).toFixed(1)}MB`);
}
fs.closeSync(fd);
if (written !== meta.bytes) throw new Error(`written ${written} != meta ${meta.bytes}`);
console.log(`\nbaked ${meta.items.length} meshes, ${(meta.bytes / 1048576).toFixed(1)}MB in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await browser.close();
