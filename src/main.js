import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createMaterials } from './materials.js';
import { createSky, createLights, createGround, createGroundLite, createHills, applyPreset, PRESETS } from './environment.js';
import { createPlant, createPlantDecor } from './plant.js';
import { addStructureDetails } from './details.js';
import { createWeather } from './weather.js';
import { createMotion } from './motion.js';
import { bakeStatic } from './helpers.js';
import { createAnimation } from './animation.js';
import { createExplorer } from './explorer.js';
import { createShare } from './share.js';
import { createAudio } from './audio.js';
import { createExporters } from './exporters.js';
import { createXray } from './xray.js';
import { createProcessPanel } from './processpanel.js';
import { createQrShare } from './qrshare.js';
import { validateBalance } from './data/process.js';
import { createTour } from './tour.js';
import { createInteraction } from './interaction.js';
import { createContactShadows } from './contacts.js';
import { QUALITY_LEVELS, detectQuality } from './quality.js';
import { SSAOPass, FXAAPass, CinematicPass, DepthOfFieldPass, createLuminanceMeter } from './postfx.js';
import { fetchSnapshot, buildSnapshot } from './prebaked.js';
import { BAKED_META } from './bakedMeta.js';
import { mark, marksList, instrumentGL, glSummary, programTimings } from './prof.js';

const params = new URLSearchParams(location.search);
const T0 = performance.now();
const tlog = (label) => console.log(`[timing] ${label} ${((performance.now() - T0) / 1000).toFixed(1)}s`);
mark('main-module');
const isClean = params.get('clean') === '1';
if (isClean) document.body.classList.add('clean');

/* 画质档位：URL 显式指定优先，否则按设备能力判断 */
const qualityInfo = detectQuality(params);
let quality = qualityInfo.level;
let Q = QUALITY_LEVELS[quality];
const qualityForced = qualityInfo.forced;
/* 截图 / 自动测试模式不自动降档，保证 renders 可复现 */
let autoDowngrade = !qualityForced && !isClean && params.get('autoq') !== '0';
/* 分享链接里显式带画质档时钉住，避免几秒后被自动降档改掉 */
const pinQuality = (q) => { autoDowngrade = false; return q; };

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
mark('renderer');
const PROFILE = params.get('profile') === '1';
if (PROFILE) {
  try { instrumentGL(renderer.getContext()); } catch (e) { console.warn('[profile] GL hook failed', e); }
}

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
tlog('materials'); mark('materials');
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
let envMapReady = false;

