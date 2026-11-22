// C5：核对 README 里的 window.__ API 与源码实际导出的 API 是否逐项一致。
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readdirSync('src').filter((f) => f.endsWith('.js')).map((f) => path.join('src', f));
const code = SRC.map((f) => fs.readFileSync(f, 'utf8')).join('\n') + fs.readFileSync('index.html', 'utf8');
const defined = new Set([...code.matchAll(/window\.(__[A-Za-z0-9_]+)\s*=/g)].map((m) => m[1]));
// 由其它模块挂到 window 上的（interaction/animation 内部不是 window.__ 形式）也算，先收集
for (const m of code.matchAll(/window\[?['"](__[A-Za-z0-9_]+)['"]?\]?\s*=/g)) defined.add(m[1]);

const readme = fs.readFileSync('README.md', 'utf8');
const mentioned = new Set([...readme.matchAll(/`window\.(__[A-Za-z0-9_]+)/g)].map((m) => m[1]));
// 表格里以 `__x` / `__x()` 形式简写的也算
for (const m of readme.matchAll(/`(__[A-Za-z0-9_]+)(?:\(\))?`/g)) mentioned.add(m[1]);

const missingInCode = [...mentioned].filter((n) => !defined.has(n)).sort();
const undocumented = [...defined].filter((n) => !mentioned.has(n)).sort();
console.log(`源码导出 ${defined.size} 个 window.__ API，README 记录 ${mentioned.size} 个`);
console.log('README 有但源码没有：', missingInCode.length ? missingInCode : 'none');
console.log('源码有但 README 没写：', undocumented.length ? undocumented : 'none');
// URL 参数核对
const params = new Set([...code.matchAll(/params\.get\('([a-z0-9]+)'\)/g)].map((m) => m[1]));
const docParams = new Set([...readme.matchAll(/^\| `([a-z0-9]+)` \|/gm)].map((m) => m[1]));
console.log('源码读取的 URL 参数：', [...params].sort().join(', '));
const missingParams = [...params].filter((p) => !docParams.has(p)).sort();
console.log('URL 参数未写进 README：', missingParams.length ? missingParams : 'none');
const ok = missingInCode.length === 0 && missingParams.length === 0;
console.log(ok ? 'DOCS OK' : 'DOCS MISMATCH');
process.exit(ok ? 0 : 1);
