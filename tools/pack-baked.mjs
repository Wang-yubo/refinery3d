// 把 assets/baked.bin 压成 assets/baked.bin.gz（gzip -9）；运行时用 DecompressionStream 解压
import fs from 'node:fs';
import zlib from 'node:zlib';

const src = 'assets/baked.bin';
const dst = 'assets/baked.bin.gz';
const raw = fs.readFileSync(src);
const gz = zlib.gzipSync(raw, { level: 9 });
fs.writeFileSync(dst, gz);
console.log(`${src} ${(raw.length / 1048576).toFixed(2)}MB -> ${dst} ${(gz.length / 1048576).toFixed(2)}MB (${(100 - (gz.length / raw.length) * 100).toFixed(1)}% smaller)`);