function rebuildEnvironment(presetKey) {
  if (presetKey === pmremKey) return;
  pmremKey = presetKey;
  let env = envCache.get(presetKey);
  if (!env) {
    mark('pmrem-start');
    env = pmrem.fromScene(envScene, 0.02, 0.1, 100).texture;
    mark('pmrem-done');
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

/**
 * 首帧前的渲染预热：用一个极小的 probe 场景（每种材质一个 cube + 同一套灯光）
 * 走一遍 compile + draw，把 program 生成、uniform 定位、draw 代码路径的一次性
 * 开销提前支付，并与快照下载重叠。probe 渲染到 64×64 RT，不影响画面。
 */
function warmupRenderer() {
  const probe = new THREE.Scene();
  probe.fog = scene.fog;
  const geo = new THREE.BoxGeometry(2, 2, 2);
  const seen = new Set();
  for (const mat of Object.values(m)) {
    if (!mat || !mat.isMaterial || mat.isSpriteMaterial || seen.has(mat)) continue;
    seen.add(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    probe.add(mesh);
  }
  probe.add(new THREE.Mesh(new THREE.BoxGeometry(60, 60, 60), sky.material));
  const sun = lights.sun.clone();
  sun.castShadow = true;
  sun.shadow.mapSize.set(256, 256);
  probe.add(sun, sun.target);
  probe.add(lights.hemi.clone(), lights.ambient.clone(), lights.fill.clone());

  const rt = new THREE.WebGLRenderTarget(64, 64);
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  cam.position.set(0, 0, 8);
  cam.lookAt(0, 0, 0);
  renderer.setRenderTarget(rt);
  renderer.render(probe, cam);
  renderer.setRenderTarget(null);
  rt.dispose();
}

/* 冷启动：默认读取构建期烘焙快照；?procedural=1 回退到实时建模 */
const usePrebaked = params.get('procedural') !== '1' && params.get('prebaked') !== '0';
/* 先把快照下载挂起（与后续建模 / 着色器预热并行），再在需要时 await */
const snapshotPromise = usePrebaked ? fetchSnapshot({
  binUrl: './assets/baked.bin',
  gzUrl: './assets/baked.bin.gz',
  version: BAKED_META.bytes,
}).catch((err) => { console.warn('[prebaked] 下载失败：', err.message); return null; }) : Promise.resolve(null);
mark('snap-fetch-begin');

/* 轻量地面：完整地面 + 烘焙 + 远山推迟到 full 阶段（headless 下约 3–6s） */
const groundLite = createGroundLite(m);
scene.add(groundLite);
let plant = null;
let labels = null;
let nightGlow = null;
let usingPrebaked = false;
let decorTarget = null;
const loadingEl = document.getElementById('loading');
const setLoading = (text) => { if (loadingEl) loadingEl.textContent = text; };

if (usePrebaked) {
  try {
    const tSnap = performance.now();
    const buffer = await snapshotPromise;
    if (!buffer) throw new Error('snapshot download failed');
    mark('snap-fetched');
    const snap = buildSnapshot(buffer, BAKED_META, m, { onProgress: (p, text) => setLoading(text) });
    const tLoad = performance.now();
    plant = snap.root;
    /* 装饰（~150 个 sprite / 标签 / 蒸汽）延后到完整画质阶段创建：
     * 首帧少 1.2s 的 canvas 纹理生成与 ~150 个 draw call */
    labels = new THREE.Group();
    labels.name = 'labels';
    labels.visible = false;
    nightGlow = new THREE.Group();
    nightGlow.name = 'nightglow';
    nightGlow.visible = false;
    const decorRoot = new THREE.Group();
    decorRoot.name = 'plant-decor';
    plant.add(decorRoot, labels, nightGlow);
    decorTarget = { root: decorRoot, labels, nightGlow };
    usingPrebaked = true;
    console.log(`[snapshot] load ${((tLoad - tSnap) / 1000).toFixed(1)}s decor ${((performance.now() - tLoad) / 1000).toFixed(1)}s`);
    tlog(`plant prebaked ${(snap.bytes / 1048576).toFixed(1)}MB/${snap.vertexCount} verts`); mark('plant-prebaked');
  } catch (err) {
    console.warn('[prebaked] 快照不可用，回退实时建模：', err.message);
  }
}
if (!plant) {
  const built = createPlant(m);
  plant = built.root;
  labels = built.labels;
  nightGlow = built.nightGlow;
  tlog('plant built'); mark('plant-built');
}
/* B2：装置细节（钢构 / 平台 / 楼梯 / 桥架 / 消防立管 / 阀门组 / 保温捆扎带）。
 * 只在实时建模路径添加，预烘焙路径由快照携带（重建快照见 tools/build-baked.mjs） */
if (!usingPrebaked) { addStructureDetails(plant, m); mark('details-added'); }
scene.add(plant);
window.__prebaked = usingPrebaked;

/* ------------------------------------------------------------------ */
/* E1：Service Worker（应用壳缓存；?sw=0 禁用，clean 截图不注册）          */
/* ------------------------------------------------------------------ */
if (!isClean && params.get('sw') !== '0' && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  const swToast = document.getElementById('sw-toast');
  const swReload = document.getElementById('sw-reload');
  const swClose = document.getElementById('sw-close');
  const showSwToast = (show) => swToast?.classList.toggle('show', show);
  swClose?.addEventListener('click', () => showSwToast(false));
  swReload?.addEventListener('click', () => {
    navigator.serviceWorker.controller?.postMessage('SKIP_WAITING');
    location.reload();
  });
  const registerSw = () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        window.__swState = { registered: true, active: !!reg.active, scope: reg.scope };
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          nw?.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) showSwToast(true);
          });
        });
      })
      .catch((err) => {
        window.__swState = { registered: false, error: err.message };
        console.warn('[sw] 注册失败：', err.message);
      });
  };
  /* 注：main.js 有顶层 await（快照下载），load 事件可能早于本段执行，不能只依赖 load */
  window.__swState = { registered: false, pending: true };
  if (document.readyState === 'complete') registerSw();
  else addEventListener('load', registerSw, { once: true });
} else {
  window.__swState = { registered: false, skipped: true };
}

mark('lights-start');
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
  [61, 12, 42, 0xffd6a8, 110],
  [-40, 12, -22, 0xffd0a0, 110],
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
/* 后处理链延迟构建：EffectComposer / 各 pass 的全分辨率 RT 分配在 headless 下要好几秒，
 * 把它们移出「首帧可交互」关键路径，等轻量首帧上屏后再异步补齐。 */
let composer = null;
let renderPass = null;
let dofPass = null;
let ssaoPass = null;
let bloom = null;
let outputPass = null;
let cinematic = null;
let fxaaPass = null;
let postReady = false;

