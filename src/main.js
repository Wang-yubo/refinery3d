import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createMaterials } from './materials.js';
import { createSky, createLights, createGround, createHills, applyPreset, PRESETS } from './environment.js';
import { createPlant, createPlantDecor } from './plant.js';
import { bakeStatic } from './helpers.js';
import { createAnimation } from './animation.js';
import { createInteraction } from './interaction.js';
import { createContactShadows } from './contacts.js';
import { QUALITY_LEVELS, detectQuality } from './quality.js';
import { SSAOPass, FXAAPass, CinematicPass, DepthOfFieldPass, createLuminanceMeter } from './postfx.js';
import { loadPlantSnapshot } from './prebaked.js';
import { BAKED_META } from './bakedMeta.js';

const params = new URLSearchParams(location.search);
const T0 = performance.now();
const mark = (label) => console.log(`[timing] ${label} ${((performance.now() - T0) / 1000).toFixed(1)}s`);
const isClean = params.get('clean') === '1';
if (isClean) document.body.classList.add('clean');

/* 画质档位：URL 显式指定优先，否则按设备能力判断 */
const qualityInfo = detectQuality(params);
let quality = qualityInfo.level;
let Q = QUALITY_LEVELS[quality];
const qualityForced = qualityInfo.forced;
/* 截图 / 自动测试模式不自动降档，保证 renders 可复现 */
const autoDowngrade = !qualityForced && !isClean && params.get('autoq') !== '0';

/* ------------------------------------------------------------------ */
/* renderer / scene / camera                                           */
/* ------------------------------------------------------------------ */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = Q.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
/* 关闭 autoReset，让 __perf() 统计整帧所有 pass 的 draw call */
renderer.info.autoReset = false;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xb3907c, 0.002);

const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.5, 7000);
camera.position.set(-330, 215, 405);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.target.set(0, 12, -10);
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 30;
controls.maxDistance = 1400;

/* ------------------------------------------------------------------ */
/* materials / environment                                             */
/* ------------------------------------------------------------------ */
const m = createMaterials();
Object.entries(m).forEach(([name, mat]) => { if (mat && mat.isMaterial) mat.name = name; });
mark('materials');
const { sky, uniforms: skyUniforms } = createSky();
scene.add(sky);
const lights = createLights();
lights.sun.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
scene.add(lights.sun, lights.sun.target, lights.hemi, lights.ambient, lights.fill);

/* ---------- PMREM 环境贴图：复用天空 shader，每个预设生成一次并缓存 ---------- */
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
const envScene = new THREE.Scene();
const envSky = new THREE.Mesh(new THREE.SphereGeometry(40, 48, 32), sky.material);
envScene.add(envSky);
const envCache = new Map();
let pmremKey = '';

function rebuildEnvironment(presetKey) {
  if (presetKey === pmremKey) return;
  pmremKey = presetKey;
  let env = envCache.get(presetKey);
  if (!env) {
    env = pmrem.fromScene(envScene, 0.02, 0.1, 100).texture;
    env.name = 'pmrem-' + presetKey;
    envCache.set(presetKey, env);
  }
  scene.environment = env;
  renderer.setRenderTarget(null);
}

/**
 * 环境反射强度：金属/玻璃高、混凝土/植被低。
 * 再乘预设系数，避免夜景泛灰或日景过曝。
 */
const ENV_INTENSITY = {
  steel: 0.95, steelLight: 0.85, steelDark: 0.85, painted: 0.42,
  insulation: 0.38, insulationDirty: 0.3, shell: 0.5, shellWhite: 0.5, rust: 0.25,
  pipeSilver: 1.0, pipeGray: 0.92, pipeYellow: 0.62, pipeOrange: 0.55,
  pipeGreen: 0.55, pipeRed: 0.58,
  concrete: 0.12, concreteSmooth: 0.16, asphalt: 0.07, gravel: 0.08,
  grass: 0.06, grating: 0.7, roadLine: 0.1,
  railing: 0.68, railingGray: 0.75, ladder: 0.8, cable: 0.18, roof: 0.32,
  building: 0.2, buildingWarm: 0.16, window: 0.5, glass: 1.35,
  water: 1.25, treeLeaf: 0.07, treeLeaf2: 0.07, trunk: 0.08,
  carBody: 0.8, carDark: 0.65, tankTruck: 0.8, fireRed: 0.5, blue: 0.55,
  lampWarm: 0.2, lampCool: 0.2, beacon: 0.15,
};
const ENV_PRESET_SCALE = { dusk: 0.9, day: 1.0, night: 0.68, default: 0.9 };

function applyMaterialEnv(presetKey = 'dusk') {
  const ps = ENV_PRESET_SCALE[presetKey] ?? ENV_PRESET_SCALE.default;
  for (const [name, mat] of Object.entries(m)) {
    if (!mat || !mat.isMeshStandardMaterial || mat.transparent) continue;
    const base = ENV_INTENSITY[name];
    if (base === undefined) continue;
    mat.envMapIntensity = base * ps;
  }
}

