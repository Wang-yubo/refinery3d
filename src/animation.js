import * as THREE from 'three';
import { box, cyl, pipeRun, leaderLine, bakeStatic, labelSprite, makeGlow } from './helpers.js';
import { tankTruck } from './units.js';

/* ==================================================================== */
/*  石油炼化工艺流程动画                                                 */
/*  - 6 个工艺阶段 / 物料流动粒子 / 阶段高亮 / 自动巡游 / 环境动效          */
/*  - 所有动画都由显式时间 t 驱动（不用 Math.random），可复现截图           */
/* ==================================================================== */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, k) => a + (b - a) * k;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const hash = (i) => {
  const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
};

const DUR = 12; // 每个阶段的时长（秒，1x）

/* ------------------------------------------------------------------ */
/* 阶段定义：场景坐标 / 机位 / 中英文名 / 说明                            */
/* ------------------------------------------------------------------ */
export const STAGES = [
  {
    num: '01',
    cn: '原油储运',
    en: 'CRUDE OIL STORAGE & TRANSPORT',
    desc: '原油自码头与罐区经泵组、计量和管廊送入常减压装置，浮顶罐维持稳定进料。',
    focus: [-156, 0, -6],
    ring: 58,
    color: 0xffa22e,
    cam: { pos: [-320, 52, 96], target: [-158, 16, -6], fov: 46 },
  },
  {
    num: '02',
    cn: '常减压蒸馏',
    en: 'CRUDE DISTILLATION · CDU / VDU',
    desc: '原油经换热网络升温后进入加热炉，在常压塔与减压塔中按沸点分馏为石脑油、煤油、柴油与渣油。',
    focus: [-46, 0, -34],
    ring: 46,
    color: 0xff6a3a,
    cam: { pos: [36, 20, 34], target: [-44, 30, -38], fov: 47 },
  },
  {
    num: '03',
    cn: '催化裂化',
    en: 'FLUID CATALYTIC CRACKING · FCC',
    desc: '重质油在反应器与再生器之间循环裂化，生成高辛烷值汽油与液化气；再生烟气经烟囱排放。',
    focus: [92, 0, -74],
    ring: 52,
    color: 0xff8a3c,
    cam: { pos: [4, 18, 4], target: [100, 36, -84], fov: 48 },
  },
  {
    num: '04',
    cn: '重整 / 加氢',
    en: 'CATALYTIC REFORMING & HYDROTREATING',
    desc: '石脑油在重整反应器中转化为高辛烷值组分，加氢精制脱除硫、氮，全面提升油品质量。',
    focus: [70, 0, 44],
    ring: 44,
    color: 0xffd27a,
    cam: { pos: [150, 44, 126], target: [72, 24, 44], fov: 45 },
  },
  {
    num: '05',
    cn: '产品调和',
    en: 'PRODUCT BLENDING',
    desc: '各组分油按配方在线调和为 92 / 95 号汽油与柴油，经化验合格后转入成品罐区。',
    focus: [132, 0, 48],
    ring: 32,
    color: 0x7fe8ff,
    cam: { pos: [98, 34, 104], target: [134, 10, 50], fov: 44 },
  },
  {
    num: '06',
    cn: '装卸出厂',
    en: 'TRUCK LOADING & DISPATCH',
    desc: '成品油经装车鹤管定量装入罐车，计量、封铅后经地衡驶出厂区，完成全流程交付。',
    focus: [172, 0, 74],
    ring: 34,
    color: 0x9fe9ff,
    cam: { pos: [238, 26, 128], target: [172, 10, 72], fov: 46 },
  },
];