function buildPostFX() {
  if (postReady) return;
  const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  /* AO / DOF 需要 RenderPass 的深度；composer 的缓冲都会带 depthTexture */
  const depthTexture = new THREE.DepthTexture(innerWidth, innerHeight);
  depthTexture.type = THREE.UnsignedIntType;
  rt.depthTexture = depthTexture;
  composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(renderer.getPixelRatio());
  renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  dofPass = new DepthOfFieldPass(camera, composer.readBuffer.depthTexture, { maxBlur: 8.0 });
  dofPass.enabled = false;
  composer.addPass(dofPass);

  ssaoPass = new SSAOPass(camera, composer.readBuffer.depthTexture, { radius: 1.05, intensity: 0.58, bias: 0.04 });
  ssaoPass.enabled = false;
  composer.addPass(ssaoPass);

  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.7, 0.82);
  composer.addPass(bloom);
  outputPass = new OutputPass();
  composer.addPass(outputPass);

  cinematic = new CinematicPass();
  composer.addPass(cinematic);

  fxaaPass = new FXAAPass();
  composer.addPass(fxaaPass);
  postReady = true;
  }

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
  if (dofPass) dofPass.enabled = !!want;
}

/* ------------------------------------------------------------------ */
/* quality / perf                                                      */
/* ------------------------------------------------------------------ */
let qualityBtn = null;
let statsEl = null;
let statsVisible = params.get('stats') === '1';
let perf = { fps: 0, calls: 0, triangles: 0 };
let frameCount = 0;
let explorerCostMs = 0;
let tourCostMs = 0;
let uiFrames = 0;
let fpsWindowStart = performance.now();
let lowFpsTime = 0;
let autoQStart = 0;
let lastQualityChange = performance.now();

