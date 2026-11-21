import * as THREE from 'three';
import { box, mesh, torus } from './helpers.js';

export const PRESETS = {
  dusk: {
    sunDir: [-0.50, 0.26, 0.72],
    sunColor: 0xffd2a6,
    sunIntensity: 3.6,
    hemiSky: 0x7f9cc8,
    hemiGround: 0x4a4034,
    hemiIntensity: 0.9,
    ambient: 0.24,
    skyTop: 0x1b2a4a,
    skyHorizon: 0xf7ac78,
    skyGround: 0x4a3a30,
    fog: 0xb4a89f,
    fogDensity: 0.00055,
    stars: 0.0,
    cloudy: 0.55,
    exposure: 1.0,
    bloom: { strength: 0.55, radius: 0.7, threshold: 0.82 },
    lampWarm: 2.4,
  },
  day: {
    sunDir: [-0.35, 0.80, 0.45],
    sunColor: 0xfffaf0,
    sunIntensity: 3.9,
    hemiSky: 0xa8c6e6,
    hemiGround: 0x5e5a4a,
    hemiIntensity: 0.62,
    ambient: 0.18,
    skyTop: 0x174e8e,
    skyHorizon: 0x93bdd8,
    skyGround: 0x8b9079,
    fog: 0x9fbdd0,
    fogDensity: 0.00035,
    stars: 0.0,
    cloudy: 0.5,
    exposure: 0.98,
    bloom: { strength: 0.3, radius: 0.6, threshold: 0.92 },
    lampWarm: 0.4,
  },
  night: {
    sunDir: [0.46, 0.16, -0.82],
    sunColor: 0xe6ab7d,
    sunIntensity: 1.25,
    hemiSky: 0x4a5f80,
    hemiGround: 0x1a1c22,
    hemiIntensity: 0.6,
    ambient: 0.16,
    skyTop: 0x0a1734,
    skyHorizon: 0x4d5c86,
    skyGround: 0x0b1220,
    fog: 0x232c3e,
    fogDensity: 0.0010,
    stars: 0.35,
    cloudy: 0.28,
    exposure: 1.32,
    bloom: { strength: 0.8, radius: 0.72, threshold: 0.78 },
    lampWarm: 3.4,
  },
};

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = /* glsl */`
varying vec3 vDir;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunI;
uniform float uStars;
uniform float uCloudy;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    v += amp * vnoise(p);
    p *= 2.03;
    amp *= 0.5;
  }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;

  vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.48));
  col = mix(col, uGround, smoothstep(0.015, -0.10, h));

  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunColor * pow(sd, 5.0) * 0.16 * uSunI;
  col += uSunColor * pow(sd, 42.0) * 0.30 * uSunI;
  float disc = smoothstep(0.99955, 0.99985, sd);
  col += uSunColor * disc * 3.0 * uSunI;

  // clouds
  if (h > 0.005) {
    vec2 uv = d.xz / (h + 0.22);
    float n = fbm(uv * 0.55 + vec2(2.3, 5.1));
    float n2 = fbm(uv * 1.7 + vec2(-4.0, 1.7));
    float cloud = smoothstep(0.52, 0.83, n * 0.75 + n2 * 0.36);
    cloud *= smoothstep(0.0, 0.22, h);
    float sunSoft = pow(max(sd, 0.0), 2.0);
    vec3 cloudCol = mix(uHorizon * 0.55 + uTop * 0.45, uSunColor * 1.05, 0.25 + sunSoft * 0.65);
    col = mix(col, cloudCol, cloud * uCloudy);
  }

  // stars
  if (uStars > 0.001 && h > 0.02) {
    vec2 sp = d.xz / (h + 0.35) * 140.0;
    vec2 cell = floor(sp);
    float r = hash(cell);
    float star = smoothstep(0.9955, 1.0, r);
    float tw = 0.55 + 0.45 * hash(cell + 7.3);
    col += vec3(0.85, 0.9, 1.0) * star * tw * uStars * 1.6;
  }

  gl_FragColor = vec4(col, 1.0);
}`;

export function createSky() {
  const uniforms = {
    uTop: { value: new THREE.Color(0x22345c) },
    uHorizon: { value: new THREE.Color(0xf2a468) },
    uGround: { value: new THREE.Color(0x4a3a30) },
    uSunDir: { value: new THREE.Vector3(-0.6, 0.2, 0.3) },
    uSunColor: { value: new THREE.Color(0xffb071) },
    uSunI: { value: 1.0 },
    uStars: { value: 0.0 },
    uCloudy: { value: 0.5 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2600, 48, 32), mat);
  sky.name = 'sky';
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  return { sky, uniforms };
}