/* ------------------------------------------------------------------ */
/* 物料流线：3 类配色（原油 / 高温油气 / 成品油）                         */
/* ------------------------------------------------------------------ */
const STREAMS = [
  {
    id: 'crude',
    name: '原油',
    color: 0xffa22e,
    stages: [0, 1],
    speed: 11,
    particles: 34,
    points: [
      [-186, 6.0, -8], [-158, 6.0, -8], [-124, 6.0, -8], [-104, 6.0, -8],
      [-96, 6.4, -6], [-96, 11.4, -6], [-96, 11.4, 8], [-84, 11.4, 8], [-72, 11.4, 8],
      [-72, 8.0, 2], [-72, 5.2, -4], [-68, 5.2, -4],
    ],
  },
  {
    id: 'vapor',
    name: '高温油气',
    color: 0xff4d1e,
    stages: [1, 2],
    speed: 15,
    particles: 46,
    points: [
      [-48, 58.6, -30], [-48, 63.0, -30], [-36, 63.0, -36], [-30, 55.0, -50], [-26, 51.0, -56],
      [14, 56.0, -56], [14, 56.0, -22], [14, 12.0, -20], [14, 11.4, 8], [30, 11.4, 8], [52, 11.4, 8],
      [58, 10.6, 6], [58, 10.6, -20], [58, 10.6, -52], [58, 7.2, -64], [64, 7.2, -72], [70, 7.2, -74],
    ],
  },
  {
    id: 'fcc',
    name: '催化汽油',
    color: 0xff7a2f,
    stages: [2, 3],
    speed: 13,
    particles: 40,
    points: [
      [112, 24, -52], [112, 20, -52], [112, 9, -56], [108, 6.4, -48], [108, 6.4, -20],
      [108, 11.6, 8], [100, 11.6, 8], [60, 11.6, 8], [56, 11.6, 10], [52, 11.6, 14], [52, 11.6, 34],
      [52, 7.6, 40], [48, 4.4, 44], [48, 4.4, 66], [50, 4.8, 70],
    ],
  },
  {
    id: 'reform',
    name: '重整汽油',
    color: 0xffd27a,
    stages: [3, 4],
    speed: 10,
    particles: 30,
    points: [
      [70, 28.5, 42], [70, 33, 42], [88, 33, 42], [104, 33, 42], [112, 31, 46],
      [120, 28, 48], [126, 22, 46], [132, 17, 44], [132, 13.5, 44],
    ],
  },
  {
    id: 'product',
    name: '成品油',
    color: 0x7fe8ff,
    stages: [4, 5],
    speed: 9,
    particles: 26,
    points: [
      [144, 13.5, 44], [148, 10, 50], [150, 8.4, 58], [152, 7.6, 66], [158, 7.6, 72], [168, 7.6, 74],
    ],
  },
  {
    id: 'flare',
    name: '火炬排放',
    color: 0xff3a14,
    stages: [2],
    speed: 8,
    particles: 22,
    points: [
      [96, 6, -92], [112, 6, -100], [132, 6, -106], [152, 6, -114], [166, 6, -120], [172, 6, -120],
    ],
  },
];

/* ------------------------------------------------------------------ */
/* shaders                                                             */
/* ------------------------------------------------------------------ */
const POINT_VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  uniform float uSize;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(uSize * aSize * 900.0 / max(1.0, -mv.z), 1.5, 18.0);
    gl_Position = projectionMatrix * mv;
  }`;

const POINT_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uOpacity;
  varying vec3 vColor;
  void main() {
    float a = texture2D(uMap, gl_PointCoord).a;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor * (0.6 + 1.25 * a), a * uOpacity);
  }`;