function updateStatsDom() {
  if (!statsEl || !statsVisible) return;
  statsEl.textContent =
    `${perf.fps.toFixed(0)} FPS  ·  ${perf.calls} calls  ·  ${(perf.triangles / 1000).toFixed(0)}k tris\n` +
    `${quality.toUpperCase()}  ·  dpr ${renderer.getPixelRatio().toFixed(2)}  ·  AO ${ssaoPass && ssaoPass.enabled ? 'on' : 'off'}`;
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

function applyQuality(level, { announce = false, boot = false } = {}) {
  if (!QUALITY_LEVELS[level]) return false;
  quality = level;
  Q = QUALITY_LEVELS[level];
  window.__quality = quality;

  /* boot：轻量首帧用 DPR 1 + 256 阴影贴图，先保证可交互；完整档位随后补齐 */
  const pr = boot ? 1 : Math.min(window.devicePixelRatio || 1, Q.pixelRatio);
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
  if (composer) { composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); }

  renderer.shadowMap.enabled = Q.shadows;
  if (boot) {
    // 轻量首帧：不渲染阴影贴图（省掉一次全场景 depth pass），只保留 shadow define 以复用 program
    const sh = lights.sun.shadow;
    sh.mapSize.set(256, 256);
    if (sh.map) { sh.map.dispose(); sh.map = null; }
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = false;
  } else {
    renderer.shadowMap.autoUpdate = true;
    setShadowMapSize();
  }
  if (bloom) {
    bloom.enabled = Q.bloom;
    bloom.strength = currentPreset.bloom.strength * Q.bloomScale;
  }
  if (ssaoPass) ssaoPass.enabled = Q.ao;
  if (fxaaPass) fxaaPass.enabled = Q.fxaa;
  if (contactShadows) contactShadows.visible = Q.contactShadows;
  if (!Q.dof) dofHold = 0;

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
  if (envMapReady) rebuildEnvironment(currentPresetKey);
  applyMaterialEnv(currentPresetKey);

  // emissive tuning
  m.lampWarm.emissiveIntensity = p.lampWarm;
  m.lampCool.emissiveIntensity = p.lampWarm * 0.8;
  m.window.emissiveIntensity = p.stars > 0.3 ? 1.8 : 0.28;
  m.beacon.emissiveIntensity = p.stars > 0.3 ? 7 : 2;
  m.flame.opacity = p.stars > 0.3 ? 1.0 : 0.9;

  if (bloom) {
    bloom.strength = p.bloom.strength * Q.bloomScale;
    bloom.radius = p.bloom.radius;
    bloom.threshold = p.bloom.threshold;
  }

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
  if (window.__tourActive) tour?.stop();
  if (name === 'process') {
    // 进入工艺流程动画模式
    currentShot = 'process';
    dofHold = 0;
    updateDofState();
    anim.enter({ stage: 0, immediate: false });
    if (!isClean) {
      syncBar('process');
      if (history.replaceState) { const u = new URL(location.href); u.searchParams.set('shot', 'process'); history.replaceState(null, '', u); }
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
    if (history.replaceState) { const u = new URL(location.href); u.searchParams.set('shot', name); history.replaceState(null, '', u); }
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

mark('lights-done');
/* ------------------------------------------------------------------ */
/* bake static geometry, then render                                   */
/* ------------------------------------------------------------------ */
if (!usingPrebaked) bakeStatic(plant);
mark('geometry-baked');

/* 接触阴影用 canvas 生成（headless 下约 1s）→ 推迟到 full 阶段 */
let contactShadows = null;
tlog('contact shadows'); mark('contact-shadows');

/* ------------------------------------------------------------------ */
/* 工艺流程动画（在 bakeStatic 之后创建，避免被合并）                     */
/* ------------------------------------------------------------------ */
mark('anim-start');
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
mark('anim-done');
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
mark('interact-start');
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

mark('interact-done');
/* 初始应用一次档位（此时 anim / contactShadows 已就绪）；boot 模式只保证可交互 */
mark('aq-start');
applyQuality(quality, { announce: false, boot: true });
mark('apply-quality');

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
  if (cinematic) {
    cinematic.material.uniforms.uTime.value = anim.time;
    cinematic.material.uniforms.uExposure.value = 1.0;
  }
  sky.position.copy(camera.position);

  renderer.info.reset();
  if (postReady) {
    // RenderPass 的目标会因 pass 开关在 rt1/rt2 之间切换，每帧绑定当前深度
    const depth = composer.readBuffer.depthTexture;
    if (depth) {
      dofPass.depthTexture = depth;
      dofPass.material.uniforms.tDepth.value = depth;
      ssaoPass.depthTexture = depth;
      ssaoPass.material.uniforms.tDepth.value = depth;
    }
    if (dofPass.enabled) dofPass.setFocus(camera.position.distanceTo(controls.target));
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
  perf.calls = renderer.info.render.calls;
  perf.triangles = renderer.info.render.triangles;
}

function animate() {
  requestAnimationFrame(animate);
  processPanel.update();
  if (xray.root.visible) {
    const now2 = performance.now();
    if (now2 - (animate._xrayAt || 0) > 200) {
      animate._xrayAt = now2;
      const near = xray.nearest(camera);
      if (xrayInfo && near) { xrayInfo.textContent = `透视 · ${near.label}`; xrayInfo.classList.add('show'); }
    }
  }
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  anim.update(dt);
  const tTour = performance.now();
  tour?.update(dt);
  tourCostMs += performance.now() - tTour;
  controls.update();
  if (interact) interact.update(dt);
  weather?.update(dt);
  if (!motionOff) motion?.update(dt);
  const tExp = performance.now();
  explorer?.update(dt);
  explorerCostMs += performance.now() - tExp;
  uiFrames++;

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
      if (postReady) measuredLuma = lumaMeter.sample(renderer, composer.readBuffer.texture);
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
  if (!postReady) return;
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
  ao: !!(ssaoPass && ssaoPass.enabled),
  dof: !!(dofPass && dofPass.enabled),
  fxaa: !!(fxaaPass && fxaaPass.enabled),
  bloom: !!(bloom && bloom.enabled),
  postfx: postReady,
});
window.__bench = (n = 30) => {
  render();
  const t = performance.now();
  for (let i = 0; i < n; i++) render();
  return { frames: n, msPerFrame: +((performance.now() - t) / n).toFixed(2), fps: +(1000 / ((performance.now() - t) / n)).toFixed(1) };
};
/* ------------------------------------------------------------------ */
/* 完整画质升级：首帧之后异步补齐环境反射 / 后处理 / 全分辨率               */
/* ------------------------------------------------------------------ */
let fullReady = false;

async function upgradeToFull() {
  if (fullReady) return;
  mark('full-decor-start');
  if (decorTarget) {
    createPlantDecor(m, decorTarget);
    labels.visible = !!((SHOTS[currentShot] || {}).labels);
    nightGlow.visible = currentPreset.stars > 0.3;
    decorTarget = null;
  }
  mark('full-decor-done');
  mark('full-contact-start');
  contactShadows = createContactShadows();
  contactShadows.visible = Q.contactShadows;
  scene.add(contactShadows);
  mark('full-contact-done');
  mark('full-ground-start');
  scene.remove(groundLite);
  const groundFull = createGround(m);
  scene.add(groundFull);
  /* 不烘焙：本环境下 draw call 很便宜（实测 1688 draw = 19ms），合并反而要 2–3s */
  scene.add(createHills(m));
  mark('full-ground-done');
  mark('full-env-start');
  envMapReady = true;
  rebuildEnvironment(currentPresetKey);
  mark('full-env-done');
  /* 先建 postFX 再 applyQuality：SSAO/DOF/FXAA 的开关由 applyQuality 写入 pass */
  buildPostFX();
  mark('full-postfx-done');
  applyQuality(quality, { announce: false });
  mark('full-quality-done');
  applyLook(currentPreset);
  mark('full-look-done');
  /* 分享链接的状态在完整画质就绪后落地，避免被 PMREM / 分档覆盖 */
  try { share?.applyFromUrl(); } catch (err) { console.warn('[share] restore failed', err.message); }
  try { if (params.get('weather')) weather?.set(params.get('weather')); } catch (err) { console.warn('[weather] restore failed', err.message); }
  render();
  mark('full-render-done');
  fullReady = true;
  window.__fullReadyAt = performance.now();
  window.__fullReady = true;
  console.info(`[boot] full quality ready ${(performance.now() / 1000).toFixed(1)}s (lean ready was earlier)`);
}
window.__upgradeFull = upgradeToFull;

/* ------------------------------------------------------------------ */
/* 冷启动诊断 API                                                       */
/* ------------------------------------------------------------------ */
function materialFlags(mat) {
  const f = [mat.type];
  const texKeys = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap',
    'alphaMap', 'bumpMap', 'displacementMap', 'lightMap', 'envMap', 'specularMap', 'anisotropyMap'];
  for (const k of texKeys) if (mat[k]) f.push(k);
  if (mat.emissive && (mat.emissive.r > 0 || mat.emissive.g > 0 || mat.emissive.b > 0)) f.push('emissive');
  if (mat.transparent) f.push('transparent');
  if (mat.vertexColors) f.push('vcolors');
  if (mat.alphaTest) f.push('alphaTest');
  if (mat.side === THREE.DoubleSide) f.push('doubleSide');
  if (mat.isShaderMaterial) f.push('shader');
  if (mat.blending === THREE.AdditiveBlending) f.push('additive');
  return f.join('+');
}
window.__renderInfo = () => {
  const programs = (renderer.info.programs || []).map((p) => ({
    name: p.name, id: p.id, usedTimes: p.usedTimes, key: String(p.cacheKey || '').slice(0, 120),
  }));
  const groups = {};
  let meshes = 0;
  scene.traverse((o) => {
    if (!o.isMesh && !o.isPoints && !o.isLine) return;
    meshes++;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) {
      if (!mat) continue;
      const key = materialFlags(mat);
      if (!groups[key]) groups[key] = { key, materials: [], meshes: 0, visible: 0 };
      const g = groups[key];
      if (!g.materials.includes(mat.name || mat.uuid)) g.materials.push(mat.name || mat.uuid);
      g.meshes++;
      if (o.visible) g.visible++;
    }
  });
  const gl = renderer.getContext();
  let gpu = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
  } catch { /* ignore */ }
  return {
    programs: programs.length,
    programList: programs,
    programsByType: programs.reduce((acc, p) => { acc[p.name] = (acc[p.name] || 0) + 1; return acc; }, {}),
    groups: Object.values(groups).sort((a, b) => b.meshes - a.meshes),
    meshes,
    render: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, points: renderer.info.render.points, lines: renderer.info.render.lines },
    memory: { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures },
    gpu,
    parallelCompile: renderer.extensions.has('KHR_parallel_shader_compile'),
    compileMode: prep,
    quality,
  };
};
window.__timing = () => ({
  marks: marksList(),
  gl: glSummary(),
  programs: programTimings(renderer),
  now: +performance.now().toFixed(1),
});
window.__progBench = (n = 6) => {
  const times = [];
  for (let i = 0; i < n; i++) {
    const mat = m.steel.clone();
    mat.defines = { PROG_BENCH: i + 1 };
    mat.needsUpdate = true;
    const sc = new THREE.Scene();
    sc.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat));
    const t = performance.now();
    renderer.compile(sc, camera);
    times.push(+(performance.now() - t).toFixed(1));
  }
  return times;
};
window.__pmremBench = () => {
  const gen = new THREE.PMREMGenerator(renderer);
  const out = {};
  let t = performance.now();
  gen.compileEquirectangularShader();
  out.compileEquirectMs = +(performance.now() - t).toFixed(1);
  const basic = new THREE.Scene();
  basic.add(new THREE.Mesh(new THREE.SphereGeometry(10, 16, 10), new THREE.MeshBasicMaterial({ color: 0x8899aa })));
  t = performance.now();
  gen.fromScene(basic, 0.02, 0.1, 100);
  out.basicFromSceneMs = +(performance.now() - t).toFixed(1);
  t = performance.now();
  gen.fromScene(envScene, 0.02, 0.1, 100);
  out.skyFromSceneWarmMs = +(performance.now() - t).toFixed(1);
  const sky2 = new THREE.Scene();
  const mat2 = sky.material.clone();
  mat2.defines = { SKY_BENCH: 1 };
  mat2.needsUpdate = true;
  sky2.add(new THREE.Mesh(new THREE.SphereGeometry(10, 16, 10), mat2));
  t = performance.now();
  gen.fromScene(sky2, 0.02, 0.1, 100);
  out.skyCloneFromSceneMs = +(performance.now() - t).toFixed(1);
  return out;
};
window.__benchReal = () => {
  const src = window.__snapshotBuffer;
  const items = BAKED_META.items;
  const run = (buffer) => {
    const out = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const t = performance.now();
      const pos = new Float32Array(buffer, it.position.offset, it.position.count * 3);
      const nor = new Float32Array(buffer, it.normal.offset, it.normal.count * 3);
      const uv = new Float32Array(buffer, it.uv.offset, it.uv.count * 2);
      const idx = new Uint32Array(buffer, it.index.offset, it.index.count);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, m[it.material]);
      mesh.castShadow = true; mesh.receiveShadow = true;
      out.push(+(performance.now() - t).toFixed(1));
    }
    return out;
  };
  const real = run(src);
  const copy = src.slice(0);
  const copied = run(copy);
  return { realTop: real.slice().sort((a, b) => b - a).slice(0, 6), realTotal: +real.reduce((a, b) => a + b, 0).toFixed(1),
    copyTop: copied.slice().sort((a, b) => b - a).slice(0, 6), copyTotal: +copied.reduce((a, b) => a + b, 0).toFixed(1) };
};
window.__benchDirect = (n = 10) => {
  const r = window.__renderer;
  const pr = r.getPixelRatio();
  r.shadowMap.enabled = false;
  const t = performance.now();
  for (let i = 0; i < n; i++) r.render(window.__scene, window.__camera);
  const direct = +((performance.now() - t) / n).toFixed(2);
  r.shadowMap.enabled = true;
  return { directMsPerFrame: direct, dpr: pr, calls: r.info.render.calls, tris: r.info.render.triangles };
};
window.__benchViews = () => {
  const dst = new ArrayBuffer(BAKED_META.bytes);
  const items = BAKED_META.items;
  const first = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const t = performance.now();
    const pos = new Float32Array(dst, it.position.offset, it.position.count * 3);
    const nor = new Float32Array(dst, it.normal.offset, it.normal.count * 3);
    const uv = new Float32Array(dst, it.uv.offset, it.uv.count * 2);
    const idx = new Uint32Array(dst, it.index.offset, it.index.count);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, m.steel);
    first.push(+(performance.now() - t).toFixed(1));
  }
  const tCopy = performance.now();
  const copy = dst.slice(0);
  const copyMs = +(performance.now() - tCopy).toFixed(1);
  return { perItem: first.slice(0, 10), total: +first.reduce((a, b) => a + b, 0).toFixed(1), copyMs, bytes: copy.byteLength };
};
window.__compileProbe = async (mode = 'compile') => {
  const t = performance.now();
  if (mode === 'async') await renderer.compileAsync(scene, camera);
  else renderer.compile(scene, camera);
  return +((performance.now() - t).toFixed(1));
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
  return !!(dofPass && dofPass.enabled);
};
window.__setAO = (on = true) => { if (!ssaoPass) return false; ssaoPass.enabled = !!on; render(); return ssaoPass.enabled; };
window.__setContactShadows = (on = true) => { if (!contactShadows) return false; contactShadows.visible = !!on; render(); return contactShadows.visible; };
window.__setBloom = (on = true) => { if (!bloom) return false; bloom.enabled = !!on; render(); return bloom.enabled; };
window.__setFXAA = (on = true) => { if (!fxaaPass) return false; fxaaPass.enabled = !!on; render(); return fxaaPass.enabled; };
window.__setCinematic = (on = true) => { if (!cinematic) return false; cinematic.enabled = !!on; render(); return cinematic.enabled; };
window.__setAutoExposure = (on = true) => {
  autoExposureEnabled = !!on;
  if (!on) { exposureScale = 1; renderer.toneMappingExposure = baseExposure; render(); }
  return autoExposureEnabled;
};
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
window.__renderer = renderer;
window.__scene = scene;
window.__camera = camera;
window.__composer = composer;
window.__materials = m;

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
  motion?.setTime(t);
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