const ground = createGround(m);
ground.name = 'ground';
scene.add(ground);
scene.add(createHills(m));

/* 冷启动：默认读取构建期烘焙快照；?procedural=1 回退到实时建模 */
const usePrebaked = params.get('procedural') !== '1' && params.get('prebaked') !== '0';
let plant = null;
let labels = null;
let nightGlow = null;
let usingPrebaked = false;
const loadingEl = document.getElementById('loading');
const setLoading = (text) => { if (loadingEl) loadingEl.textContent = text; };

if (usePrebaked) {
  try {
    const tSnap = performance.now();
    const snap = await loadPlantSnapshot(m, {
      jsonUrl: './assets/baked.json',
      binUrl: './assets/baked.bin',
      meta: BAKED_META,
      onProgress: (p, text) => setLoading(text),
    });
    const tLoad = performance.now();
    plant = snap.root;
    const decor = createPlantDecor(m);
    plant.add(decor.root);
    labels = decor.labels;
    nightGlow = decor.nightGlow;
    usingPrebaked = true;
    console.log(`[snapshot] load ${((tLoad - tSnap) / 1000).toFixed(1)}s decor ${((performance.now() - tLoad) / 1000).toFixed(1)}s`);
    mark(`plant prebaked ${(snap.bytes / 1048576).toFixed(1)}MB/${snap.vertexCount} verts`);
  } catch (err) {
    console.warn('[prebaked] 快照不可用，回退实时建模：', err.message);
  }
}
if (!plant) {
  const built = createPlant(m);
  plant = built.root;
  labels = built.labels;
  nightGlow = built.nightGlow;
  mark('plant built');
}
scene.add(plant);
window.__prebaked = usingPrebaked;

// night point lights
const nightLights = [];
for (const [x, y, z, color, dist] of [
  [-48, 24, -30, 0xffc27a, 150],
  [70, 26, -70, 0xffbe72, 140],
  [112, 24, -52, 0xffc27a, 120],
  [172, 42, -120, 0xff9a45, 150],
  [-160, 16, -40, 0xffc98c, 130],
  [172, 9, 74, 0xffd0a0, 110],
  [8, 14, 8, 0xffd6a8, 110],
  [44, 20, 18, 0xffcf96, 130],
  [100, 18, -30, 0xffc27a, 120],
  [-30, 16, 86, 0xffd6a8, 100],
  [-160, 18, 55, 0xffc98c, 120],
  [120, 16, 146, 0xffd6a8, 100],
]) {
  const l = new THREE.PointLight(color, 1100, dist, 2);
  l.visible = false;
  l.position.set(x, y, z);
  scene.add(l);
  nightLights.push(l);
}

/* ------------------------------------------------------------------ */
/* post processing                                                     */
/* ------------------------------------------------------------------ */
const size = new THREE.Vector2(innerWidth, innerHeight);
const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, {
  type: THREE.HalfFloatType,
  samples: 4,
});
/* AO / DOF 需要 RenderPass 的深度；composer 的缓冲都会带 depthTexture */
const depthTexture = new THREE.DepthTexture(innerWidth, innerHeight);
depthTexture.type = THREE.UnsignedIntType;
rt.depthTexture = depthTexture;
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(renderer.getPixelRatio());
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const dofPass = new DepthOfFieldPass(camera, composer.readBuffer.depthTexture, { maxBlur: 8.0 });
dofPass.enabled = false;
composer.addPass(dofPass);

const ssaoPass = new SSAOPass(camera, composer.readBuffer.depthTexture, { radius: 1.05, intensity: 0.58, bias: 0.04 });
ssaoPass.enabled = false;
composer.addPass(ssaoPass);

const bloom = new UnrealBloomPass(size.clone(), 0.55, 0.7, 0.82);
composer.addPass(bloom);
const outputPass = new OutputPass();
composer.addPass(outputPass);

const cinematic = new CinematicPass();
composer.addPass(cinematic);

const fxaaPass = new FXAAPass();
composer.addPass(fxaaPass);

/* 曝光自适应：16x16 亮度采样，每 2s 更新一次，幅度 ±8% */
const lumaMeter = createLuminanceMeter();
let baseExposure = 1.0;
let exposureScale = 1.0;
let lumaTimer = 0;
let measuredLuma = 0.45;
let autoExposureEnabled = params.get('autoexposure') !== '0';
const TARGET_LUMA = { dusk: 0.45, day: 0.54, night: 0.3, default: 0.45 };

/* 景深调度：机位截图 / 巡游启用；拖拽、流程标签时关闭 */
let dofHold = 0;
let dofMode = params.get('dof') === '1' ? 'on' : (params.get('dof') === '0' ? 'off' : 'auto');
let interacting = false;
let currentShot = 'aerial';
let currentPreset = PRESETS.dusk;
let currentPresetKey = 'dusk';
let interact = null;

