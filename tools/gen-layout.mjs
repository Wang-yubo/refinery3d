// 校验 data/layout.json，并把内置副本同步进 src/data/layout.js
//   node tools/gen-layout.mjs           # 校验 + 重写内置副本
//   node tools/gen-layout.mjs --check   # 只校验（CI 用）
import fs from 'node:fs';

const CHECK = process.argv.includes('--check');
const REQ = ['id', 'unit', 'kind', 'cn', 'en', 'x', 'z', 'w', 'h', 'd', 'cy', 'desc', 'specs'];
const json = JSON.parse(fs.readFileSync('data/layout.json', 'utf8'));
const devices = Array.isArray(json) ? json : json.devices;
const errors = [];
if (!Array.isArray(devices)) errors.push('devices 不是数组');
if (devices.length !== 35) errors.push(`设备数 ${devices.length} != 35`);
const ids = new Set();
for (const d of devices) {
  for (const k of REQ) if (d[k] === undefined) errors.push(`${d.id || '?'} 缺字段 ${k}`);
  if (ids.has(d.id)) errors.push(`重复 id ${d.id}`);
  ids.add(d.id);
  if (!Array.isArray(d.specs) || d.specs.length < 2) errors.push(`${d.id} specs 过少`);
}
if (errors.length) {
  console.error('layout 校验失败:\n  ' + errors.slice(0, 20).join('\n  '));
  process.exit(1);
}
console.log(`layout OK: ${devices.length} 台设备 / ${ids.size} 个唯一 id`);

if (!CHECK) {
  const file = 'src/data/layout.js';
  const src = fs.readFileSync(file, 'utf8');
  const body = devices.map((d) => '  ' + JSON.stringify(d)).join(',\n');
  const next = src.replace(/const BUILTIN = \[\n[\s\S]*?\n\];/, `const BUILTIN = [\n${body}\n];`);
  if (next === src) {
    console.log('内置副本已是最新');
  } else {
    fs.writeFileSync(file, next);
    console.log('已同步 src/data/layout.js 内置副本');
  }
}
