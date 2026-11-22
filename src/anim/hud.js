/* HUD 与进度（D1 从 animation.js 拆出）：阶段面板、时间轴、按钮绑定 */
import * as THREE from 'three';
import { STAGES, DUR } from '../data/stages.js';
import { clamp01 } from './util.js';

/**
 * @param {object} o
 * @param {object} o.state 动画状态机（stage / overview / playing / cruise / speed / stageElapsed）
 */
export function createHud({ state }) {
  const $ = (id) => document.getElementById(id);
  const elPanel = $('apanel');
  const elNum = $('astage-num');
  const elCn = $('astage-cn');
  const elEn = $('astage-en');
  const elDesc = $('astage-desc');
  const elDots = $('adots');
  const elBar = $('abar');
  const elTime = $('atime');
  const elPlay = document.querySelector('#animui [data-act="play"]');
  const elCruise = document.querySelector('#animui [data-act="cruise"]');
  const speedBtns = Array.from(document.querySelectorAll('#animui [data-speed]'));
  const dotEls = [];
  if (elDots) {
    for (let i = 0; i < STAGES.length; i++) {
      const d = document.createElement('span');
      d.textContent = STAGES[i].num;
      elDots.appendChild(d);
      dotEls.push(d);
    }
  }

  function updateHud(force = false, nowMs = 0) {
    if (!force && nowMs - state.lastHud < 90) return;
    state.lastHud = nowMs;
    const ov = state.overview;
    const s = STAGES[state.stage];
    const key = `${state.stage}|${ov}|${state.playing}|${state.cruise}|${state.speed}|${Math.round(state.stageElapsed * 4)}`;
    if (key === state.hudCache && !force) return;
    state.hudCache = key;

    if (elPanel) elPanel.style.setProperty('--accent', `#${new THREE.Color(ov ? 0x9fe9ff : s.color).getHexString()}`);
    if (elNum) elNum.textContent = ov ? '00' : s.num;
    if (elCn) elCn.textContent = ov ? '全流程总览' : s.cn;
    if (elEn) elEn.textContent = ov ? 'PROCESS OVERVIEW · MATERIAL FLOW' : s.en;
    if (elDesc) {
      elDesc.textContent = ov
        ? '原油 → 常减压 → 催化裂化 → 重整加氢 → 产品调和 → 装卸出厂。发光流线表示物料走向，颜色区分原油、高温油气与成品油。'
        : s.desc;
    }
    for (let i = 0; i < dotEls.length; i++) {
      dotEls[i].className = ov ? 'done' : i === state.stage ? 'on' : i < state.stage ? 'done' : '';
    }
    const p = ov ? 1 : clamp01(state.stageElapsed / DUR);
    if (elBar) elBar.style.width = `${(p * 100).toFixed(1)}%`;
    if (elTime) {
      const total = STAGES.length * DUR;
      const cur = ov ? total : state.stage * DUR + Math.min(state.stageElapsed, DUR);
      elTime.textContent = `${fmt(cur)} / ${fmt(total)}`;
    }
    if (elPlay) {
      elPlay.textContent = state.playing ? '❚❚' : '▶';
      elPlay.classList.toggle('on', state.playing);
    }
    if (elCruise) elCruise.classList.toggle('on', state.cruise);
    speedBtns.forEach((b) => b.classList.toggle('on', +b.dataset.speed === state.speed));
  }

  function fmt(sec) {
    const s = Math.max(0, Math.round(sec));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  /** 绑定播放控制按钮（播放/暂停、巡游、倍速、上一段/下一段、阶段点） */
  function bindHud(actions) {
    function bindClick(el, fn) {
      if (!el) return;
      el.addEventListener('click', (e) => {
        e.preventDefault();
        fn();
        el.blur();
      });
    }
    bindClick(document.querySelector('#animui [data-act="prev"]'), () => actions.gotoStage(state.stage - 1, { dur: 1.7 }));
    bindClick(document.querySelector('#animui [data-act="next"]'), () => actions.gotoStage(state.stage + 1, { dur: 1.7 }));
    bindClick(elPlay, () => (state.playing ? actions.pause() : actions.play()));
    bindClick(elCruise, () => actions.setCruise(!state.cruise));
    speedBtns.forEach((b) => bindClick(b, () => actions.setSpeed(+b.dataset.speed)));
    dotEls.forEach((d, i) =>
      bindClick(d, () => {
        if (!state.active) actions.enter({ stage: i, immediate: true });
        else actions.gotoStage(i, { dur: 1.6 });
      })
    );
  }

  return { updateHud, fmt, bindHud };
}