function updateDofState() {
  let want = false;
  if (dofMode === 'on') want = quality === 'high' && !labels.visible;
  else if (dofMode === 'auto') {
    want = quality === 'high' && !labels.visible && !interacting &&
      (dofHold > 0 || (anim?.isActive?.() && anim.state.cruise === true));
  }
  dofPass.enabled = !!want;
}

/* ------------------------------------------------------------------ */
/* quality / perf                                                      */
/* ------------------------------------------------------------------ */
let qualityBtn = null;
let statsEl = null;
let statsVisible = params.get('stats') === '1';
let perf = { fps: 0, calls: 0, triangles: 0 };
let frameCount = 0;
let fpsWindowStart = performance.now();
let lowFpsTime = 0;
let autoQStart = 0;
let lastQualityChange = performance.now();

function updateStatsDom() {
  if (!statsEl || !statsVisible) return;
  statsEl.textContent =
    `${perf.fps.toFixed(0)} FPS  ·  ${perf.calls} calls  ·  ${(perf.triangles / 1000).toFixed(0)}k tris\n` +
    `${quality.toUpperCase()}  ·  dpr ${renderer.getPixelRatio().toFixed(2)}  ·  AO ${ssaoPass.enabled ? 'on' : 'off'}`;
}

function updateQualityButton() {
  if (qualityBtn) qualityBtn.textContent = `画质 ${Q.label}`;
}

function setShadowMapSize() {
  const sh = lights.sun.shadow;
  sh.mapSize.set(Q.shadowMap, Q.shadowMap);
  if (sh.map) { sh.map.dispose(); sh.map = null; }
  renderer.shadowMap.needsUpdate = true;
}

function applyQuality(level, { announce = false } = {}) {
  if (!QUALITY_LEVELS[level]) return false;
  quality = level;
  Q = QUALITY_LEVELS[level];
  window.__quality = quality;

  const pr = Math.min(window.devicePixelRatio || 1, Q.pixelRatio);
  renderer.setPixelRatio(pr);
  composer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);

  renderer.shadowMap.enabled = Q.shadows;
  setShadowMapSize();
  bloom.enabled = Q.bloom;
  bloom.strength = currentPreset.bloom.strength * Q.bloomScale;
  ssaoPass.enabled = Q.ao;
  contactShadows.visible = Q.contactShadows;
  fxaaPass.enabled = Q.fxaa;
  if (!Q.dof) dofHold = 0;
  if (!Q.contactShadows) contactShadows.visible = false;

  nightLights.forEach((l, i) => { l.visible = currentPreset.stars > 0.3 && i < Q.pointLights; });
  nightGlow.visible = currentPreset.stars > 0.3;
  updateDofState();
  updateQualityButton();
  updateStatsDom();
  lastQualityChange = performance.now();
  lumaTimer = 0;
  exposureScale = 1.0;
  renderer.toneMappingExposure = baseExposure;

  if (contactShadows && !Q.ao) contactShadows.visible = Q.contactShadows;
  window.__quality = quality;
  if (announce) console.info(`[quality] ${quality} (dpr ${pr.toFixed(2)}, shadow ${Q.shadowMap}, bloom ${Q.bloom}, ao ${Q.ao})`);
  renderStats();
  return true;
}

function bindQualityHud() {
  if (isClean) return;
  qualityBtn = document.getElementById('quality-btn');
  statsEl = document.getElementById('perf');
  if (statsEl) statsEl.style.display = statsVisible ? 'block' : 'none';
  if (qualityBtn) {
    updateQualityButton();
    qualityBtn.addEventListener('click', () => {
      const order = ['high', 'mid', 'low'];
      const next = order[(order.indexOf(quality) + 1) % order.length];
      applyQuality(next, { announce: true });
    });
  }
  addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'P') {
      statsVisible = !statsVisible;
      if (statsEl) statsEl.style.display = statsVisible ? 'block' : 'none';
      updateStatsDom();
    }
  });
}
bindQualityHud();

/* ------------------------------------------------------------------ */
/* shots                                                               */
/* ------------------------------------------------------------------ */
const SHOTS = {
  aerial: {
    label: '全景鸟瞰', pos: [-365, 152, 432], target: [0, 26, -12], fov: 38, preset: 'dusk',
  },
  hero: {
    label: '主装置区', pos: [-178, 46, 208], target: [-18, 34, -44], fov: 43, preset: 'dusk',
  },
  cdu: {
    label: '常减压装置', pos: [44, 15, 32], target: [-45, 30, -40], fov: 47, preset: 'dusk',
  },
  tanks: {
    label: '罐区', pos: [-252, 14, 26], target: [-152, 12, -32], fov: 46, preset: 'dusk',
  },
  fcc: {
    label: '催化裂化', pos: [2, 14, 8], target: [100, 34, -88], fov: 48, preset: 'dusk',
  },
  night: {
    label: '夜景', pos: [-300, 82, 336], target: [0, 30, -26], fov: 40, preset: 'night',
  },
  flow: {
    label: '流程示意', pos: [-300, 200, 392], target: [0, 20, -10], fov: 40, preset: 'dusk', labels: true,
  },
  day: {
    label: '日景鸟瞰', pos: [-365, 152, 432], target: [0, 26, -12], fov: 38, preset: 'day',
  },
  top: {
    label: '总图俯视', pos: [-70, 420, 175], target: [-10, 0, -8], fov: 42, preset: 'day',
  },
};

