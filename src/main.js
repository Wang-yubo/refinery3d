import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createMaterials } from './materials.js';
import { createSky, createLights, createGround, createHills, applyPreset, PRESETS } from './environment.js';
import { createPlant } from './plant.js';
import { bakeStatic } from './helpers.js';
import { createAnimation } from './animation.js';
import { createInteraction } from './interaction.js';

const params = new URLSearchParams(location.search);
const T0 = performance.now();
const mark = (label) => console.log(`[timing] ${label} ${((performance.now() - T0) / 1000).toFixed(1)}s`);
const isClean = params.get('clean') === '1';
if (isClean) document.body.classList.add('clean');

/* ------------------------------------------------------------------ */
/* renderer / scene / camera                                           */
/* ------------------------------------------------------------------ */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
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
mark('materials');
const { sky, uniforms: skyUniforms } = createSky();
scene.add(sky);
const lights = createLights();
scene.add(lights.sun, lights.sun.target, lights.hemi, lights.ambient, lights.fill);

const ground = createGround(m);
ground.name = 'ground';
scene.add(ground);
scene.add(createHills(m));

const { root: plant, labels, nightGlow } = createPlant(m);
mark('plant built');
scene.add(plant);

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
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(renderer.getPixelRatio());
composer.addPass(new RenderPass(scene, camera));

const bloom = new UnrealBloomPass(size.clone(), 0.55, 0.7, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.55 },
    uGrain: { value: 0.022 },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(innerWidth, innerHeight) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uTime;
    uniform vec2 uRes;
    varying vec2 vUv;
    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 p = (vUv - 0.5) * vec2(1.0, 0.92);
      float vig = smoothstep(0.92, 0.28, length(p));
      c.rgb *= mix(1.0, vig, uVignette);
      float g = rand(vUv * uRes + uTime) - 0.5;
      c.rgb += g * uGrain;
      gl_FragColor = c;
    }`,
};
const grade = new ShaderPass(GradeShader);
composer.addPass(grade);

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

let currentShot = 'aerial';
let currentPreset = PRESETS.dusk;
let interact = null;

function syncBar(name) {
  document.querySelectorAll('#bar button').forEach((b) => b.classList.toggle('active', b.dataset.shot === name));
}

/** 应用光照预设（机位与 HUD 各自负责，方便动画模式复用） */
function applyLook(p) {
  currentPreset = p;
  applyPreset(p, { skyUniforms, lights, scene, renderer });

  // emissive tuning
  m.lampWarm.emissiveIntensity = p.lampWarm;
  m.lampCool.emissiveIntensity = p.lampWarm * 0.8;
  m.window.emissiveIntensity = p.stars > 0.3 ? 1.8 : 0.28;
  m.beacon.emissiveIntensity = p.stars > 0.3 ? 7 : 2;
  m.flame.opacity = p.stars > 0.3 ? 1.0 : 0.9;

  bloom.strength = p.bloom.strength;
  bloom.radius = p.bloom.radius;
  bloom.threshold = p.bloom.threshold;

  const night = p.stars > 0.3;
  nightLights.forEach((l) => { l.visible = night; });
  nightGlow.visible = night;
  renderStats?.();
}

function setShot(name) {
  if (interact) interact.cancel();
  if (name === 'process') {
    // 进入工艺流程动画模式
    currentShot = 'process';
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
bakeStatic(plant);
bakeStatic(ground);
mark('geometry baked');

// mild material polish
Object.values(m).forEach((mat) => {
  if (mat && mat.isMeshStandardMaterial) mat.envMapIntensity = 0.6;
});

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
    if (!isClean) syncBar('');
  },
});

let lastFrame = performance.now();

function renderStats() {
  // no-op hook reserved for profiling
}

function render() {
  grade.uniforms.uTime.value = anim.time;
  sky.position.copy(camera.position);
  composer.render();
}

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  anim.update(dt);
  controls.update();
  if (interact) interact.update(dt);
  render();
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  grade.uniforms.uRes.value.set(innerWidth, innerHeight);
  bloom.setSize(innerWidth, innerHeight);
}
addEventListener('resize', onResize);

/* API for screenshots */
window.__shots = Object.keys(SHOTS);
window.__setShot = (name) => {
  setShot(name);
  render();
  return { shot: currentShot, labels: labels.visible };
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
console.log('[refinery] ready', JSON.stringify({ shots: Object.keys(SHOTS), stages: anim.stages.length }));
/* debug helpers (not used in production views) */
window.__debug = (opts = {}) => {
  const { fog = true, sky: skyOn = true, bloom: bloomOn = true, grade: gradeOn = true } = opts;
  scene.fog = fog ? new THREE.FogExp2(currentPreset.fog, currentPreset.fogDensity) : null;
  sky.visible = skyOn;
  bloom.enabled = bloomOn;
  grade.enabled = gradeOn;
  renderer.shadowMap.enabled = opts.shadows !== false;
  render();
  return { fog, sky: skyOn, bloom: bloomOn, grade: gradeOn };
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
  grade.enabled = false;
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
