import * as THREE from 'three';

/* ---------- helpers ---------- */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvas(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return { c, ctx: c.getContext('2d') };
}

function finish(c, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function noiseDots(ctx, w, h, rand, count, colors, alpha = 0.12) {
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = alpha * (0.4 + rand());
    ctx.fillStyle = colors[(rand() * colors.length) | 0];
    const s = 0.5 + rand() * 2.2;
    ctx.fillRect(rand() * w, rand() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

function streaks(ctx, w, h, rand, count, color, alpha = 0.1, maxW = 6) {
  for (let i = 0; i < count; i++) {
    const x = rand() * w;
    const top = rand() * h * 0.4;
    const len = h * (0.15 + rand() * 0.6);
    const g = ctx.createLinearGradient(0, top, 0, top + len);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.25, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha * (0.3 + rand());
    ctx.fillStyle = g;
    ctx.fillRect(x, top, 1 + rand() * maxW, len);
  }
  ctx.globalAlpha = 1;
}

/* ---------- surfaces ---------- */
export function concreteTexture(seed = 7) {
  const { c, ctx } = canvas(512);
  const r = rng(seed);
  ctx.fillStyle = '#9c9a92';
  ctx.fillRect(0, 0, 512, 512);
  noiseDots(ctx, 512, 512, r, 9000, ['#7d7b74', '#b6b4ab', '#8a887f'], 0.18);
  for (let i = 0; i < 90; i++) {
    ctx.strokeStyle = `rgba(70,68,62,${0.03 + r() * 0.05})`;
    ctx.lineWidth = 0.6 + r() * 1.4;
    ctx.beginPath();
    const x = r() * 512, y = r() * 512;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (r() - 0.5) * 120, y + (r() - 0.5) * 120);
    ctx.stroke();
  }
  streaks(ctx, 512, 512, r, 26, 'rgba(80,76,68,0.5)', 0.08, 10);
  ctx.strokeStyle = 'rgba(80,78,72,0.35)';
  ctx.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo((512 / 4) * i, 0); ctx.lineTo((512 / 4) * i, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, (512 / 4) * i); ctx.lineTo(512, (512 / 4) * i); ctx.stroke();
  }
  return finish(c);
}

export function asphaltTexture(seed = 3) {
  const { c, ctx } = canvas(512);
  const r = rng(seed);
  ctx.fillStyle = '#3b3b3d';
  ctx.fillRect(0, 0, 512, 512);
  noiseDots(ctx, 512, 512, r, 14000, ['#2c2c2e', '#565658', '#464648', '#26262a'], 0.35);
  streaks(ctx, 512, 512, r, 20, 'rgba(20,20,22,0.7)', 0.12, 14);
  return finish(c);
}

export function grassTexture(seed = 11) {
  const { c, ctx } = canvas(512);
  const r = rng(seed);
  ctx.fillStyle = '#4c5740';
  ctx.fillRect(0, 0, 512, 512);
  noiseDots(ctx, 512, 512, r, 12000, ['#3e4a34', '#5d6a4b', '#6b7553', '#434c37'], 0.4);
  for (let i = 0; i < 26; i++) {
    const g = ctx.createRadialGradient(r() * 512, r() * 512, 2, r() * 512, r() * 512, 40 + r() * 90);
    g.addColorStop(0, 'rgba(96,104,74,0.22)');
    g.addColorStop(1, 'rgba(96,104,74,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
  }
  return finish(c);
}

export function gravelTexture(seed = 17) {
  const { c, ctx } = canvas(512);
  const r = rng(seed);
  ctx.fillStyle = '#8b8579';
  ctx.fillRect(0, 0, 512, 512);
  noiseDots(ctx, 512, 512, r, 18000, ['#6f6a60', '#a39d90', '#7c766b', '#b3ada0'], 0.5);
  return finish(c);
}

/* painted steel with vertical panel seams + grime */
export function shellTexture(seed = 23, base = '#d5d5cf') {
  const { c, ctx } = canvas(512);
  const r = rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  // horizontal weld seams
  for (let i = 0; i < 4; i++) {
    const y = 40 + i * 120;
    ctx.fillStyle = 'rgba(90,90,86,0.20)';
    ctx.fillRect(0, y, 512, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(0, y + 2, 512, 1);
  }
  // vertical plate seams
  for (let i = 0; i < 8; i++) {
    const x = i * 64;
    ctx.fillStyle = 'rgba(80,80,78,0.16)';
    ctx.fillRect(x, 0, 1.5, 512);
  }
  noiseDots(ctx, 512, 512, r, 4500, ['#b9b9b3', '#e6e6e0'], 0.12);
  streaks(ctx, 512, 512, r, 34, 'rgba(112,96,74,0.55)', 0.16, 7);
  // rust spots near bottom
  for (let i = 0; i < 60; i++) {
    ctx.globalAlpha = 0.05 + r() * 0.1;
    ctx.fillStyle = '#8a5a34';
    const x = r() * 512, y = 380 + r() * 132;
    ctx.beginPath(); ctx.ellipse(x, y, 2 + r() * 7, 1 + r() * 4, 0, 0, 6.3); ctx.fill();
  }
  ctx.globalAlpha = 1;
  return finish(c);
}

/* aluminium cladding / insulation jacket */
export function insulationTexture(seed = 31) {
  const { c, ctx } = canvas(512);
  const r = rng(seed);
  ctx.fillStyle = '#dcded9';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 12; i++) {
    const x = i * 42.6;
    const g = ctx.createLinearGradient(x, 0, x + 42.6, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(0.12, 'rgba(0,0,0,0.10)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0.14)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 42.6, 512);
  }
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = 'rgba(120,120,116,0.25)';
    ctx.fillRect(0, 60 + i * 96, 512, 2);
  }
  noiseDots(ctx, 512, 512, r, 2200, ['#c8cac4', '#f2f3ef'], 0.12);
  streaks(ctx, 512, 512, r, 18, 'rgba(120,110,96,0.5)', 0.10, 5);
  return finish(c);
}

/* grated platform deck */
export function gratingTexture(seed = 41) {
  const { c, ctx } = canvas(256);
  ctx.fillStyle = '#5c6166';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(180,186,190,0.45)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 256; i += 16) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(30,32,34,0.55)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 256; i += 8) {
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
  }
  return finish(c);
}

export function windowTexture(seed = 51) {
  const { c, ctx } = canvas(512);
  const r = rng(seed);
  ctx.fillStyle = '#20242a';
  ctx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const on = r() > 0.45;
      ctx.fillStyle = on ? `rgba(${255},${215 - r() * 40},${150 + r() * 40},${0.85})` : 'rgba(58,66,76,0.9)';
      ctx.fillRect(x * 64 + 6, y * 64 + 8, 52, 46);
    }
  }
  return finish(c);
}