function syncBar(name) {
  document.querySelectorAll('#bar button').forEach((b) => b.classList.toggle('active', b.dataset.shot === name));
}

/** 应用光照预设（机位与 HUD 各自负责，方便动画模式复用） */
function applyLook(p) {
  currentPreset = p;
  currentPresetKey = Object.keys(PRESETS).find((k) => PRESETS[k] === p) || 'dusk';
  applyPreset(p, { skyUniforms, lights, scene, renderer });
  rebuildEnvironment(currentPresetKey);
  applyMaterialEnv(currentPresetKey);

  // emissive tuning
  m.lampWarm.emissiveIntensity = p.lampWarm;
  m.lampCool.emissiveIntensity = p.lampWarm * 0.8;
  m.window.emissiveIntensity = p.stars > 0.3 ? 1.8 : 0.28;
  m.beacon.emissiveIntensity = p.stars > 0.3 ? 7 : 2;
  m.flame.opacity = p.stars > 0.3 ? 1.0 : 0.9;

  bloom.strength = p.bloom.strength * Q.bloomScale;
  bloom.radius = p.bloom.radius;
  bloom.threshold = p.bloom.threshold;

  baseExposure = p.exposure * 0.90;
  exposureScale = 1.0;
  renderer.toneMappingExposure = baseExposure;

  const night = p.stars > 0.3;
  nightLights.forEach((l, i) => { l.visible = night && i < Q.pointLights; });
  nightGlow.visible = night;
  updateStatsDom();
  renderStats?.();
}

/**
 * 阴影相机按机位收紧：远景覆盖全场，近景只覆盖焦区，显著提升阴影分辨率。
 * 相机拖拽时按 0.5s 节流重算，避免每帧抖动。
 */
let lastShadowUpdate = 0;
let lastShadowCam = new THREE.Vector3(1e9, 1e9, 1e9);
function focusSunShadow(force = false) {
  const now = performance.now();
  if (!force && now - lastShadowUpdate < 500) return;
  const camDist = camera.position.distanceTo(controls.target);
  if (!force && camera.position.distanceToSquared(lastShadowCam) < 4) return;
  lastShadowUpdate = now;
  lastShadowCam.copy(camera.position);

  const wide = ['aerial', 'day', 'flow', 'night'].includes(currentShot);
  let radius;
  if (currentShot === 'top') radius = 320;
  else if (wide) radius = 330;
  else radius = THREE.MathUtils.clamp(camDist * 0.72, 95, 240);

  const dir = new THREE.Vector3(...(currentPreset.sunDir || [-0.5, 0.4, 0.6])).normalize();
  const target = controls.target.clone();
  // 近景把焦区稍微向镜头方向偏移，覆盖塔器底部与前景设备
  if (!wide) target.addScaledVector(camera.position.clone().sub(target).normalize(), radius * 0.12);

  lights.sun.target.position.copy(target);
  lights.sun.target.updateMatrixWorld();
  lights.sun.position.copy(target).addScaledVector(dir, 500);
  const sc = lights.sun.shadow.camera;
  sc.left = -radius; sc.right = radius;
  sc.top = radius; sc.bottom = -radius;
  sc.near = 20; sc.far = 1050;
  sc.updateProjectionMatrix();
  lights.sun.shadow.needsUpdate = true;
}

function setShot(name) {
  if (interact) interact.cancel();
  if (name === 'process') {
    // 进入工艺流程动画模式
    currentShot = 'process';
    dofHold = 0;
    updateDofState();
    anim.enter({ stage: 0, immediate: false });
    if (!isClean) {
      syncBar('process');
      if (history.replaceState) history.replaceState(null, '', '?shot=process');
    }
    return 'process';
  }

  // 普通机位：退出动画演示（环境动效保留）
  anim.exit();

  const s = SHOTS[name] || SHOTS.aerial;
  currentShot = name;
  const p = PRESETS[s.preset] || PRESETS.dusk;

  camera.fov = s.fov;
  camera.updateProjectionMatrix();
  camera.position.set(...s.pos);
  controls.target.set(...s.target);
  camera.lookAt(new THREE.Vector3(...s.target));
  controls.update();

  labels.visible = !!s.labels;
  document.body.classList.toggle('flow', !!s.labels);

  applyLook(p);
  focusSunShadow(true);
  dofHold = quality === 'high' ? 2.6 : 0;
  updateDofState();
  lowFpsTime = 0;

  if (!isClean) {
    syncBar(name);
    if (history.replaceState) history.replaceState(null, '', `?shot=${name}`);
  }
  return name;
}

