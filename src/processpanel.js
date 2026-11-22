/* E3：工艺参数面板 + 物料平衡条
 * - 数据来自 src/data/process.js（示意值，与工艺流线数据解耦）
 * - 每阶段：温度 / 压力 / 处理量 / 主收率 + 4 项物料平衡（合计 100%）
 * - ?params=1 强制打开；clean 截图模式隐藏；与 #animui / #explorer / #bar 不重叠
 */
import { PROCESS_PARAMS } from './data/process.js';

const ROWS = [
  ['温度', (p) => `${p.temp === '常温' ? '常温' : p.temp + ' °C'}`],
  ['压力', (p) => `${p.pressure} MPa`],
  ['处理量', (p) => `${p.throughput.toLocaleString('en-US')} t/d`],
  ['主收率', (p) => p.yieldMain],
];

export function createProcessPanel({ isClean, getStage, getOverview }) {
  const el = document.getElementById('process-panel');
  if (!el) return { update: () => {}, state: () => null };

  const stageEl = el.querySelector('.pp-stage');
  const rowsEl = el.querySelector('.pp-rows');
  const balEl = el.querySelector('.pp-balance');
  const noteEl = el.querySelector('.pp-note');

  rowsEl.innerHTML = ROWS.map(([k]) => `<div class="pp-row"><span>${k}</span><b class="pp-val">—</b></div>`).join('');
  const valEls = [...rowsEl.querySelectorAll('.pp-val')];
  noteEl.textContent = '示意值 · 非生产数据';

  let lastStage = -1;
  function update() {
    const stage = getStage();
    const ov = getOverview();
    if (stage === lastStage && !ov) return;
    lastStage = stage;
    const p = PROCESS_PARAMS[((stage % PROCESS_PARAMS.length) + PROCESS_PARAMS.length) % PROCESS_PARAMS.length];
    stageEl.textContent = ov ? '全流程总览' : p.cn;
    ROWS.forEach(([, fn], i) => { valEls[i].textContent = ov ? '—' : fn(p); });
    balEl.innerHTML =
      `<div class="pb-head">物料平衡 <em>${ov ? '合计 100%' : p.note}</em></div>` +
      p.products
        .map((x) => `<div class="pb-row"><span>${x.name}</span><b class="pb-val">${x.pct}</b><em>%</em><i style="width:${x.pct}%"></i></div>`)
        .join('');
  }

  update();

  let opened = !isClean;
  function setOpen(on) {
    opened = !!on;
    el.classList.toggle('open', opened);
  }
  setOpen(!isClean);

  return {
    update,
    setOpen,
    isOpen: () => opened,
    state: () => ({ open: opened, stage: lastStage, hidden: isClean }),
  };
}