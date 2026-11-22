/* 厂区环境音（D2）：WebAudio 程序化合成，默认静音
 * - 低频轰鸣：brown noise 循环 → lowpass(≈170Hz) → 缓慢 LFO 调制截止频率
 * - 蒸汽泄放：每 6–14 s 一次短促滤波噪声包络（bandpass + 快起慢落），音量克制
 * - 不创建 AudioContext 直到用户手势（避免 autoplay 警告）；localStorage 记忆开关
 * - 标签页隐藏时自动 suspend，可见时恢复；无逐帧 JS 开销
 */
const STORE_KEY = 'refinery3d.audio';
const VOLUME = 0.5;

export function createAudio({ onStateChange = () => {} } = {}) {
  let ctx = null;
  let master = null;
  let rumbleGain = null;
  let steamBuf = null;
  let steamTimer = 0;
  let on = false;
  let played = 0;

  function stored() {
    try {
      return localStorage.getItem(STORE_KEY);
    } catch {
      return null;
    }
  }
  function store(v) {
    try {
      localStorage.setItem(STORE_KEY, v ? '1' : '0');
    } catch {
      /* 隐私模式下忽略 */
    }
  }

  /** 懒创建音频图（只在用户手势里调用） */
  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // 1) 低频轰鸣
    const len = Math.round(ctx.sampleRate * 4);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 170;
    lp.Q.value = 0.7;
    rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.55;
    src.connect(lp);
    lp.connect(rumbleGain);
    rumbleGain.connect(master);
    src.start();

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 48;
    lfo.connect(lfoGain);
    lfoGain.connect(lp.frequency);
    lfo.start();

    // 2) 蒸汽泄放用的噪声缓冲（复用一个 buffer，避免每次分配）
    const slen = Math.round(ctx.sampleRate * 1.6);
    steamBuf = ctx.createBuffer(1, slen, ctx.sampleRate);
    const sd = steamBuf.getChannelData(0);
    for (let i = 0; i < slen; i++) sd[i] = (Math.random() * 2 - 1) * 0.7;
    scheduleSteam();
    return ctx;
  }

  /** 一次短促蒸汽泄放（约 0.6–1.3 s） */
  function steamBurst() {
    if (!ctx || !steamBuf || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const dur = 0.6 + Math.random() * 0.7;
    const src = ctx.createBufferSource();
    src.buffer = steamBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900 + Math.random() * 1400;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    const peak = 0.05 + Math.random() * 0.05;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.09);
    g.gain.exponentialRampToValueAtTime(0.02, now + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(master);
    src.start(now, Math.random() * 0.3, dur + 0.05);
    src.stop(now + dur + 0.1);
    played++;
  }

  function scheduleSteam() {
    clearTimeout(steamTimer);
    const wait = 6000 + Math.random() * 8000;
    steamTimer = setTimeout(() => {
      if (on && ctx && ctx.state === 'running') steamBurst();
      scheduleSteam();
    }, wait);
  }

  function ramp(to, dur) {
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
    master.gain.linearRampToValueAtTime(to, now + dur);
  }

  /** 开启（必须在用户手势里调用，或由已创建且已授权的 ctx 调用） */
  async function setOn(v) {
    on = !!v;
    if (on) {
      const c = ensure();
      if (!c) {
        on = false;
        return false;
      }
      if (c.state === 'suspended') await c.resume().catch(() => {});
      ramp(VOLUME, 1.2);
    } else {
      ramp(0, 0.5);
      // 淡出后再挂起，释放音频线程
      setTimeout(() => {
        if (!on && ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
      }, 700);
    }
    store(on);
    onStateChange(state());
    return on;
  }

  function state() {
    return { on, want: on, ctx: ctx ? ctx.state : 'none', volume: VOLUME, steamBursts: played };
  }

  /* 标签页隐藏自动静音（不改变用户的开关意图） */
  let resumeAfterVisible = false;
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) {
      if (ctx.state === 'running') {
        resumeAfterVisible = on;
        ctx.suspend().catch(() => {});
      }
    } else if (resumeAfterVisible) {
      resumeAfterVisible = false;
      if (on) ctx.resume().catch(() => {});
    }
  });

  /* 首次手势：如果此前记忆 / URL 要求开启，就在手势里创建 ctx */
  function armGesture() {
    const boot = armGesture.pending;
    if (!boot) return;
    armGesture.pending = false;
    window.removeEventListener('pointerdown', armGesture, true);
    window.removeEventListener('keydown', armGesture, true);
    setOn(true);
  }
  armGesture.pending = false;

  return {
    setOn,
    state,
    get isOn() {
      return on;
    },
    get ctx() {
      return ctx;
    },
    /** 取消「等手势再启动」（例如用户先点了按钮） */
    cancelArm() {
      armGesture.pending = false;
      window.removeEventListener('pointerdown', armGesture, true);
      window.removeEventListener('keydown', armGesture, true);
    },
    /** 标记「开关已打开」，等第一次用户手势后再真正创建 AudioContext */
    arm() {
      if (armGesture.pending) return;
      armGesture.pending = true;
      window.addEventListener('pointerdown', armGesture, true);
      window.addEventListener('keydown', armGesture, true);
    },
    get armed() {
      return armGesture.pending;
    },
    stored,
  };
}