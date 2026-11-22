// 检查 src/ 的 import 图：无循环依赖 + 无缺失文件（D1 验收）
//   node tools/check-imports.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'src';
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) files.push(p);
  }
})(ROOT);

const graph = new Map();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const deps = [];
  for (const m of src.matchAll(/^\s*(?:import|export)[^;]*?from\s+['"]([^'"]+)['"]/gm)) {
    const spec = m[1];
    if (!spec.startsWith('.')) continue; // vendor 等裸模块跳过
    const abs = path.normalize(path.join(path.dirname(f), spec));
    if (!fs.existsSync(abs)) console.log(`✗ ${f} → ${spec}（文件不存在）`);
    deps.push(abs);
  }
  graph.set(f, deps);
}

// DFS 找环
const state = new Map(); // 0 未访问 1 访问中 2 完成
const cycles = [];
function dfs(n, stack) {
  state.set(n, 1);
  stack.push(n);
  for (const d of graph.get(n) || []) {
    if (!graph.has(d)) continue;
    if (state.get(d) === 1) cycles.push([...stack.slice(stack.indexOf(d)), d]);
    else if (!state.get(d)) dfs(d, stack);
  }
  stack.pop();
  state.set(n, 2);
}
for (const f of files) if (!state.get(f)) dfs(f, []);

if (cycles.length) {
  console.log(`✗ 发现 ${cycles.length} 个循环依赖:`);
  for (const c of cycles) console.log('  ' + c.join(' → '));
  process.exit(1);
}
const total = [...graph.values()].reduce((a, b) => a + b.length, 0);
console.log(`import 图 OK: ${files.length} 个文件 / ${total} 条相对依赖 / 0 循环`);