export function createLights() {
  const sun = new THREE.DirectionalLight(0xffb071, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -300;
  sun.shadow.camera.right = 300;
  sun.shadow.camera.top = 300;
  sun.shadow.camera.bottom = -300;
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 900;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.8;

  const hemi = new THREE.HemisphereLight(0x8fa8cc, 0x4c3a2c, 0.5);
  const ambient = new THREE.AmbientLight(0xffffff, 0.18);
  const fill = new THREE.DirectionalLight(0x88aaff, 0.25);
  fill.position.set(300, 180, -260);
  return { sun, hemi, ambient, fill };
}

export function applyPreset(p, { skyUniforms, lights, scene, renderer }) {
  const dir = new THREE.Vector3(...p.sunDir).normalize();
  lights.sun.position.copy(dir).multiplyScalar(500);
  lights.sun.color.setHex(p.sunColor);
  lights.sun.intensity = p.sunIntensity;
  lights.hemi.color.setHex(p.hemiSky);
  lights.hemi.groundColor.setHex(p.hemiGround);
  lights.hemi.intensity = p.hemiIntensity;
  lights.ambient.intensity = p.ambient;
  lights.fill.intensity = p.hemiIntensity * 0.45;

  skyUniforms.uTop.value.setHex(p.skyTop);
  skyUniforms.uHorizon.value.setHex(p.skyHorizon);
  skyUniforms.uGround.value.setHex(p.skyGround);
  skyUniforms.uSunDir.value.copy(dir);
  skyUniforms.uSunColor.value.setHex(p.sunColor);
  skyUniforms.uSunI.value = Math.min(1.6, p.sunIntensity / 2.6);
  skyUniforms.uStars.value = p.stars;
  skyUniforms.uCloudy.value = p.cloudy;

  scene.fog = new THREE.FogExp2(p.fog, p.fogDensity);
  scene.background = null;
  renderer.toneMappingExposure = p.exposure;
}

/* ---------------- ground, roads, pads, hills ---------------- */
function plane(w, d, mat, x, z, y = 0.02) {
  const g = new THREE.PlaneGeometry(w, d);
  const m = new THREE.Mesh(g, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}

function roadMarkings(group, mat, x1, z1, x2, z2, y = 0.14) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const ang = -Math.atan2(dz, dx);
  const n = Math.floor(len / 9);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.3) / n;
    const cx = x1 + dx * t, cz = z1 + dz * t;
    const dash = box(3.2, 0.03, 0.24, mat, cx, y, cz);
    dash.rotation.y = ang;
    group.add(dash);
  }
}

export function createGround(m) {
  const g = new THREE.Group();

  // base terrain
  const base = plane(2400, 2400, m.grass, 0, 0, -0.08);
  base.material = m.grass;
  g.add(base);

  // site pad (gravel / compacted earth)
  g.add(plane(640, 520, m.gravel, -10, 0, -0.02));

  // concrete process pads
  const pads = [
    [-20, -40, 112, 112],   // CDU
    [88, -66, 100, 96],     // FCC
    [74, 58, 84, 86],       // reformer
    [8, 84, 104, 58],       // utilities
    [172, 78, 76, 40],      // loading
    [-105, 150, 66, 40],    // admin
    [125, 145, 70, 46],     // warehouse
    [-160, -8, 120, 200],   // tank farm
    [-100, 108, 40, 26],    // substation
  ];
  for (const [x, z, w, d] of pads) g.add(plane(w, d, m.concrete, x, z, 0.02));

  // asphalt roads
  const roads = [
    [0, 122, 520, 14],
    [0, -140, 440, 11],
    [-100, -10, 10, 260],
    [205, -10, 10, 260],
    [150, 78, 70, 9],
    [-60, 175, 150, 9],
  ];
  for (const [x, z, w, d] of roads) g.add(plane(w, d, m.asphalt, x, z, 0.05));
  // markings
  roadMarkings(g, m.roadLine, -250, 122, 250, 122);
  roadMarkings(g, m.roadLine, -210, -140, 210, -140);
  roadMarkings(g, m.roadLine, -100, -130, -100, 115, 0.15);
  roadMarkings(g, m.roadLine, 205, -130, 205, 115, 0.15);

  // curbs along main road
  for (const z of [114.2, 129.8]) {
    g.add(box(500, 0.28, 0.5, m.concreteSmooth, 0, 0.16, z));
  }

  // water pond next to cooling towers
  const pond = plane(86, 46, m.water, 0, 132, 0.08);
  g.add(pond);
  for (const [x, z, w, d] of [[0, 108, 90, 2], [0, 156, 90, 2], [-44, 132, 2, 48], [44, 132, 2, 48]]) {
    g.add(box(w, 0.7, d, m.concreteSmooth, x, 0.35, z));
  }

  // tank-farm bund walls
  for (const [x, z, w, d] of [[-160, -55, 92, 92], [-160, 55, 92, 92]]) {
    bund(g, m, x, z, w, d);
  }

  return g;
}

function bund(g, m, cx, cz, w, d, h = 1.6) {
  const t = 0.85;
  g.add(box(w, h, t, m.concreteSmooth, cx, h / 2, cz - d / 2));
  g.add(box(w, h, t, m.concreteSmooth, cx, h / 2, cz + d / 2));
  g.add(box(t, h, d, m.concreteSmooth, cx - w / 2, h / 2, cz));
  g.add(box(t, h, d, m.concreteSmooth, cx + w / 2, h / 2, cz));
  // access ramp gap (visual)
  g.add(box(8, 0.05, t, m.asphalt, cx + w * 0.18, h + 0.02, cz + d / 2));
}

export function createHills(m) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x5d6a6d, roughness: 1, metalness: 0 });
  const mat2 = new THREE.MeshStandardMaterial({ color: 0x6d7a76, roughness: 1, metalness: 0 });
  let seed = 5;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rand() * 0.15;
    const dist = 900 + rand() * 500;
    const h = 40 + rand() * 90;
    const r = 90 + rand() * 160;
    const hill = mesh(
      new THREE.ConeGeometry(r, h, 7, 1),
      rand() > 0.5 ? mat : mat2,
      Math.cos(a) * dist, h / 2 - 8, Math.sin(a) * dist
    );
    hill.rotation.y = rand() * 3;
    hill.castShadow = false;
    g.add(hill);
  }
  return g;
}

export function addSiteLights(scene, m, positions, intensity = 900) {
  const lights = [];
  for (const [x, y, z, color, dist] of positions) {
    const l = new THREE.PointLight(color, intensity, dist, 2);
    l.position.set(x, y, z);
    scene.add(l);
    lights.push(l);
  }
  return lights;
}