/* 可选：首帧前显式编译（?prep=compile|compileasync），用于对比同步 / 并行编译 */
const prep = params.get('prep') || 'none';
if (prep !== 'none') {
  mark('prep-start');
  if (prep === 'compileasync') await renderer.compileAsync(scene, camera);
  else renderer.compile(scene, camera);
  mark('prep-done');
}

/* ------------------------------------------------------------------ */
/* C 批：设备清单 + 小地图 / 分享链接 / 导览模式                        */
/* ------------------------------------------------------------------ */
let explorer = null;
let tour = null;
let share = null;
let weather = null;
let motion = null;
let audio = null;
const motionOff = params.get('motion') === '0';
if (!isClean) {
  explorer = createExplorer({ interact, camera, controls, isClean });
  tour = createTour({ camera, controls, anim, interact, isClean });
  share = createShare({
    camera, controls, anim, interact,
    getShot: () => currentShot,
    setShot,
    getQuality: () => quality,
    applyQuality,
    pinQuality,
    isClean,
  });
} else {
  // clean 截图模式也创建分享器（便于脚本调用 __shareUrl），但不显示按钮
  share = createShare({
    camera, controls, anim, interact,
    getShot: () => currentShot,
    setShot,
    getQuality: () => quality,
    applyQuality,
    pinQuality,
    isClean,
  });
}