const TUBE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const TUBE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uRepeat;
  varying vec2 vUv;
  void main() {
    float x = fract(vUv.x * uRepeat - uTime * uSpeed);
    float head = smoothstep(0.0, 0.05, x);
    float tail = 1.0 - smoothstep(0.16, 0.95, x);
    float dash = head * tail;
    float a = uOpacity * (0.16 + 0.95 * dash);
    vec3 col = uColor * (0.55 + 2.1 * dash);
    gl_FragColor = vec4(col, a);
  }`;

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

const AIR_COOLERS = [
  { x: -28, z: 8, w: 12 },
  { x: 8, z: 6, w: 12 },
  { x: -52, z: 8, w: 12 },
  { x: 92, z: -58, w: 11 },
  { x: 104, z: -58, w: 11 },
];

/* ------------------------------------------------------------------ */
/* main factory                                                        */
/* ------------------------------------------------------------------ */
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

  /* ---------------- product blending unit ---------------- */
  const blendGroup = new THREE.Group();
  blendGroup.name = 'blending';
  const BLEND_TANKS = [
    [120, 44],
    [132, 44],
    [144, 44],
  ];
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
  bakeStatic(blendGroup);

  // 给流程图补一个「产品调和」标注
  const blendLabel = labelSprite('产品调和', 'Product Blending', { accent: '#5fd0ff', scale: 1.35 });
  blendLabel.position.set(140, 27, 30);
  labels.add(blendLabel);
  const blendLeader = leaderLine([136, 10, 44], [140, 22.5, 32]);
  labels.add(blendLeader);

  /* ---------------- flow streams ---------------- */
  const glowTex = m.glowTex;
  const _tmp = new THREE.Vector3();

  class Stream {
    constructor(def) {
      this.def = def;
      this.curve = new THREE.CatmullRomCurve3(def.points.map((p) => V(...p)), false, 'catmullrom', 0.28);
      this.len = Math.max(1, this.curve.getLength());
      const tubular = Math.max(80, Math.round(this.len / 5));
      const tubeGeo = new THREE.TubeGeometry(this.curve, tubular, 0.42, 5, false);
      this.lineMat = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(def.color) },
          uOpacity: { value: 0.2 },
          uTime: { value: 0 },
          uSpeed: { value: def.speed / 9 },
          uRepeat: { value: this.len / 9 },
        },
        vertexShader: TUBE_VERT,
        fragmentShader: TUBE_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.tube = new THREE.Mesh(tubeGeo, this.lineMat);
      this.tube.frustumCulled = false;

      const n = def.particles;
      this.n = n;
      const pos = new Float32Array(n * 3);
      const col = new Float32Array(n * 3);
      const siz = new Float32Array(n);
      const base = new THREE.Color(def.color);
      this.offsets = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const c = base.clone().offsetHSL((hash(i * 3.7) - 0.5) * 0.1, 0, (hash(i * 5.1) - 0.5) * 0.18);
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
        siz[i] = 0.55 + hash(i * 9.3) * 0.95;
        this.offsets[i] = (i / n + hash(i * 2.3) * 0.02) % 1;
      }
      const pgeo = new THREE.BufferGeometry();
      pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      pgeo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
      pgeo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
      this.pointMat = new THREE.ShaderMaterial({
        uniforms: { uMap: { value: glowTex }, uOpacity: { value: 0.7 }, uSize: { value: 1.0 } },
        vertexShader: POINT_VERT,
        fragmentShader: POINT_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.points = new THREE.Points(pgeo, this.pointMat);
      this.points.frustumCulled = false;

      this.group = new THREE.Group();
      this.group.add(this.tube, this.points);
      flowRoot.add(this.group);

      this.opacity = 0.2;
      this.speed = def.speed;
    }

    update(t, active, dt, snap = false) {
      const target = active ? 1.0 : 0.32;
      this.opacity = snap ? target : lerp(this.opacity, target, 1 - Math.exp(-dt * 3.2));
      const v = this.def.speed * (active ? 1 : 0.45);
      this.lineMat.uniforms.uOpacity.value = this.opacity * 0.62;
      this.lineMat.uniforms.uTime.value = t;
      this.lineMat.uniforms.uSpeed.value = v / 9;
      this.pointMat.uniforms.uOpacity.value = this.opacity * 0.95;
      this.pointMat.uniforms.uSize.value = active ? 1.15 : 0.78;
      const du = v / this.len;
      const pos = this.points.geometry.attributes.position;
      for (let i = 0; i < this.n; i++) {
        let u = (this.offsets[i] + t * du) % 1;
        if (u < 0) u += 1;
        this.curve.getPointAt(u, _tmp);
        pos.setXYZ(i, _tmp.x, _tmp.y, _tmp.z);
      }
      pos.needsUpdate = true;
    }
  }

  const streams = STREAMS.map((def) => new Stream(def));

  /* ---------------- stage rings ---------------- */
  const ringGroups = [];
  for (const s of STAGES) {
    const g = new THREE.Group();
    g.position.set(s.focus[0], 0.5, s.focus[2]);
    const mkRing = (r, w, op) => {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(Math.max(0.1, r - w), r, 96),
        new THREE.MeshBasicMaterial({
          color: s.color, transparent: true, opacity: op,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.frustumCulled = false;
      g.add(mesh);
      return mesh;
    };
    const outer = mkRing(s.ring, s.ring * 0.03, 0.0);
    const inner = mkRing(s.ring * 0.72, s.ring * 0.012, 0.0);
    const aura = makeGlow(glowTex, s.color, s.ring * 1.9, 0.0);
    aura.position.y = 2.4;
    g.add(aura);
    flowRoot.add(g);
    ringGroups.push({ group: g, outer, inner, aura, stage: s });
  }

  /* ---------------- stage spot light ---------------- */
  const spotTarget = new THREE.Object3D();
  const spot = new THREE.SpotLight(0xffd7a6, 0, 230, 0.48, 0.72, 2);
  spot.castShadow = false;
  spot.visible = false;
  spotTarget.position.set(0, 0, 0);
  flowRoot.add(spot, spotTarget);
  spot.target = spotTarget;

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

  /* ================================================================== */
  /* HUD / state                                                        */
  /* ================================================================== */
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

  const api = {
    streams,
    spot,
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

  /* ---------------- camera ---------------- */
  function camApply(cam) {
    camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
    controls.target.set(cam.target[0], cam.target[1], cam.target[2]);
    camera.fov = cam.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(controls.target);
    controls.update();
  }

  function flyTo(cam, { immediate = false, dur = 2.0 } = {}) {
    if (immediate || dur <= 0) {
      state.tween = null;
      controls.enabled = true;
      camApply(cam);
      return;
    }
    state.tween = {
      t: 0,
      dur,
      from: { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov },
      to: { pos: V(...cam.pos), target: V(...cam.target), fov: cam.fov },
    };
    controls.enabled = false;
  }

  function updateTween(dt) {
    const tw = state.tween;
    if (!tw) return;
    tw.t = Math.min(1, tw.t + dt / tw.dur);
    const e = easeInOutCubic(tw.t);
    camera.position.lerpVectors(tw.from.pos, tw.to.pos, e);
    controls.target.lerpVectors(tw.from.target, tw.to.target, e);
    camera.fov = lerp(tw.from.fov, tw.to.fov, e);
    camera.updateProjectionMatrix();
    camera.lookAt(controls.target);
    if (tw.t >= 1) {
      state.tween = null;
      controls.enabled = true;
    }
  }

  /* ---------------- stage visuals ---------------- */
  function applyStageVisuals() {
    for (let i = 0; i < ringGroups.length; i++) {
      const rg = ringGroups[i];
      const on = state.active && (state.overview || i === state.stage);
      rg.group.visible = on;
      if (!on) continue;
      const base = state.overview ? 0.14 : 0.34;
      rg.outer.material.opacity = base;
      rg.inner.material.opacity = base * 0.8;
      rg.aura.material.opacity = base * 0.22;
    }
    if (state.active && !state.overview) {
      const s = STAGES[state.stage];
      spot.visible = true;
      spot.position.set(s.focus[0], 96, s.focus[2] + 26);
      spotTarget.position.set(s.focus[0], 2, s.focus[2]);
      spot.intensity = 12000;
      spot.color.setHex(0xffdcb4);
    } else {
      spot.visible = false;
    }
    for (const st of streams) st.update(state.time, isStreamActive(st), 0, true);
  }

  function isStreamActive(st) {
    if (!state.active) return false;
    if (state.overview) return true;
    return st.def.stages.includes(state.stage);
  }

  /* ---------------- HUD ---------------- */
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
      applyStageVisuals();
      updateHud(true, performance.now());
      flyTo({ pos: [-300, 200, 392], target: [0, 20, -10], fov: 40 }, { immediate });
      onModeChange(true);
      return api;
    }
    state.stage = ((stage % STAGES.length) + STAGES.length) % STAGES.length;
    state.stageElapsed = 0;
    applyStageVisuals();
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
    applyStageVisuals();
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
    for (const st of streams) st.update(val, isStreamActive(st), 0, true);
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

  /* ---------------- flow update ---------------- */
  function updateFlow(t, dt) {
    for (const st of streams) st.update(t, isStreamActive(st), dt);
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
    for (let i = 0; i < ringGroups.length; i++) {
      const rg = ringGroups[i];
      if (!rg.group.visible) continue;
      const base = state.overview ? 0.13 : 0.3;
      rg.outer.material.opacity = base * (0.75 + 0.35 * pulse);
      rg.inner.material.opacity = base * 0.75 * (0.7 + 0.4 * (1 - pulse));
      rg.aura.material.opacity = base * (0.18 + 0.12 * pulse);
    }
    if (spot.visible) {
      spot.intensity = 11000 * (0.88 + 0.14 * pulse);
    }
    if (state.overview) {
      // 总览时所有阶段环轻微呼吸
      for (const rg of ringGroups) {
        rg.outer.material.opacity = 0.1 + 0.05 * Math.sin(t * 1.4 + rg.stage.focus[0] * 0.05);
      }
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
    if (state.active) updateFlow(state.time, dt);
    updateHud(false, performance.now());
  }

  /* ---------------- UI wiring ---------------- */
  function bindClick(el, fn) {
    if (!el) return;
    el.addEventListener('click', (e) => {
      e.preventDefault();
      fn();
      el.blur();
    });
  }
  bindClick(document.querySelector('#animui [data-act="prev"]'), () => gotoStage(state.stage - 1, { dur: 1.7 }));
  bindClick(document.querySelector('#animui [data-act="next"]'), () => gotoStage(state.stage + 1, { dur: 1.7 }));
  bindClick(elPlay, () => (state.playing ? pause() : play()));
  bindClick(elCruise, () => setCruise(!state.cruise));
  speedBtns.forEach((b) => bindClick(b, () => setSpeed(+b.dataset.speed)));
  dotEls.forEach((d, i) =>
    bindClick(d, () => {
      if (!state.active) enter({ stage: i, immediate: true });
      else gotoStage(i, { dur: 1.6 });
    })
  );

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
  for (const st of streams) st.update(0, false, 0, true);

  window.__animReady = true;

  return api;
}