/* ------------------------------------------------------------------ */
/* HUD                                                                 */
/* ------------------------------------------------------------------ */
if (!isClean) {
  const bar = document.getElementById('bar');
  Object.entries(SHOTS).forEach(([key, s], i) => {
    const b = document.createElement('button');
    b.textContent = `${i + 1} · ${s.label}`;
    b.dataset.shot = key;
    b.onclick = () => setShot(key);
    bar.appendChild(b);
  });
  // 进入工艺流程动画的专用按钮（不计入原有 9 个机位）
  const ab = document.createElement('button');
  ab.textContent = '▶ 工艺流程动画';
  ab.dataset.shot = 'process';
  ab.className = 'animshot';
  ab.onclick = () => setShot('process');
  bar.appendChild(ab);

  addEventListener('keydown', (e) => {
    const keys = Object.keys(SHOTS);
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= keys.length) setShot(keys[n - 1]);
  });
}

/* ------------------------------------------------------------------ */
/* bake static geometry, then render                                   */
/* ------------------------------------------------------------------ */
if (!usingPrebaked) bakeStatic(plant);
bakeStatic(ground);
mark('geometry baked');

/* 接触阴影在 bake 之后加入，避免被合并进静态几何 */
const contactShadows = createContactShadows();
contactShadows.visible = Q.contactShadows;
scene.add(contactShadows);
mark('contact shadows');

/* ------------------------------------------------------------------ */
/* 工艺流程动画（在 bakeStatic 之后创建，避免被合并）                     */
/* ------------------------------------------------------------------ */
const anim = createAnimation({
  scene,
  camera,
  controls,
  m,
  plant,
  labels,
  setLook: (key) => applyLook(PRESETS[key] || PRESETS.dusk),
  isNight: () => currentPreset.stars > 0.3,
});
anim.onModeChange = (on) => {
  if (on) {
    syncBar('process');
  } else if (!isClean) {
    syncBar(currentShot);
  }
};

/* ------------------------------------------------------------------ */
/* 设备交互（在 bakeStatic 之后创建不可见拾取代理）                       */
/* ------------------------------------------------------------------ */
interact = createInteraction({
  scene, camera, controls, renderer, anim, labels,
  onFocus: () => {
    // 聚焦某台设备时退出流程示意 / 动画演示，避免相机被再次接管
    anim.exit();
    document.body.classList.remove('flow');
    labels.visible = false;
    dofHold = 0;
    updateDofState();
    if (!isClean) syncBar('');
  },
});

/* 初始应用一次档位（此时 anim / contactShadows 已就绪） */
applyQuality(quality, { announce: false });

/* 交互拖拽时关闭景深，避免卡顿 */
controls.addEventListener('start', () => {
  interacting = true;
  dofHold = 0;
  updateDofState();
});
controls.addEventListener('end', () => {
  interacting = false;
  updateDofState();
});

let lastFrame = performance.now();

function renderStats() {
  updateStatsDom();
}

function render() {
  cinematic.material.uniforms.uTime.value = anim.time;
  cinematic.material.uniforms.uExposure.value = 1.0;
  sky.position.copy(camera.position);

  // RenderPass 的目标会因 pass 开关在 rt1/rt2 之间切换，每帧绑定当前深度
  const depth = composer.readBuffer.depthTexture;
  if (depth) {
    dofPass.depthTexture = depth;
    dofPass.material.uniforms.tDepth.value = depth;
    ssaoPass.depthTexture = depth;
    ssaoPass.material.uniforms.tDepth.value = depth;
  }
  if (dofPass.enabled) dofPass.setFocus(camera.position.distanceTo(controls.target));

  renderer.info.reset();
  composer.render();
  perf.calls = renderer.info.render.calls;
  perf.triangles = renderer.info.render.triangles;
}

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  anim.update(dt);
  controls.update();
  if (interact) interact.update(dt);

  if (dofHold > 0) { dofHold -= dt; if (dofHold <= 0) updateDofState(); }
  focusSunShadow();
  updateDofState();
  render();

  // ---- FPS / 自动降档（截图 clean 模式与显式 ?q= 不触发）----
  frameCount++;
  const win = now - fpsWindowStart;
  if (win >= 500) {
    perf.fps = (frameCount * 1000) / win;
    frameCount = 0;
    fpsWindowStart = now;
    if (autoDowngrade && window.__ready && now > autoQStart && !document.hidden) {
      if (perf.fps < 35) lowFpsTime += win / 1000;
      else lowFpsTime = 0;
      if (lowFpsTime >= 5 && quality !== 'low') {
        const order = ['high', 'mid', 'low'];
        const next = order[Math.min(order.length - 1, order.indexOf(quality) + 1)];
        console.info(`[quality] auto downgrade ${quality} -> ${next}: FPS ${perf.fps.toFixed(1)} < 35 for 5s`);
        applyQuality(next, { announce: true });
        lowFpsTime = 0;
      }
    } else {
      lowFpsTime = 0;
    }
    updateStatsDom();
  }

  // ---- 曝光自适应：2s 采样一次，缓慢向目标亮度靠拢 ----
  if (autoExposureEnabled && window.__ready && !document.hidden) {
    lumaTimer += dt;
    if (lumaTimer >= 2) {
      lumaTimer = 0;
      measuredLuma = lumaMeter.sample(renderer, composer.readBuffer.texture);
      const target = TARGET_LUMA[currentPresetKey] ?? TARGET_LUMA.default;
      if (measuredLuma > 0.03 && measuredLuma < 0.9) {
        const ratio = THREE.MathUtils.clamp(target / measuredLuma, 0.92, 1.08);
        exposureScale = THREE.MathUtils.lerp(exposureScale, ratio, 0.35);
        renderer.toneMappingExposure = baseExposure * exposureScale;
      }
      updateStatsDom();
    }
  }
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.setSize(innerWidth, innerHeight);
  dofPass.setSize(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());
  ssaoPass.setSize(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());
  fxaaPass.setSize(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());
  cinematic.setSize(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());
}
addEventListener('resize', onResize);