/* B3：天气（粒子 + 湿滑 + 雾/天空叠加），默认 clear 不影响现有截图 */
weather = createWeather({
  scene, camera, m, skyUniforms, renderer, lights,
  getQuality: () => quality,
  getPreset: () => currentPreset,
  onClear: () => applyLook(currentPreset),
});
/* ------------------------------------------------------------------ */
/* E2/E3/E4/E5：导出、参数面板、透视、二维码                              */
/* ------------------------------------------------------------------ */
const exporters = createExporters({ renderer, camera, composer, dofPass, renderFrame: render });
const xray = createXray({ scene, m });
const processPanel = createProcessPanel({
  isClean,
  getStage: () => (anim?.state ? anim.state.stage : 0),
  getOverview: () => !!(anim?.state && anim.state.overview),
});
const qrShare = createQrShare({
  getUrl: () => (share ? share.url() : location.href),
  onCopy: () => { share?.copy(); },
  isClean,
});

/* E2：导出 4K / 录制巡游 */
const exportBtn = document.getElementById('export-btn');
const recordBtn = document.getElementById('record-btn');
function exportPngNow({ width = 3840, height = 2160 } = {}) {
  return exporters.exportPNG({ width, height }).then((r) => {
    exporters.download(r.dataUrl, `refinery-${width}x${height}.png`);
    return r;
  });
}
async function recordNow({ seconds = 30 } = {}) {
  if (recordBtn) { recordBtn.classList.add('on'); recordBtn.textContent = '录制中 …'; }
  const wasTour = tour?.isActive?.() ?? false;
  if (!wasTour) (tour ? tour.start(0) : anim?.overview?.());
  const tick = (t) => { if (recordBtn) recordBtn.textContent = `录制 ${t.left.toFixed(1)}s`; };
  try {
    const r = await exporters.recordTour({ seconds, fps: 30, onTick: tick });
    exporters.download(r.blob, 'refinery-tour.webm');
    return r;
  } finally {
    if (recordBtn) { recordBtn.classList.remove('on'); recordBtn.textContent = '录制巡游'; }
    if (!wasTour) tour?.stop?.();
  }
}
exportBtn?.addEventListener('click', () => { exportPngNow().catch((e) => console.warn('[export] ', e.message)); });
recordBtn?.addEventListener('click', () => { recordNow().catch((e) => console.warn('[record] ', e.message)); });
window.__exportPNG = (o) => exportPngNow(o);
window.__recordTour = (o) => recordNow(o);

