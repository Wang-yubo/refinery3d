import fs from 'node:fs';
import zlib from 'node:zlib';

export function decodePNG(file) {
  const buf = fs.readFileSync(file);
  let pos = 8;
  let w = 0, h = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`unsupported png: depth ${bitDepth} type ${colorType} interlace ${interlace}`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  let off = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[off++];
    const line = raw.subarray(off, off + stride);
    off += stride;
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      switch (filter) {
        case 0: break;
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          break;
        }
        default: throw new Error('bad filter ' + filter);
      }
      cur[x] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      const si = x * channels;
      const di = (y * w + x) * 4;
      out[di] = cur[si];
      out[di + 1] = cur[si + 1];
      out[di + 2] = cur[si + 2];
      out[di + 3] = channels === 4 ? cur[si + 3] : 255;
    }
    prev = cur;
  }
  return { width: w, height: h, data: out };
}

export function stats(img) {
  const { width: w, height: h, data } = img;
  let sum = 0;
  const hist = new Array(16).fill(0);
  let dark = 0, clip = 0;
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += l;
    hist[Math.min(15, (l / 16) | 0)]++;
    if (l < 12) dark++;
    if (l > 250) clip++;
  }
  const n = w * h;
  return {
    mean: +(sum / n).toFixed(1),
    darkPct: +((dark / n) * 100).toFixed(1),
    clipPct: +((clip / n) * 100).toFixed(2),
    hist: hist.map((v) => +((v / n) * 100).toFixed(1)),
  };
}

const RAMP = ' .:-=+*#%@';
function luma(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

export function ascii(img, cols = 100, rows = 38) {
  const { width: w, height: h, data } = img;
  const cw = w / cols, ch = h / rows;
  const lines = [];
  for (let ry = 0; ry < rows; ry++) {
    let line = '';
    for (let rx = 0; rx < cols; rx++) {
      let r = 0, g = 0, b = 0, n = 0;
      const x0 = Math.floor(rx * cw), x1 = Math.min(w, Math.floor((rx + 1) * cw));
      const y0 = Math.floor(ry * ch), y1 = Math.min(h, Math.floor((ry + 1) * ch));
      for (let y = y0; y < y1; y += 3) {
        for (let x = x0; x < x1; x += 3) {
          const i = (y * w + x) * 4;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
        }
      }
      r /= n; g /= n; b /= n;
      const l = luma(r, g, b);
      line += RAMP[Math.min(RAMP.length - 1, Math.floor((l / 255) * RAMP.length))];
    }
    lines.push(line);
  }
  return lines.join('\n');
}

export function colorMap(img, cols = 100, rows = 38) {
  const { width: w, height: h, data } = img;
  const cw = w / cols, ch = h / rows;
  const lines = [];
  for (let ry = 0; ry < rows; ry++) {
    let line = '';
    for (let rx = 0; rx < cols; rx++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = Math.floor(ry * ch); y < Math.min(h, Math.floor((ry + 1) * ch)); y += 4) {
        for (let x = Math.floor(rx * cw); x < Math.min(w, Math.floor((rx + 1) * cw)); x += 4) {
          const i = (y * w + x) * 4;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
        }
      }
      r /= n; g /= n; b /= n;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const sat = mx === 0 ? 0 : (mx - mn) / mx;
      let c = '.';
      if (mx < 28) c = ' ';
      else if (sat < 0.12) c = mx > 170 ? 'W' : (mx > 80 ? 'w' : 'k');
      else if (b > r && b > g) c = 'B';
      else if (g > r && g > b) c = 'G';
      else if (r > g && g >= b) c = (g > r * 0.75) ? 'O' : 'R';
      else c = 'M';
      line += c;
    }
    lines.push(line);
  }
  return lines.join('\n');
}

if (process.argv[1] && process.argv[1].endsWith('png.mjs') && process.argv[2]) {
  const img = decodePNG(process.argv[2]);
  console.log(`size ${img.width}x${img.height}`);
  console.log(JSON.stringify(stats(img)));
  console.log(ascii(img));
  console.log(colorMap(img));
}