/* API for screenshots / 性能与画质 */
window.__shots = Object.keys(SHOTS);
window.__quality = quality;
window.__setQuality = (q) => {
  const ok = applyQuality(String(q || '').toLowerCase(), { announce: true });
  if (!ok) return { error: 'unknown quality', quality };
  dofHold = quality === 'high' ? 2.6 : 0;
  updateDofState();
  render();
  return { quality, pixelRatio: renderer.getPixelRatio() };
};
window.__perf = () => ({
  fps: +perf.fps.toFixed(1),
  calls: perf.calls,
  triangles: perf.triangles,
  quality,
  pixelRatio: +renderer.getPixelRatio().toFixed(2),
  measuredLuma: +measuredLuma.toFixed(3),
  exposure: +renderer.toneMappingExposure.toFixed(3),
  ao: ssaoPass.enabled,
  dof: dofPass.enabled,
  fxaa: fxaaPass.enabled,
  bloom: bloom.enabled,
});
window.__bench = (n = 30) => {
  render();
  const t = performance.now();
  for (let i = 0; i < n; i++) render();
  return { frames: n, msPerFrame: +((performance.now() - t) / n).toFixed(2), fps: +(1000 / ((performance.now() - t) / n)).toFixed(1) };
};
window.__setStats = (on = true) => {
  statsVisible = !!on;
  if (statsEl) statsEl.style.display = statsVisible ? 'block' : 'none';
  updateStatsDom();
  return statsVisible;
};
window.__setDof = (on = true) => {
  dofMode = on ? 'on' : 'off';
  updateDofState();
  render();
  return dofPass.enabled;
};
window.__setAO = (on = true) => { ssaoPass.enabled = !!on; render(); return ssaoPass.enabled; };
window.__setContactShadows = (on = true) => { contactShadows.visible = !!on; render(); return contactShadows.visible; };
window.__setBloom = (on = true) => { bloom.enabled = !!on; render(); return bloom.enabled; };
window.__setFXAA = (on = true) => { fxaaPass.enabled = !!on; render(); return fxaaPass.enabled; };
window.__setCinematic = (on = true) => { cinematic.enabled = !!on; render(); return cinematic.enabled; };
window.__setExposure = (v = 1) => { exposureScale = 1; baseExposure = Number(v) || 1; renderer.toneMappingExposure = baseExposure; render(); return baseExposure; };
window.__shadowInfo = () => ({
  mapSize: lights.sun.shadow.mapSize.toArray(),
  left: +lights.sun.shadow.camera.left.toFixed(1),
  right: +lights.sun.shadow.camera.right.toFixed(1),
  near: +lights.sun.shadow.camera.near.toFixed(1),
  far: +lights.sun.shadow.camera.far.toFixed(1),
  target: lights.sun.target.position.toArray().map((v) => +v.toFixed(1)),
});
window.__qualityInfo = () => ({ ...qualityInfo, active: quality });
window.__setShot = (name) => {
  setShot(name);
  render();
  return { shot: currentShot, labels: labels.visible, quality };
};
window.__renderOnce = render;