/* E4：X-Ray（内构件叠加，关闭态逐像素等于基线） */
const xrayBtn = document.getElementById('xray-btn');
const xrayInfo = document.getElementById('xray-info');
function setXray(on) {
  const v = xray.setVisible(on);
  xrayBtn?.classList.toggle('on', v);
  if (!v) xrayInfo?.classList.remove('show');
  return v;
}
window.__setXray = (on) => setXray(!!on);
window.__xrayState = () => ({ on: xray.root.visible, spots: xray.spots.length });
if (!isClean) {
  xrayBtn?.addEventListener('click', () => setXray(!xray.root.visible));
  addEventListener('keydown', (e) => {
    if (e.key === 'x' || e.key === 'X') setXray(!xray.root.visible);
  });
  if (params.get('xray') === '1') setXray(true);
  if (params.get('params') === '0') processPanel.setOpen(false);
}

/* E5：二维码 / 物料平衡数据 */
document.getElementById('share-btn')?.addEventListener('click', () => qrShare.open());
window.__qrState = () => ({ ...qrShare.state(), balance: validateBalance() });
window.__processState = () => ({ ...processPanel.state(), data: validateBalance() });

/* ------------------------------------------------------------------ */
/* D2：环境音（默认静音；?audio=1 或记忆为开时，等首次手势再创建 ctx）    */
/* ------------------------------------------------------------------ */
audio = createAudio({
  onStateChange: () => syncAudioButton(),
});
const audioBtn = document.getElementById('audio-btn');
function syncAudioButton() {
  if (!audioBtn) return;
  const st = audio.state();
  const label = st.on ? '♪ 环境音 开' : st.on === false && audio.armed ? '♪ 环境音 待启动' : '♪ 环境音';
  audioBtn.textContent = label;
  audioBtn.classList.toggle('on', !!st.on);
  audioBtn.title = st.on ? '点击关闭环境音（会淡出并挂起 AudioContext）' : '环境音（默认静音）：厂区低频轰鸣 + 间歇蒸汽泄放';
}
if (audioBtn) {
  audioBtn.addEventListener('click', () => {
    const want = !audio.state().on;
    audio.cancelArm();
    audio.setOn(want);
  });
}
/* 与 clean 无关：按钮隐藏但音频状态照常（?audio=1 仍需首次手势） */
const aParam = params.get('audio');
if (aParam === '1') audio.arm();
else if (aParam === '0') audio.setOn(false);
else if (audio.stored() === '1') audio.arm();
syncAudioButton();
window.__audioState = () => ({ ...audio.state(), armed: audio.armed });
window.__setAudio = (v) => { audio.cancelArm(); return audio.setOn(!!v); };

