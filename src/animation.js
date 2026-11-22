/* ==================================================================== */
/*  石油炼化工艺流程动画（facade）                                       */
/*  - 数据：src/data/stages.js（阶段 / 流线 / 机位 / 时长）                */
/*  - 拆分：src/anim/flow.js（流线粒子）· tour.js（镜头缓动）· hud.js（面板） */
/*  - 对外仍只导出 createAnimation(...)，main.js 与 window.__* API 不变     */
/* ==================================================================== */
import * as THREE from 'three';
import { mark } from './prof.js';
import { box, cyl, pipeRun, labelSprite, leaderLine, bakeStatic, makeGlow } from './helpers.js';
import { tankTruck } from './units.js';
import { DUR, STAGES, AIR_COOLERS, BLEND_TANKS } from './data/stages.js';
import { V, hash, clamp01 } from './anim/util.js';
import { createFlow } from './anim/flow.js';
import { createHud } from './anim/hud.js';
import { createTourCam } from './anim/tour.js';

/* 兼容旧引用：tour.js 等模块从 animation.js 取 STAGES / DUR */
export { STAGES, DUR } from './data/stages.js';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */
function makeFanInstances(m) {
  // 4 叶风扇，合并成一个几何体后做 InstancedMesh
  const geos = [];
  for (let b = 0; b < 4; b++) {
    const g = new THREE.BoxGeometry(1.15, 0.05, 0.42);
    g.translate(0.8, 0, 0);
    g.rotateY((b * Math.PI) / 2 + 0.35);
    geos.push(g);
  }
  const merged = new THREE.BufferGeometry();
  const pos = [];
  const nor = [];
  const uv = [];
  for (const g of geos) {
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    const u = g.attributes.uv.array;
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i++) {
      const k = idx[i];
      pos.push(p[k * 3], p[k * 3 + 1], p[k * 3 + 2]);
      nor.push(n[k * 3], n[k * 3 + 1], n[k * 3 + 2]);
      uv.push(u[k * 2], u[k * 2 + 1]);
    }
  }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const mat = m.steelLight.clone();
  mat.color = new THREE.Color(0xb9c0c6);
  mat.metalness = 0.6;
  const inst = new THREE.InstancedMesh(merged, mat, 18);
  inst.castShadow = false;
  inst.receiveShadow = false;
  inst.userData.noBake = true;
  inst.frustumCulled = false;
  return inst;
}

