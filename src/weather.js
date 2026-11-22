import * as THREE from 'three';
import { rng } from './textures.js';

/**
 * B3：天气与时间（rain / snow / fog）。
 * - 粒子用显式时间驱动（update(dt) 累加，__setWeatherTime 可钉住），低档关闭粒子
 * - 雨滴在顶棚范围内做高度裁剪，不穿透顶棚
 * - 潮湿变体复用 materials.js 的 __applyWet（降粗糙度 / 提环境反射 / 压暗颜色）
 */

const KINDS = ['clear', 'rain', 'snow', 'fog'];

/* 厂区里"有顶"的区域：雨/雪落到 top 高度即被挡住（近似裁剪） */
const SHELTERS = [
  { x0: 140, x1: 205, z0: 58, z1: 92, top: 9.5 },   // 装车区雨棚
  { x0: -92, x1: -68, z0: 140, z1: 156, top: 9.0 },  // 控制室
  { x0: 84, x1: 108, z0: 66, z1: 82, top: 9.4 },     // 重整厂房
  { x0: -70, x1: -46, z0: -12, z1: 4, top: 15.5 },   // 常减压炉区（部分遮挡）
];

function streakTexture() {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 32);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.9)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(3, 0, 2, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function flakeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.85)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.beginPath(); g.arc(16, 16, 16, 0, 6.3); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createWeather({ scene, camera, m, skyUniforms, renderer, lights, getQuality, getPreset, onClear }) {
  const state = {
    name: 'clear', time: 0, frozen: false, wind: new THREE.Vector2(1.2, 0.5),
    particles: null, count: 0, boxes: null, basins: null,
  };
  const streakTex = streakTexture();
  const flakeTex = flakeTexture();

  const BOX = { w: 260, h: 90, d: 260 };
  const N_RAIN = 1800, N_SNOW = 1200;

  function build(kind) {
    const n = kind === 'rain' ? N_RAIN : N_SNOW;
    const r = rng(kind === 'rain' ? 991 : 997);
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (r() - 0.5) * BOX.w;
      pos[i * 3 + 1] = r() * BOX.h;
      pos[i * 3 + 2] = (r() - 0.5) * BOX.d;
      seed[i] = r();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: kind === 'rain' ? 0.9 : 0.55,
      map: kind === 'rain' ? streakTex : flakeTex,
      transparent: true,
      opacity: kind === 'rain' ? 0.5 : 0.75,
      depthWrite: false,
      sizeAttenuation: true,
      color: kind === 'rain' ? 0xd9e8f2 : 0xffffff,
      fog: true,
    });
    const pts = new THREE.Points(geo, mat);
    pts.name = 'weather-' + kind;
    pts.frustumCulled = false;
    pts.renderOrder = 3;
    pts.userData.seed = seed;
    scene.add(pts);
    return pts;
  }

  function dispose() {
    if (!state.particles) return;
    scene.remove(state.particles);
    state.particles.geometry.dispose();
    state.particles.material.dispose();
    state.particles = null;
  }

  /* 大气参数：以当前光照预设为基准做天气叠加 */
  function applyAtmos(kind) {
    const p = getPreset();
    if (!p) return;
    const fog = scene.fog;
    const isNight = p.stars > 0.3;
    const set = (sunK, hemiK, ambK, expoK, fogK, skyTop, skyHor, fogColor) => {
      lights.sun.intensity = p.sunIntensity * sunK;
      lights.hemi.intensity = p.hemiIntensity * hemiK;
      lights.ambient.intensity = p.ambient * ambK;
      renderer.toneMappingExposure = p.exposure * expoK;
      if (fog) { fog.density = p.fogDensity * fogK; fog.color.setHex(fogColor); }
      skyUniforms.uTop.value.setHex(skyTop);
      skyUniforms.uHorizon.value.setHex(skyHor);
      skyUniforms.uCloudy.value = Math.min(1, p.cloudy + 0.4);
      scene.background = null;
    };
    if (kind === 'clear') {
      onClear && onClear();
      return;
    }
    if (kind === 'rain') {
      set(0.34, 0.72, 1.25, isNight ? 1.0 : 0.92, 2.2, 0x1d2430, 0x3b434e, 0x2c333d);
      m.__applyWet?.(true);
    } else if (kind === 'snow') {
      set(0.42, 0.95, 1.35, isNight ? 1.05 : 1.0, 2.6, 0x2a3340, 0x596470, 0x49535f);
      m.__applyWet?.(true);
    } else if (kind === 'fog') {
      set(0.5, 0.9, 1.30, 1.0, 7.5, 0x2b3138, 0x4a5158, 0x434a52);
      skyUniforms.uStars.value = isNight ? 0.05 : 0;
      m.__applyWet?.(true);
    }
  }

  function set(name) {
    const kind = KINDS.includes(name) ? name : 'clear';
    state.name = kind;
    state.time = 0;
    dispose();
    m.__applyWet?.(false);
    applyAtmos(kind);
    if (kind === 'rain' || kind === 'snow') {
      state.particles = build(kind);
      state.count = kind === 'rain' ? N_RAIN : N_SNOW;
    }
    state.particles && (state.particles.visible = true);
    if (typeof window !== 'undefined') window.__weatherName = kind;
    return kind;
  }

  const shelterAt = (x, z) => {
    for (const s of SHELTERS) if (x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1) return s.top;
    return 0;
  };

  function update(dt) {
    if (!state.particles) return;
    const Q = getQuality();
    const low = !Q || Q.level === 'low';
    if (low) { state.particles.visible = false; return; }
    state.particles.visible = true;
    if (!state.frozen) state.time += dt;
    const kind = state.name;
    const t = state.time;
    const speed = kind === 'rain' ? 46 : 3.6;
    const attr = state.particles.geometry.attributes.position;
    const arr = attr.array;
    const seed = state.particles.userData.seed;
    const n = state.count;
    const camX = camera.position.x, camZ = camera.position.z;
    const windX = state.wind.x * (kind === 'rain' ? 4.5 : 2.2);
    const windZ = state.wind.y * (kind === 'rain' ? 4.5 : 2.2);
    for (let i = 0; i < n; i++) {
      const s = seed[i];
      let y = (s * BOX.h - t * speed) % BOX.h;
      if (y < 0) y += BOX.h;
      const x = camX + (((s * 7.31) % 1) - 0.5) * BOX.w + windX * (t * 0.5 + s * 3);
      const z = camZ + (((s * 3.77) % 1) - 0.5) * BOX.d + windZ * (t * 0.5 + s * 3);
      const top = shelterAt(x, z);
      arr[i * 3] = x;
      arr[i * 3 + 1] = y < top ? y + BOX.h * 0.5 : y; // 顶棚以下：整体抬到高处，避免穿透
      arr[i * 3 + 2] = z;
    }
    attr.needsUpdate = true;
  }

  return {
    set, update,
    state: () => ({ name: state.name, time: +state.time.toFixed(2), visible: !!state.particles && state.particles.visible }),
    setTime: (t) => { state.time = Math.max(0, t); state.frozen = true; },
    resume: () => { state.frozen = false; },
  };
}