window.__setWeather = (name) => weather.set(name);
window.__weatherState = () => weather.state();
window.__setWeatherTime = (t) => weather.setTime(t);
window.__resumeTime = () => { motion?.resume(); weather?.resume(); return true; };

/* B5：动态细节（蒸汽随风 / 旗帜 / 鸟群），显式时钟驱动 */
motion = createMotion({ scene, plant, m, getQuality: () => quality });
window.__motionState = () => motion.state();

const initial = params.get('shot') || 'aerial';
mark('set-shot-start');
setShot(initial);
mark('set-shot-done');
mark('boot-compile-start');
renderer.compile(scene, camera);
mark('boot-compile-done');
mark('first-render-start');
render();
mark('first-render-done');
mark('first-frame');
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

mark('ready');
window.__readyAt = performance.now();
window.__ready = true;
window.__animReady = true;
/* 首帧已上屏 → 下一帧之后再升级完整画质，避免抢占可交互时间 */
requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => { upgradeToFull(); }, 0)));
window.__fullReady = false;
autoQStart = performance.now() + 6000;
console.log('[refinery] ready', JSON.stringify({ shots: Object.keys(SHOTS), stages: anim.stages.length }));
/* debug helpers (not used in production views) */
window.__debug = (opts = {}) => {
  const { fog = true, sky: skyOn = true, bloom: bloomOn = true, cinematic: cineOn = true } = opts;
  scene.fog = fog ? new THREE.FogExp2(currentPreset.fog, currentPreset.fogDensity) : null;
  sky.visible = skyOn;
  if (bloom) bloom.enabled = bloomOn;
  if (cinematic) cinematic.enabled = cineOn;
  renderer.shadowMap.enabled = opts.shadows !== false;
  render();
  return { fog, sky: skyOn, bloom: bloomOn, cinematic: cineOn };
};
/* ---- C 批 API ---- */
window.__tourActive = false;
window.__uiCost = () => {
  const n = uiFrames || 1;
  const exp = explorerCostMs / n;
  const tour = tourCostMs / n;
  const fps = perf.fps || 0;
  const frameMs = fps > 0 ? 1000 / fps : null;
  const pct = (ms) => (frameMs ? +((ms / frameMs) * 100).toFixed(2) : null);
  return {
    frames: uiFrames,
    explorerMs: +exp.toFixed(3),
    tourMs: +tour.toFixed(3),
    frameMs: frameMs ? +frameMs.toFixed(2) : null,
    explorerPct: pct(exp),
    tourPct: pct(tour),
  };
};
window.__uiCostReset = () => { explorerCostMs = 0; tourCostMs = 0; uiFrames = 0; return true; };
window.__explorerState = () => (explorer ? explorer.state() : null);
window.__explorerSearch = (q) => (explorer ? explorer.search(q) : null);
window.__tourStart = (i = 0) => (tour ? tour.start(i) : null);
window.__tourStop = () => (tour ? tour.stop() : null);
window.__tourGoto = (i = 0) => (tour ? tour.goto(i) : null);
window.__tourState = () => (tour ? tour.state() : null);
window.__shareState = () => (share ? share.snapshot() : null);
window.__shareUrl = () => (share ? share.url() : null);
window.__applyShare = (x) => {
  if (!share) return null;
  const st = typeof x === 'string' ? JSON.parse(share.decode(x)) : x;
  return share.apply(st);
};
window.__shareRestore = () => (share ? share.applyFromUrl() : null);
window.__shareCopy = async () => (share ? share.copy() : null);

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
  if (ssaoPass) ssaoPass.enabled = false;
  if (dofPass) dofPass.enabled = false;
  if (bloom) bloom.enabled = false;
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
