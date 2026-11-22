// C4：一键冒烟 —— 依次跑 截图抽检 / 动画校验 / 设备拾取 / 画质对比截图，
// 汇总成统一 JSON + 文本报告，任一步失败即非零退出。
//
//   node tools/check-all.mjs            # 全量（约 8–10 分钟）
//   node tools/check-all.mjs --quick    # 跳过 opt2 对比截图（约 4 分钟）
//   node tools/check-all.mjs --only anim,equip
//
// 需要本地静态服务器（默认 http://127.0.0.1:4321/，可用 SERVE_URL 覆盖）。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { BASE_URL } from './chrome.mjs';

const argv = process.argv.slice(2);
const QUICK = argv.includes('--quick');
const ONLY = (() => {
  const i = argv.indexOf('--only');
  return i >= 0 && argv[i + 1] ? argv[i + 1].split(',').map((s) => s.trim()) : null;
})();

const STEPS = [
  { id: 'shots', name: '截图抽检（hero/cdu/aerial）', cmd: ['node', ['tools/final.mjs', 'hero', 'cdu', 'aerial']], timeout: 420000 },
  { id: 'anim', name: '工艺流程动画校验', cmd: ['node', ['tools/anim.mjs', 'check']], timeout: 420000 },
  { id: 'equip', name: '设备拾取 / 交互校验', cmd: ['node', ['tools/verify-equip.mjs']], timeout: 420000 },
  { id: 'opt2', name: '画质对比截图（opt2）', cmd: ['node', ['tools/opt2-shots.mjs']], timeout: 600000, optional: true },
].filter((s) => (ONLY ? ONLY.includes(s.id) : !(QUICK && s.id === 'opt2')));

const results = [];
const t0 = Date.now();
console.log(`\n=== check-all  ${new Date().toISOString()}  base=${BASE_URL}${QUICK ? '  (quick)' : ''}`);
console.log(`步骤: ${STEPS.map((s) => s.id).join(' → ')}\n`);

for (const step of STEPS) {
  if (!fs.existsSync(step.cmd[1][0])) {
    results.push({ id: step.id, name: step.name, status: 'skipped', reason: `缺少 ${step.cmd[1][0]}`, ms: 0 });
    console.log(`⤼  ${step.id.padEnd(6)} skipped（缺少 ${step.cmd[1][0]}）`);
    continue;
  }
  const started = Date.now();
  process.stdout.write(`▶ ${step.id.padEnd(6)} ${step.name} … `);
  const r = spawnSync(step.cmd[0], step.cmd[1], {
    encoding: 'utf8', timeout: step.timeout, env: { ...process.env, SERVE_URL: BASE_URL },
  });
  const ms = Date.now() - started;
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const ok = r.status === 0;
  const tail = out.trim().split('\n').slice(-6).join('\n');
  results.push({
    id: step.id, name: step.name, status: ok ? 'pass' : 'fail', exitCode: r.status, ms,
    signal: r.signal || null, tail,
    failedLines: ok ? [] : out.split('\n').filter((l) => /error|fail|❌|not ok|MISS|TypeError/i.test(l)).slice(0, 6),
  });
  console.log(`${ok ? '✔' : '✘'} ${(ms / 1000).toFixed(1)}s`);
  if (!ok) console.log(tail.split('\n').map((l) => `   │ ${l}`).join('\n'));
  if (!ok && step.optional && !ONLY) {
    console.log('   （optional 步骤失败，继续后续步骤）');
  }
}

const totalMs = Date.now() - t0;
const failed = results.filter((r) => r.status === 'fail');
const passed = results.filter((r) => r.status === 'pass');
const skipped = results.filter((r) => r.status === 'skipped');
const report = {
  generated: new Date().toISOString(),
  base: BASE_URL,
  quick: QUICK,
  totalMs,
  ok: failed.length === 0,
  summary: { pass: passed.length, fail: failed.length, skipped: skipped.length },
  steps: results,
};

fs.mkdirSync('diag', { recursive: true });
const jsonPath = 'diag/check-all.json';
const txtPath = 'diag/check-all.txt';
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

const lines = [
  `check-all ${report.ok ? 'PASS' : 'FAIL'}  ${(totalMs / 1000).toFixed(1)}s  (${new Date().toISOString()})`,
  `base: ${BASE_URL}${QUICK ? '  quick' : ''}`,
  '',
  ...results.map((r) => {
    const mark = r.status === 'pass' ? '✔' : r.status === 'skipped' ? '⤼' : '✘';
    const dur = r.ms ? `${(r.ms / 1000).toFixed(1)}s` : '—';
    const why = r.reason || (r.status === 'fail' ? `exit=${r.exitCode} ${r.failedLines?.[0] || ''}` : '');
    return `${mark} ${r.id.padEnd(6)} ${dur.padStart(7)}  ${r.name}${why ? `  — ${why}` : ''}`;
  }),
  '',
  report.ok ? 'ALL CHECKS PASSED' : `FAILED: ${failed.map((f) => f.id).join(', ')}`,
];
fs.writeFileSync(txtPath, lines.join('\n'));
console.log(`\n${lines.join('\n')}`);
console.log(`\n报告: ${jsonPath} / ${txtPath}`);
process.exit(report.ok ? 0 : 1);