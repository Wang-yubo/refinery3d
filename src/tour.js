import * as THREE from 'three';
import { STAGES } from './animation.js';

/**
 * C3：导览模式（自动讲解 + 字幕）。
 *
 * 复用工艺流程的 6 个阶段与机位（STAGES[i].cam），逐段推近、底部字幕条同步中英文讲解，
 * 可用 speechSynthesis 朗读（默认关闭）。进入导览会退出工艺流程动画并暂停其巡游，
 * 保证两种演示模式互斥。
 */

const DUR = 13;      // 每段停留时间（秒）
const TWEEN = 1.8;   // 相机过渡时间（秒）
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);

export function createTour({ camera, controls, anim, interact, isClean = false }) {
  const root = document.getElementById('tourui');
  const startBtn = document.getElementById('tour-btn');
  if (!root || !startBtn) return null;

  const el = {
    cn: document.getElementById('tour-cn'),
    en: document.getElementById('tour-en'),
    num: document.getElementById('tour-num'),
    dots: document.getElementById('tour-dots'),
    bar: document.getElementById('tour-bar'),
    prev: document.getElementById('tour-prev'),
    play: document.getElementById('tour-play'),
    next: document.getElementById('tour-next'),
    voice: document.getElementById('tour-voice'),
    close: document.getElementById('tour-close'),
  };

  const state = { active: false, index: 0, elapsed: 0, playing: true, voice: false, tween: null };
  let lastBar = 0;

  for (let i = 0; i < STAGES.length; i++) {
    const d = document.createElement('span');
    d.textContent = STAGES[i].num;
    d.onclick = () => goto(i);
    el.dots?.appendChild(d);
  }

  function speak() {
    if (!state.voice || typeof speechSynthesis === 'undefined') return;
    try {
      const st = STAGES[state.index];
      const u = new SpeechSynthesisUtterance(`${st.cn}。${st.desc}`);
      u.lang = 'zh-CN';
      u.rate = 0.95;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch { /* 无语音合成环境时静默 */ }
  }

  function syncVoiceBtn() {
    if (!el.voice) return;
    el.voice.textContent = state.voice ? '语音 ON' : '语音 OFF';
    el.voice.classList.toggle('on', state.voice);
  }

  function renderHud() {
    const st = STAGES[state.index];
    if (el.cn) el.cn.textContent = st.desc;
    if (el.en) el.en.textContent = st.en;
    if (el.num) el.num.textContent = `${st.num} / ${String(STAGES.length).padStart(2, '0')}`;
    if (el.dots) [...el.dots.children].forEach((d, i) => d.classList.toggle('on', i === state.index));
    root.style.setProperty('--tcolor', `#${st.color.toString(16).padStart(6, '0')}`);
    syncVoiceBtn();
  }

  function applyCam(cam) {
    camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
    controls.target.set(cam.target[0], cam.target[1], cam.target[2]);
    camera.fov = cam.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(new THREE.Vector3(cam.target[0], cam.target[1], cam.target[2]));
    controls.update();
  }

  function goto(i, { immediate = false } = {}) {
    const n = STAGES.length;
    state.index = ((i % n) + n) % n;
    state.elapsed = 0;
    renderHud();
    speak();
    const cam = STAGES[state.index].cam;
    if (immediate) {
      state.tween = null;
      controls.enabled = true;
      applyCam(cam);
      return state.index;
    }
    state.tween = {
      t: 0,
      from: { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov },
      to: { pos: new THREE.Vector3(...cam.pos), target: new THREE.Vector3(...cam.target), fov: cam.fov },
    };
    controls.enabled = false;
    return state.index;
  }

  function start(index = 0) {
    if (anim.isActive()) anim.exit();
    if (anim.state.cruise) anim.setCruise(false);
    if (interact?.state?.().selected) interact.cancel();
    state.active = true;
    state.playing = true;
    state.voice = false;
    document.body.classList.add('tour');
    root.classList.add('on');
    window.__tourActive = true;
    if (el.play) el.play.textContent = '❚❚';
    goto(index, { immediate: false });
    return state.index;
  }

  function stop() {
    if (!state.active) return false;
    state.active = false;
    state.tween = null;
    state.playing = false;
    document.body.classList.remove('tour');
    root.classList.remove('on');
    window.__tourActive = false;
    controls.enabled = true;
    if (typeof speechSynthesis !== 'undefined') { try { speechSynthesis.cancel(); } catch { /* noop */ } }
    return true;
  }

  function setPlaying(on) {
    state.playing = !!on;
    if (el.play) el.play.textContent = state.playing ? '❚❚' : '▶';
    if (!state.playing && typeof speechSynthesis !== 'undefined') { try { speechSynthesis.cancel(); } catch { /* noop */ } }
    if (state.playing) speak();
    return state.playing;
  }

  function toggleVoice() {
    state.voice = !state.voice;
    syncVoiceBtn();
    if (state.voice) speak();
    else if (typeof speechSynthesis !== 'undefined') { try { speechSynthesis.cancel(); } catch { /* noop */ } }
    return state.voice;
  }

  function update(dt) {
    if (!state.active) return;
    const now = performance.now();
    const tw = state.tween;
    if (tw) {
      tw.t = Math.min(1, tw.t + dt / TWEEN);
      const e = easeInOut(tw.t);
      camera.position.lerpVectors(tw.from.pos, tw.to.pos, e);
      controls.target.lerpVectors(tw.from.target, tw.to.target, e);
      camera.fov = tw.from.fov + (tw.to.fov - tw.from.fov) * e;
      camera.updateProjectionMatrix();
      camera.lookAt(controls.target);
      if (tw.t >= 1) { state.tween = null; controls.enabled = true; controls.update(); }
    }
    if (state.playing) {
      state.elapsed += dt;
      if (state.elapsed >= DUR) {
        if (state.index >= STAGES.length - 1) { setPlaying(false); state.elapsed = DUR; }
        else goto(state.index + 1);
      }
    }
    if (el.bar && now - lastBar > 90) {
      lastBar = now;
      el.bar.style.transform = `scaleX(${Math.min(1, state.elapsed / DUR).toFixed(3)})`;
    }
  }

  startBtn.addEventListener('click', () => { state.active ? stop() : start(0); });
  el.prev?.addEventListener('click', () => goto(state.index - 1));
  el.next?.addEventListener('click', () => goto(state.index + 1));
  el.play?.addEventListener('click', () => setPlaying(!state.playing));
  el.voice?.addEventListener('click', toggleVoice);
  el.close?.addEventListener('click', stop);

  addEventListener('keydown', (e) => {
    if (!state.active) return;
    if (e.code === 'Space') { e.preventDefault(); setPlaying(!state.playing); }
    else if (e.code === 'ArrowLeft') { e.preventDefault(); goto(state.index - 1); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); goto(state.index + 1); }
    else if (e.code === 'Escape') stop();
  });

  if (isClean) startBtn.style.display = 'none';

  return {
    start, stop, goto, update, setPlaying, toggleVoice,
    isActive: () => state.active,
    state: () => ({
      active: state.active,
      index: state.index,
      stage: STAGES[state.index].cn,
      playing: state.playing,
      voice: state.voice,
      elapsed: +state.elapsed.toFixed(2),
      total: STAGES.length,
      subtitle: el.cn ? el.cn.textContent : '',
    }),
  };
}