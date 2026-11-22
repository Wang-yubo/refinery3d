// 生成 PWA 图标（canvas 程序化绘制 → PNG，无外部依赖）
//   node tools/gen-icons.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { CHROME, GL_ARGS } from './chrome.mjs';

fs.mkdirSync('icons', { recursive: true });
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-gpu-sandbox', `--user-data-dir=/tmp/icon-${Date.now()}`, ...GL_ARGS],
});
const page = await browser.newPage();
async function draw(size) {
  const dataUrl = await page.evaluate((s) => {
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    // 深色背景 + 圆角
    const r = s * 0.18;
    g.fillStyle = '#0b141c';
    g.beginPath();
    g.moveTo(r, 0); g.lineTo(s - r, 0); g.quadraticCurveTo(s, 0, s, r);
    g.lineTo(s, s - r); g.quadraticCurveTo(s, s, s - r, s); g.lineTo(r, s);
    g.quadraticCurveTo(0, s, 0, s - r); g.lineTo(0, r); g.quadraticCurveTo(0, 0, r, 0);
    g.fill();
    // 远景管线剪影
    g.fillStyle = 'rgba(95,208,255,0.10)';
    for (let i = 0; i < 5; i++) g.fillRect(s * (0.12 + i * 0.17), s * (0.62 - i * 0.03), s * 0.06, s * 0.3);
    // 塔器
    const towers = [[0.30, 0.30, 0.10, 0.52], [0.44, 0.20, 0.12, 0.62], [0.58, 0.38, 0.09, 0.44]];
    for (const [x, y, w, h] of towers) {
      g.fillStyle = '#7fb8d4';
      g.fillRect(s * x, s * y, s * w, s * h);
      g.fillStyle = 'rgba(255,210,122,0.85)';
      g.fillRect(s * (x + w * 0.15), s * (y + h * 0.12), s * w * 0.7, s * 0.012);
      g.fillRect(s * (x + w * 0.15), s * (y + h * 0.45), s * w * 0.7, s * 0.012);
    }
    // 底部燃焰光
    const grd = g.createLinearGradient(0, s * 0.78, 0, s);
    grd.addColorStop(0, 'rgba(255,140,60,0)');
    grd.addColorStop(1, 'rgba(255,140,60,0.55)');
    g.fillStyle = grd;
    g.fillRect(0, s * 0.78, s, s * 0.22);
    // 圆环
    g.strokeStyle = 'rgba(95,208,255,0.9)';
    g.lineWidth = Math.max(2, s * 0.012);
    g.beginPath();
    g.arc(s * 0.5, s * 0.5, s * 0.40, -Math.PI * 0.35, Math.PI * 1.05);
    g.stroke();
    return c.toDataURL('image/png');
  }, size);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}
for (const s of [192, 512]) {
  const buf = await draw(s);
  fs.writeFileSync(`icons/icon-${s}.png`, buf);
  console.log(`icons/icon-${s}.png ${(buf.length / 1024).toFixed(1)}KB`);
}
await browser.close();