export function flameTexture() {
  const { c, ctx } = canvas(256);
  const g = ctx.createRadialGradient(128, 150, 4, 128, 140, 120);
  g.addColorStop(0, 'rgba(255,255,240,1)');
  g.addColorStop(0.18, 'rgba(255,226,150,0.95)');
  g.addColorStop(0.42, 'rgba(255,150,50,0.65)');
  g.addColorStop(1, 'rgba(255,90,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return finish(c);
}

export function glowTexture() {
  const { c, ctx } = canvas(128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function smokeTexture(seed = 61) {
  const { c, ctx } = canvas(128);
  const r = rng(seed);
  for (let i = 0; i < 26; i++) {
    const x = 30 + r() * 68, y = 30 + r() * 68, rad = 10 + r() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.20)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/* ================= B 批：PBR 辅助贴图（粗糙度 / 法线 / 污渍 / 雨痕） ================= */

/** 数据纹理（粗糙度 / 法线）：不要做 sRGB 解码 */
function dataTex(c, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

/** 1×1 数据纹理：给 PBR 材质补默认 rough / normal，让所有材质共享同一 shader 变体 */
export function solidDataTexture(r, g, b, repeatX = 1, repeatY = 1) {
  const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** 粗糙度贴图：灰度噪声 + 竖向雨痕 + 斑块（钢构 / 管道 / 罐体通用） */
export function metalRoughTexture(seed = 71) {
  const { c, ctx } = canvas(512);
  const r = rng(seed);
  ctx.fillStyle = '#c8c8c8';          // 基准粗糙度 ~0.78
  ctx.fillRect(0, 0, 512, 512);
  // 大块明暗：局部更光滑 / 更粗糙
  for (let i = 0; i < 60; i++) {
    const x = r() * 512, y = r() * 512, rad = 20 + r() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const v = 150 + r() * 100;
    g.addColorStop(0, `rgba(${v},${v},${v},0.22)`);
    g.addColorStop(1, 'rgba(200,200,200,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.3); ctx.fill();
  }
  noiseDots(ctx, 512, 512, r, 6000, ['#9a9a9a', '#e2e2e2'], 0.14);
  // 竖向雨痕：粗糙度更高的浅色条
  for (let i = 0; i < 40; i++) {
    const x = r() * 512, top = r() * 200, len = 120 + r() * 300, w = 1 + r() * 5;
    const g = ctx.createLinearGradient(0, top, 0, top + len);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.3, `rgba(255,255,255,${0.10 + r() * 0.16})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, top, w, len);
  }
  return dataTex(c);
}

/** 法线贴图：由噪声高度场求导，给钢板/保温层一点起伏（幅度很小，不破坏轮廓） */
export function metalNormalTexture(seed = 73) {
  const size = 256;
  const { c, ctx } = canvas(size);
  const r = rng(seed);
  const h = new Float32Array(size * size);
  // 三层噪声高度场
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      h[y * size + x] = 0.5
        + 0.28 * Math.sin(u * 21.3 + Math.sin(v * 9.1) * 1.7)
        + 0.16 * Math.sin(v * 33.7 + Math.cos(u * 13.4) * 2.1)
        + 0.10 * (r() - 0.5);
    }
  }
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)];
      const rr = h[y * size + ((x + 1) % size)];
      const d = h[((y - 1 + size) % size) * size + x];
      const u = h[((y + 1) % size) * size + x];
      const nx = (rr - l) * 1.1, ny = (u - d) * 1.1;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return dataTex(c);
}

/** 污渍 / 水痕（乘到 map 上，整体偏亮，只压暗局部） */
export function grimeTexture(seed = 77) {
  const { c, ctx } = canvas(512);
  const r = rng(seed);
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(0, 0, 512, 512);
  // 雨水冲刷的竖向淡痕
  streaks(ctx, 512, 512, r, 46, 'rgba(150,146,138,0.5)', 0.16, 9);
  // 横向水渍 / 泥点
  for (let i = 0; i < 26; i++) {
    const x = r() * 512, y = r() * 512, w = 30 + r() * 150, hh = 3 + r() * 12;
    ctx.globalAlpha = 0.05 + r() * 0.09;
    ctx.fillStyle = '#8e8a80';
    ctx.beginPath(); ctx.ellipse(x, y, w * 0.5, hh * 0.5, r() * 3, 0, 6.3); ctx.fill();
  }
  noiseDots(ctx, 512, 512, r, 5000, ['#cfccc4', '#ffffff'], 0.10);
  ctx.globalAlpha = 1;
  return finish(c);
}

/** 罐体竖向雨痕（比 shellTexture 更强的 streaking，用于储罐/球罐） */
export function shellWeatheredTexture(seed = 79, base = '#d8d8d2') {
  const { c, ctx } = canvas(512);
  const r = rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  // 竖向雨痕：从顶部往下，越往下越淡
  for (let i = 0; i < 120; i++) {
    const x = r() * 512, w = 1 + r() * 10;
    const top = r() * 60, bottom = 260 + r() * 250;
    const g = ctx.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, `rgba(120,112,98,${0.05 + r() * 0.10})`);
    g.addColorStop(0.7, `rgba(120,112,98,${0.02 + r() * 0.05})`);
    g.addColorStop(1, 'rgba(120,112,98,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, top, w, bottom - top);
  }
  // 环向焊缝 + 竖向板缝
  for (let i = 0; i < 4; i++) {
    const y = 40 + i * 120;
    ctx.fillStyle = 'rgba(96,94,88,0.18)';
    ctx.fillRect(0, y, 512, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    ctx.fillRect(0, y + 2, 512, 1);
  }
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = 'rgba(88,86,82,0.13)';
    ctx.fillRect(i * 64, 0, 1.5, 512);
  }
  noiseDots(ctx, 512, 512, r, 4000, ['#c2c2bc', '#ecece6'], 0.10);
  // 底部锈迹
  for (let i = 0; i < 90; i++) {
    ctx.globalAlpha = 0.04 + r() * 0.10;
    ctx.fillStyle = '#8a5a34';
    const x = r() * 512, y = 360 + r() * 150;
    ctx.beginPath(); ctx.ellipse(x, y, 2 + r() * 9, 1 + r() * 5, 0, 0, 6.3); ctx.fill();
  }
  ctx.globalAlpha = 1;
  return finish(c);
}

/** 沥青路面：油污斑 + 轮胎压痕 + 修补块 */
export function asphaltOilTexture(seed = 83) {
  const { c, ctx } = canvas(512);
  const r = rng(seed);
  ctx.fillStyle = '#4a4a4a';
  ctx.fillRect(0, 0, 512, 512);
  noiseDots(ctx, 512, 512, r, 12000, ['#3a3a3a', '#606060', '#8a8a86'], 0.16);
  // 油污：更暗更"湿"的斑块
  for (let i = 0; i < 18; i++) {
    const x = r() * 512, y = r() * 512, rad = 10 + r() * 46;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(16,15,14,0.40)');
    g.addColorStop(0.6, 'rgba(28,26,24,0.20)');
    g.addColorStop(1, 'rgba(30,28,26,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.3); ctx.fill();
  }
  // 修补块 / 裂缝
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = 'rgba(24,24,22,0.35)';
    ctx.lineWidth = 1 + r() * 2;
    ctx.beginPath();
    let x = r() * 512, y = r() * 512;
    ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 90; y += (r() - 0.5) * 90; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  for (let i = 0; i < 8; i++) {
    ctx.globalAlpha = 0.10 + r() * 0.12;
    ctx.fillStyle = '#6e6e6a';
    ctx.fillRect(r() * 512, r() * 512, 20 + r() * 70, 14 + r() * 50);
  }
  ctx.globalAlpha = 1;
  return finish(c);
}