/* ------------------------------------------------------------------ */
/* 工艺流程动画 API（可复现截图）                                        */
/* ------------------------------------------------------------------ */
window.__setStage = (i = 0) => {
  const idx = Math.max(0, Math.min(anim.stages.length - 1, parseInt(i, 10) || 0));
  if (!anim.isActive()) anim.enter({ stage: idx, immediate: true, playing: false });
  else anim.gotoStage(idx, { immediate: true });
  anim.state.overview = false;
  labels.visible = false;
  render();
  return { stage: idx, name: anim.stages[idx].cn };
};
window.__animOverview = () => {
  anim.overview();
  anim.state.overview = true;
  labels.visible = true;
  render();
  return 'overview';
};
window.__setAnimTime = (t = 0) => {
  anim.setTime(t);
  render();
  return anim.state.time;
};
window.__pauseAnim = () => {
  anim.pause();
  render();
  return false;
};
window.__playAnim = () => {
  anim.play();
  render();
  return true;
};
window.__setAnimSpeed = (x = 1) => {
  anim.setSpeed(x);
  return anim.state.speed;
};
window.__setCruise = (b = true) => {
  anim.setCruise(b);
  return anim.state.cruise;
};
window.__animState = () => ({
  active: anim.state.active,
  overview: anim.state.overview,
  playing: anim.state.playing,
  cruise: anim.state.cruise,
  speed: anim.state.speed,
  stage: anim.state.stage,
  stageElapsed: +anim.state.stageElapsed.toFixed(2),
  time: +anim.state.time.toFixed(2),
  streams: anim.streams.map((s) => ({ id: s.def.id, opacity: +s.opacity.toFixed(2) })),
});
window.__flowInfo = () => anim.streams.map((s) => ({
  id: s.def.id, color: s.def.color, stages: s.def.stages, points: s.def.points,
}));
window.__project = (x, y, z) => {
  const p = new THREE.Vector3(x, y, z).project(camera);
  return {
    px: Math.round((p.x * 0.5 + 0.5) * innerWidth),
    py: Math.round((-p.y * 0.5 + 0.5) * innerHeight),
    front: p.z < 1,
  };
};
/* 调试：直接设置机位 / 检查关键点是否被前景遮挡 */
window.__setCam = (pos, target, fov) => {
  camera.position.set(...pos);
  controls.target.set(...target);
  camera.fov = fov;
  camera.updateProjectionMatrix();
  camera.lookAt(controls.target);
  controls.update();
  render();
  return 'ok';
};
window.__spot = (v) => {
  anim.spot.intensity = v;
  anim.spot.visible = v > 0;
  render();
  return v;
};
window.__occlude = (pts) => {
  const ray = new THREE.Raycaster();
  const meshes = [];
  plant.traverse((o) => {
    if (o.isMesh && o.material && !o.material.transparent) meshes.push(o);
  });
  const out = [];
  for (const p of pts) {
    const target = new THREE.Vector3(p[0], p[1], p[2]);
    const dir = target.clone().sub(camera.position);
    const dist = dir.length();
    ray.set(camera.position, dir.normalize());
    ray.far = Math.max(0.1, dist - 1.5);
    const hits = ray.intersectObjects(meshes, false);
    out.push({ p, occluded: hits.length > 0, hit: hits[0] ? +hits[0].distance.toFixed(1) : null });
  }
  return out;
};

const initial = params.get('shot') || 'aerial';
setShot(initial);
render();
mark('first frame');
animate();

// ?anim=1&stage=0&t=6 直接进入动画演示（便于无头截图）
if (params.get('anim') === '1') {
  const st = Math.max(0, Math.min(anim.stages.length - 1, parseInt(params.get('stage') || '0', 10) || 0));
  anim.enter({
    stage: st,
    immediate: true,
    playing: params.get('playing') !== '0',
    cruise: params.get('cruise') !== '0',
  });
  if (params.get('t') != null) anim.setTime(parseFloat(params.get('t')) || 0);
  if (params.get('labels') === '1') labels.visible = true;
  render();
}

const loading = document.getElementById('loading');
if (loading) {
  loading.style.opacity = '0';
  setTimeout(() => loading.remove(), 700);
}