export function createAnimation({ scene, camera, controls, m, plant, labels, setLook = () => {}, isNight = () => false }) {
  /* ---------------- groups ---------------- */
  const staticRoot = new THREE.Group(); // 新增的静态设施（调和罐区）
  staticRoot.name = 'anim-static';
  const envRoot = new THREE.Group(); // 常驻环境动效
  envRoot.name = 'anim-env';
  const flowRoot = new THREE.Group(); // 演示模式：流线 + 高亮
  flowRoot.name = 'anim-flow';
  flowRoot.visible = false;
  scene.add(staticRoot, envRoot, flowRoot);


  const glowTex = m.glowTex; // 环境 glow 精灵共用贴图

  const state = {
    active: false,
    overview: false,
    playing: false,
    cruise: true,
    speed: 1,
    stage: 0,
    stageElapsed: 0,
    time: 0,
    tween: null,
    lastHud: 0,
    hudCache: '',
  };

  /* ---------------- api（流线 / 光环 / 状态机） ---------------- */
  const flow = createFlow({ flowRoot, m, state });
  const api = {
    streams: flow.streams,
    spot: flow.spot,
    stages: STAGES,
    state,
    time: 0,
    update,
    enter,
    exit,
    gotoStage,
    setTime,
    play,
    pause,
    setSpeed,
    setCruise,
    overview: overviewMode,
    isActive: () => state.active,
  };


  mark('anim-blend-start');
  /* ---------------- product blending unit ---------------- */
  const blendGroup = new THREE.Group();
  blendGroup.name = 'blending';
  for (const [x, z] of BLEND_TANKS) {
    blendGroup.add(cyl(5.3, 5.6, 0.6, m.concreteSmooth, x, 0.3, z, 28));
    blendGroup.add(cyl(4.2, 4.28, 10, m.shellWhite, x, 5.6, z, 32));
    blendGroup.add(cyl(4.3, 4.3, 0.36, m.steelLight, x, 10.68, z, 32));
    blendGroup.add(cyl(0.35, 4.28, 1.5, m.roof, x, 11.6, z, 32));
    blendGroup.add(cyl(0.5, 0.5, 2.0, m.pipeSilver, x + 4.25, 1.7, z, 8, 0, 0, Math.PI / 2));
    blendGroup.add(box(0.9, 0.9, 0.9, m.steelDark, x + 5.1, 1.7, z));
    blendGroup.add(box(0.06, 9.2, 0.06, m.ladder, x - 4.0, 5.4, z));
    for (let i = 0; i < 8; i++) blendGroup.add(box(0.5, 0.05, 0.05, m.ladder, x - 3.78, 1.2 + i * 1.15, z));
  }
  blendGroup.add(pipeRun([[114, 1.5, 38], [148, 1.5, 38], [148, 1.5, 66], [158, 1.5, 66]], 0.34, m.pipeSilver));
  for (let i = 0; i < 2; i++) {
    const x = 124 + i * 10;
    blendGroup.add(box(2.4, 0.3, 1.7, m.concreteSmooth, x, 0.15, 62));
    blendGroup.add(cyl(0.6, 0.6, 1.7, m.steelLight, x - 0.35, 0.95, 62, 10, 0, 0, Math.PI / 2));
    blendGroup.add(box(1.2, 0.95, 0.95, m.blue, x + 0.9, 0.9, 62));
    blendGroup.add(cyl(0.18, 0.18, 1.2, m.pipeGray, x - 0.35, 1.8, 62, 8));
  }
  staticRoot.add(blendGroup);
  /* 不做运行时合并：合并 60 个圆柱/盒子在 headless 下要 ~3s，而多 60 个 draw 只值 <1ms */

  // 给流程图补一个「产品调和」标注
  const blendLabel = labelSprite('产品调和', 'Product Blending', { accent: '#5fd0ff', scale: 1.35 });
  blendLabel.position.set(140, 27, 30);
  labels.add(blendLabel);
  const blendLeader = leaderLine([136, 10, 44], [140, 22.5, 32]);
  labels.add(blendLeader);

  mark('anim-blend-done');
  /* ---------------- environment: smoke / steam ---------------- */
  const smoke = [];
  plant.traverse((o) => {
    if (o.isSprite && o.material && o.material.map === m.smokeTex) {
      smoke.push({
        s: o,
        base: o.position.clone(),
        op: o.material.opacity,
        phase: hash(smoke.length * 1.7 + 0.3),
        range: 5 + hash(smoke.length * 3.1) * 5,
        rate: 0.05 + hash(smoke.length * 5.7) * 0.05,
        drift: 0.6 + hash(smoke.length * 7.3) * 1.4,
      });
    }
  });

  mark('anim-smoke-done');
  /* ---------------- environment: flare flame ---------------- */
  const flameCones = [];
  let flareGlow = null;
  plant.traverse((o) => {
    if (o.isMesh && o.material && o.material.blending === THREE.AdditiveBlending &&
        o.geometry && o.geometry.type === 'ConeGeometry' && o.position.y > 60) {
      flameCones.push({
        mesh: o,
        baseScale: o.scale.clone(),
        basePos: o.position.clone(),
        baseOp: o.material.opacity ?? 1,
        phase: hash(flameCones.length * 4.1 + 2.2),
      });
      o.userData.noBake = true;
    }
    if (o.isSprite && o.material && o.material.map === m.glowTex && o.position.y > 70) {
      flareGlow = { s: o, baseOp: o.material.opacity ?? 0.8, baseScale: o.scale.x };
    }
  });
  const flareLight = new THREE.PointLight(0xff9a45, 0, 240, 2);
  flareLight.position.set(172, 84, -120);
  envRoot.add(flareLight);

  mark('anim-flame-done');
  /* ---------------- environment: air-cooler fans ---------------- */
  const fanInst = makeFanInstances(m);
  const fans = [];
  for (const ac of AIR_COOLERS) {
    const count = Math.max(2, Math.round(ac.w / 3.2));
    for (let i = 0; i < count; i++) {
      const fx = -ac.w / 2 + (ac.w / count) * (i + 0.5);
      fans.push({ x: ac.x + fx, z: ac.z, y: 7.68, speed: 4.2 + hash(fans.length * 1.3) * 2.6, phase: hash(fans.length * 3.7) * 6.28 });
    }
  }
  fanInst.count = fans.length;
  envRoot.add(fanInst);
  const _q = new THREE.Quaternion();
  const _m4 = new THREE.Matrix4();
  const _s1 = new THREE.Vector3(1, 1, 1);
  const _v3 = new THREE.Vector3();

  mark('anim-fans-done');
  /* ---------------- environment: aviation beacons ---------------- */
  const BEACONS = [
    [142, 44.6, -104],
    [-9, 36.6, 54],
    [9, 36.6, 54],
  ];
  const beaconGlows = BEACONS.map((p) => {
    const g = makeGlow(glowTex, 0xff3b20, 8.5, 0.4);
    g.position.set(p[0], p[1], p[2]);
    envRoot.add(g);
    return g;
  });

  mark('anim-beacons-done');
  /* ---------------- environment: tank trucks ---------------- */
  function makeTruck(colorShift = 0) {
    const t = tankTruck(m);
    const g = new THREE.Group();
    g.add(t);
    if (colorShift) {
      // 让车辆颜色略有差异
      const mat = m.tankTruck.clone();
      mat.color.offsetHSL(colorShift, 0, 0);
      t.traverse((o) => { if (o.isMesh && o.material === m.tankTruck) o.material = mat; });
    }
    bakeStatic(g);
    envRoot.add(g);
    return g;
  }
  const trucks = [
    { g: makeTruck(0.0), dir: 1, z: 122, lane: 3.4, speed: 11, phase: 0.1, x0: -238, x1: 238 },
    { g: makeTruck(0.52), dir: -1, z: 122, lane: -3.4, speed: 9.2, phase: 0.55, x0: -238, x1: 238 },
    { g: makeTruck(0.16), dir: 1, z: -140, lane: 2.6, speed: 8.4, phase: 0.32, x0: -206, x1: 206 },
  ];
  for (const tr of trucks) {
    tr.g.rotation.y = tr.dir > 0 ? Math.PI : 0;
  }

  mark('anim-trucks-done');
  /* ---------------- environment: loading arms + valve wheels ---------------- */
  const hoses = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    g.position.set(161.2 + i * 7.5, 3.6, 76.4);
    const hose = cyl(0.09, 0.09, 1.9, m.cable, 0, -0.95, 0, 8);
    hose.position.y = -0.95;
    g.add(hose);
    g.add(box(0.22, 0.3, 0.22, m.steelDark, 0, -1.95, 0));
    g.add(box(0.1, 0.1, 0.1, m.steelLight, 0, 0, 0));
    envRoot.add(g);
    hoses.push({ g, phase: i * 1.7 });
  }
  const valveWheels = [];
  for (let i = 0; i < 5; i++) {
    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.055, 6, 14),
      m.fireRed
    );
    wheel.position.set(-12 + i * 8.4, 5.95, -17.94);
    envRoot.add(wheel);
    valveWheels.push({ wheel, phase: i * 0.9 });
  }
  // 泵联轴器护罩（轻微旋转）
  const pumpDiscs = [];
  const PUMPS = [
    [-110, -40, Math.PI / 2], [-110, 20, Math.PI / 2],
    [-4, -6, 0], [6, -6, 0],
    [52, -40, 0], [68, -40, 0],
  ];
  for (const [px, pz, ry] of PUMPS) {
    const off = V(0.92, 0.85, 0).applyAxisAngle(V(0, 1, 0), ry);
    const holder = new THREE.Group();
    holder.position.set(px + off.x, off.y, pz + off.z);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.07, 12), m.steelLight);
    disc.rotation.z = Math.PI / 2;
    holder.add(disc);
    envRoot.add(holder);
    pumpDiscs.push({ holder, phase: hash(pumpDiscs.length * 2.9) * 6.28 });
  }


  /* ---------------- HUD + 镜头（拆分模块） ---------------- */
  const { updateHud, fmt, bindHud } = createHud({ state });
  const { camApply, flyTo, updateTween } = createTourCam({ camera, controls, state });

  /* ---------------- mode ---------------- */
  function enter({ stage = 0, immediate = false, playing = true, cruise = true, overviewMode = false } = {}) {
    const wasActive = state.active;
    state.active = true;
    state.overview = !!overviewMode;
    state.playing = playing;
    state.cruise = cruise;
    document.body.classList.add('anim');
    document.body.classList.remove('flow');
    flowRoot.visible = true;
    if (!wasActive) setLook('dusk');
    labels.visible = !!overviewMode;
    if (overviewMode) {
      state.stage = 0;
      state.stageElapsed = 0;
      flow.applyStageVisuals();
      updateHud(true, performance.now());
      flyTo({ pos: [-300, 200, 392], target: [0, 20, -10], fov: 40 }, { immediate });
      onModeChange(true);
      return api;
    }
    state.stage = ((stage % STAGES.length) + STAGES.length) % STAGES.length;
    state.stageElapsed = 0;
    flow.applyStageVisuals();
    updateHud(true, performance.now());
    flyTo(STAGES[state.stage].cam, { immediate });
    onModeChange(true);
    return api;
  }

  function exit() {
    if (!state.active) return;
    state.active = false;
    state.overview = false;
    state.tween = null;
    controls.enabled = true;
    flowRoot.visible = false;
    document.body.classList.remove('anim');
    onModeChange(false);
  }

  function onModeChange(on) {
    if (typeof api.onModeChange === 'function') api.onModeChange(on);
  }

  function gotoStage(i, { immediate = false, dur = 2.2 } = {}) {
    state.stage = ((i % STAGES.length) + STAGES.length) % STAGES.length;
    state.stageElapsed = 0;
    state.overview = false;
    labels.visible = false;
    flowRoot.visible = true;
    flow.applyStageVisuals();
    updateHud(true, performance.now());
    flyTo(STAGES[state.stage].cam, { immediate, dur });
    return state.stage;
  }

  function setTime(t) {
    const val = Math.max(0, +t || 0);
    state.time = val;
    api.time = val;
    state.stageElapsed = state.overview ? 0 : val % DUR;
    updateEnv(val, 0);
    flow.refreshStreams(val);
    updateHud(true, performance.now());
    return val;
  }

  function play() {
    state.playing = true;
    if (!state.active) enter({ stage: state.stage });
    updateHud(true, performance.now());
  }

  function pause() {
    state.playing = false;
    updateHud(true, performance.now());
  }

  function setSpeed(x) {
    state.speed = [0.5, 1, 2].includes(+x) ? +x : 1;
    updateHud(true, performance.now());
  }

  function setCruise(on) {
    state.cruise = !!on;
    if (state.cruise) state.playing = true;
    updateHud(true, performance.now());
  }

  function overviewMode() {
    return enter({ overviewMode: true, immediate: true, playing: false, cruise: false });
  }

  /* ---------------- env update ---------------- */
  function updateEnv(t, dt) {
    // 1) 蒸汽 / 烟气上升
    for (const p of smoke) {
      const u = (t * p.rate + p.phase) % 1;
      p.s.position.y = p.base.y + u * p.range;
      p.s.position.x = p.base.x + Math.sin(t * 0.35 + p.phase * 6.28) * p.drift + u * 2.2;
      p.s.position.z = p.base.z + Math.cos(t * 0.27 + p.phase * 5.1) * p.drift * 0.7;
      const fade = 0.28 + 0.72 * Math.sin(Math.PI * Math.min(1, u * 1.05));
      p.s.material.opacity = p.op * fade;
    }
    // 2) 火炬火焰抖动
    const f1 = 0.5 + 0.5 * Math.sin(t * 9.3);
    const f2 = 0.5 + 0.5 * Math.sin(t * 14.7 + 2.1);
    const f3 = 0.5 + 0.5 * Math.sin(t * 23.1 + 4.4);
    const flick = clamp01(0.5 * f1 + 0.32 * f2 + 0.18 * f3);
    for (const c of flameCones) {
      const k = 0.86 + flick * 0.3;
      c.mesh.scale.set(c.baseScale.x * (0.9 + 0.18 * f2), c.baseScale.y * k, c.baseScale.z * (0.9 + 0.18 * f3));
      c.mesh.position.x = c.basePos.x + (flick - 0.5) * 0.5;
      c.mesh.position.z = c.basePos.z + (f2 - 0.5) * 0.4;
      c.mesh.material.opacity = c.baseOp * (0.78 + flick * 0.3);
    }
    if (flareGlow) {
      flareGlow.s.material.opacity = flareGlow.baseOp * (0.7 + flick * 0.45);
      const sc = flareGlow.baseScale * (0.92 + 0.16 * f1);
      flareGlow.s.scale.set(sc, sc, 1);
    }
    flareLight.intensity = 900 + flick * 2600;
    flareLight.visible = true;

    // 3) 空冷器风扇
    for (let i = 0; i < fans.length; i++) {
      const f = fans[i];
      const a = t * f.speed + f.phase;
      _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
      _v3.set(f.x, f.y, f.z);
      _m4.compose(_v3, _q, _s1);
      fanInst.setMatrixAt(i, _m4);
    }
    fanInst.instanceMatrix.needsUpdate = true;

    // 4) 航空障碍灯
    const baseBeacon = isNight() ? 7 : 2.2;
    const period = 1.35;
    const ph = (t % period) / period;
    const blink = ph < 0.18 ? Math.sin((ph / 0.18) * Math.PI) : 0;
    m.beacon.emissiveIntensity = baseBeacon * (0.25 + 1.7 * blink);
    for (const g of beaconGlows) {
      g.material.opacity = (isNight() ? 0.1 : 0.06) + blink * (isNight() ? 0.85 : 0.5);
    }

    // 5) 罐车行驶
    for (const tr of trucks) {
      const span = tr.x1 - tr.x0;
      const along = (t * tr.speed + tr.phase * span) % span;
      const x = tr.dir > 0 ? tr.x0 + along : tr.x1 - along;
      tr.g.position.set(x, 0.06, tr.z + tr.lane);
    }

    // 6) 装车鹤管摆动 + 阀门手轮 + 泵联轴器
    for (const h of hoses) {
      h.g.rotation.z = Math.sin(t * 0.9 + h.phase) * 0.045;
      h.g.rotation.x = Math.cos(t * 0.7 + h.phase * 1.3) * 0.03;
    }
    for (const v of valveWheels) {
      v.wheel.rotation.z = v.phase + Math.sin(t * 0.6 + v.phase) * 0.22;
    }
    for (const p of pumpDiscs) {
      p.holder.rotation.x = t * 9 + p.phase;
    }
  }

  /* ---------------- main update ---------------- */
  let lastHudMs = 0;
  function update(dtRaw) {
    const dtReal = Math.min(0.1, Math.max(0, dtRaw || 0));
    updateTween(dtReal);
    if (!state.playing) {
      updateHud(false, performance.now());
      return;
    }
    const dt = Math.min(0.05, dtReal) * state.speed;
    state.time += dt;
    api.time = state.time;
    if (state.active) {
      state.stageElapsed += dt;
      if (state.stageElapsed >= DUR) {
        if (state.cruise) {
          gotoStage(state.stage + 1, { dur: 2.4 });
        } else {
          state.stageElapsed = DUR;
        }
      }
    }
    updateEnv(state.time, dt);
    if (state.active) flow.updateFlow(state.time, dt);
    updateHud(false, performance.now());
  }

  /* ---------------- UI wiring ---------------- */
  bindHud({ gotoStage, enter, play, pause, setCruise, setSpeed });

  addEventListener('keydown', (e) => {
    if (!state.active) return;
    if (e.code === 'Space') {
      e.preventDefault();
      state.playing ? pause() : play();
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      gotoStage(state.stage - 1, { dur: 1.7 });
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      gotoStage(state.stage + 1, { dur: 1.7 });
    } else if (e.code === 'KeyT') {
      e.preventDefault();
      setCruise(!state.cruise);
    }
  });
  // 用户拖拽时暂停自动巡游
  controls.addEventListener('start', () => {
    if (!state.active) return;
    state.tween = null;
    controls.enabled = true;
    if (state.cruise) {
      state.cruise = false;
      updateHud(true, performance.now());
    }
  });

  // 初始状态（场景里保持环境动效）
  state.playing = true;
  updateEnv(0, 0);
  for (const st of flow.streams) st.update(0, false, 0, true);

  window.__animReady = true;

  return api;}
