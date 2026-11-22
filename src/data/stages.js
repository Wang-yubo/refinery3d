/* 工艺流程数据：6 阶段定义、物料流线路径与配色、时长、粒子 shader、环境常量。
   纯数据 + 纯函数，不依赖场景对象，便于 tools 与测试直接引用。 */
export const DUR = 12; // 每个阶段的时长（秒，1x）

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
export const STREAMS = [
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
/* 流线粒子 / 管线 shader                                                */
/* ------------------------------------------------------------------ */
export const POINT_VERT = /* glsl */ `
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

export const POINT_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uOpacity;
  varying vec3 vColor;
  void main() {
    float a = texture2D(uMap, gl_PointCoord).a;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor * (0.6 + 1.25 * a), a * uOpacity);
  }`;

export const TUBE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

export const TUBE_FRAG = /* glsl */ `
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

/* ------------------------------------------------------------------ */
/* 环境动效常量（空冷器风扇 / 调和罐组）                                   */
/* ------------------------------------------------------------------ */
export const AIR_COOLERS = [
  { x: -28, z: 8, w: 12 },
  { x: 8, z: 6, w: 12 },
  { x: -52, z: 8, w: 12 },
  { x: 92, z: -58, w: 11 },
  { x: 104, z: -58, w: 11 },
];

export const BLEND_TANKS = [
    [120, 44],
    [132, 44],
    [144, 44],
];