window.__ready = true;
window.__animReady = true;
autoQStart = performance.now() + 6000;
console.log('[refinery] ready', JSON.stringify({ shots: Object.keys(SHOTS), stages: anim.stages.length }));
/* debug helpers (not used in production views) */
window.__debug = (opts = {}) => {
  const { fog = true, sky: skyOn = true, bloom: bloomOn = true, cinematic: cineOn = true } = opts;
  scene.fog = fog ? new THREE.FogExp2(currentPreset.fog, currentPreset.fogDensity) : null;
  sky.visible = skyOn;
  bloom.enabled = bloomOn;
  cinematic.enabled = cineOn;
  renderer.shadowMap.enabled = opts.shadows !== false;
  render();
  return { fog, sky: skyOn, bloom: bloomOn, cinematic: cineOn };
};
window.__probe = () => {
  const pts = {
    site: [0, 0, 0], cduBase: [-48, 3, -30], cduTop: [-48, 56, -30], fcc: [90, 34, -80],
    flare: [172, 74, -120], tanks: [-160, 9, -55], loading: [172, 8, 74], admin: [-110, 6, 150],
    cool: [-22, 14, 88],
  };
  const out = {};
  for (const [k, v] of Object.entries(pts)) {
    const p = new THREE.Vector3(...v).project(camera);
    out[k] = {
      ndc: [+p.x.toFixed(2), +p.y.toFixed(2)],
      px: [Math.round((p.x * 0.5 + 0.5) * innerWidth), Math.round((-p.y * 0.5 + 0.5) * innerHeight)],
    };
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* 构建期快照导出（tools/build-baked.mjs 使用）                          */
/* ------------------------------------------------------------------ */
let snapshotCache = null;
window.__buildSnapshot = () => {
  if (snapshotCache) return snapshotCache.meta;
  const items = [];
  const chunks = [];
  const materials = new Set();
  let bytes = 0;
  const put = (arr, desc) => {
    const pad = (4 - (bytes % 4)) % 4;
    if (pad) { chunks.push(new Uint8Array(pad)); bytes += pad; }
    const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    desc.offset = bytes;
    chunks.push(u8);
    bytes += u8.length;
  };
  plant.traverse((o) => {
    if (!o.isMesh || !o.userData.baked || !o.geometry) return;
    const g = o.geometry;
    if (!g.attributes.position || !g.attributes.normal || !g.attributes.uv || !g.index) return;
    const pos = g.attributes.position.array;
    const nor = g.attributes.normal.array;
    const uv = g.attributes.uv.array;
    const idx = g.index.array instanceof Uint32Array ? g.index.array : Uint32Array.from(g.index.array);
    const item = {
      material: o.userData.bakeMaterial || o.material.name || '',
      castShadow: !!o.castShadow,
      receiveShadow: !!o.receiveShadow,
      position: { count: g.attributes.position.count },
      normal: { count: g.attributes.normal.count },
      uv: { count: g.attributes.uv.count },
      index: { count: idx.length },
    };
    materials.add(item.material);
    put(pos, item.position);
    put(nor, item.normal);
    put(uv, item.uv);
    put(idx, item.index);
    items.push(item);
  });
  const all = new Uint8Array(bytes);
  let off = 0;
  for (const c of chunks) { all.set(c, off); off += c.length; }
  const meta = { version: 1, generator: 'refinery3d/bakeStatic', bytes, materials: [...materials], items };
  snapshotCache = { meta, all };
  return meta;
};
window.__snapshotChunk = (index, size = 4 * 1024 * 1024) => {
  if (!snapshotCache) return null;
  const start = index * size;
  if (start >= snapshotCache.all.length) return null;
  const view = snapshotCache.all.subarray(start, Math.min(snapshotCache.all.length, start + size));
  let str = '';
  for (let i = 0; i < view.length; i += 0x8000) {
    str += String.fromCharCode.apply(null, view.subarray(i, i + 0x8000));
  }
  return btoa(str);
};

/* clay / silhouette debug view */
window.__clay = () => {
  const clay = new THREE.MeshStandardMaterial({ color: 0xd6dade, roughness: 0.8, metalness: 0.02 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23282c, roughness: 0.95, metalness: 0.0 });
  const seen = new Set();
  scene.traverse((o) => {
    if (!o.isMesh || o.isSprite) return;
    if (o.material && o.material.isMeshBasicMaterial) return;
    const flat = o.geometry.type === 'PlaneGeometry' || o.geometry.type === 'RingGeometry' || o.geometry.type === 'CircleGeometry';
    o.material = flat ? dark : clay;
    seen.add(o);
  });
  scene.traverse((o) => { if (o.isSprite) o.visible = false; });
  sky.visible = false;
  scene.fog = null;
  scene.background = new THREE.Color(0x0e1216);
  cinematic.enabled = false;
  fxaaPass.enabled = false;
  ssaoPass.enabled = false;
  dofPass.enabled = false;
  bloom.enabled = false;
  lights.sun.position.set(-0.4, 0.85, 0.35).multiplyScalar(400);
  lights.sun.intensity = 3.2;
  lights.hemi.intensity = 0.9;
  lights.ambient.intensity = 0.35;
  renderer.toneMappingExposure = 1.0;
  render();
  return 'clay';
};

/* ------------------------------------------------------------------ */
/* 设备交互 API                                                         */
/* ------------------------------------------------------------------ */
window.__equipReady = true;
window.__equipList = () => interact.list();
window.__selectEquip = (id) => {
  const cn = interact.selectById(id);
  render();
  return cn;
};
window.__focusEquip = (id, immediate = false) => {
  const cn = interact.focusById(id, immediate);
  render();
  return cn;
};
window.__equipState = () => interact.state();
window.__equipClose = () => {
  interact.close();
  render();
  return true;
};

window.__labelProbe = () => labels.children.filter((o) => o.isSprite).map((o) => {
  const p = o.position.clone().project(camera);
  return { px: [Math.round((p.x * 0.5 + 0.5) * innerWidth), Math.round((-p.y * 0.5 + 0.5) * innerHeight)], wpx: Math.round((o.scale.x / (2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.distanceTo(o.position))) * innerWidth) };
});
