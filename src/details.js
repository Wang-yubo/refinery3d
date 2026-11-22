import * as THREE from 'three';
import { box, cyl, torus, railingLine, stairs } from './helpers.js';

/**
 * B2：装置细节补充（钢结构框架 / 层间平台与楼梯 / 电缆桥架 / 消防立管 /
 * 阀门组 / 法兰螺栓 / 保温层接缝与捆扎带）。
 *
 * 全部使用已有材质，合并烘焙后不增加 draw call；结构尺寸都对齐到已有的塔器、
 * 平台与管廊坐标，避免悬空与穿模。
 */

/* ---------------- 通用构件 ---------------- */

/** 四柱钢框架 + 每层横梁 + 交叉支撑 */
function frame(g, m, { x, z, w, d, h, levels = [], brace = true, col = 0.24 }) {
  const hw = w / 2, hd = d / 2;
  const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
  for (const [cx, cz] of corners) {
    g.add(box(col, h, col, m.steel, x + cx, h / 2, z + cz));
    g.add(box(col * 2.6, 0.16, col * 2.6, m.steelDark, x + cx, 0.08, z + cz)); // base plate
  }
  const beams = [...levels, h];
  for (const y of beams) {
    for (const [a, b] of [[corners[0], corners[1]], [corners[1], corners[2]], [corners[2], corners[3]], [corners[3], corners[0]]]) {
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      const beam = box(len, 0.26, 0.2, m.steel, x + (a[0] + b[0]) / 2, y, z + (a[1] + b[1]) / 2);
      beam.rotation.y = -Math.atan2(dz, dx);
      g.add(beam);
    }
  }
  if (brace) {
    for (let i = 0; i + 1 < beams.length; i++) {
      const y0 = beams[i], y1 = beams[i + 1];
      if (y1 - y0 < 2) continue;
      for (const side of [-1, 1]) {
        // 两侧的 X 支撑
        const p0 = [x - hw, y0, z + side * hd], p1 = [x + hw, y1, z + side * hd];
        const p2 = [x + hw, y0, z + side * hd], p3 = [x - hw, y1, z + side * hd];
        for (const [a, b] of [[p0, p1], [p2, p3]]) {
          const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
          const bar = box(0.11, len, 0.11, m.steelDark, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
          bar.rotation.z = Math.atan2(b[1] - a[1], b[0] - a[0]);
          g.add(bar);
        }
      }
    }
  }
}

/** 平台：格栅板 + 踢脚板 + 三面栏杆 */
function deck(g, m, { x, y, z, w, d, rails = true }) {
  g.add(box(w, 0.1, d, m.grating, x, y - 0.01, z));
  // 踢脚板
  g.add(box(w, 0.16, 0.06, m.railingGray, x, y + 0.06, z - d / 2));
  g.add(box(w, 0.16, 0.06, m.railingGray, x, y + 0.06, z + d / 2));
  g.add(box(0.06, 0.16, d, m.railingGray, x - w / 2, y + 0.06, z));
  g.add(box(0.06, 0.16, d, m.railingGray, x + w / 2, y + 0.06, z));
  if (rails) {
    railingLine(g, x - w / 2, z - d / 2, x + w / 2, z - d / 2, y, m.railing);
    railingLine(g, x - w / 2, z + d / 2, x + w / 2, z + d / 2, y, m.railing);
    railingLine(g, x - w / 2, z - d / 2, x - w / 2, z + d / 2, y, m.railing);
    railingLine(g, x + w / 2, z - d / 2, x + w / 2, z + d / 2, y, m.railing);
  }
}

/** 两点之间的走道（含栏杆 + 落地支撑） */
function walkway(g, m, { x1, z1, x2, z2, y, width = 1.5, posts = true }) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const ang = -Math.atan2(dz, dx);
  const g2 = new THREE.Group();
  g2.add(box(len, 0.1, width, m.grating, 0, -0.01, 0));
  for (const s of [-1, 1]) {
    g2.add(box(len, 0.16, 0.06, m.railingGray, 0, 0.06, (s * width) / 2));
    const rail = box(len, 0.05, 0.05, m.railing, 0, 1.05, (s * width) / 2);
    g2.add(rail);
    g2.add(box(len, 0.04, 0.04, m.railing, 0, 0.58, (s * width) / 2));
    const n = Math.max(2, Math.round(len / 2.2));
    for (let i = 0; i <= n; i++) {
      g2.add(cyl(0.04, 0.04, 1.05, m.railing, -len / 2 + (len * i) / n, 0.52, (s * width) / 2, 5));
    }
  }
  g2.position.set(cx, y, cz);
  g2.rotation.y = ang;
  g.add(g2);
  if (posts) {
    const n = Math.max(1, Math.round(len / 7));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const px = x1 + dx * t, pz = z1 + dz * t;
      const sg = Math.sign(y - 5);
      g.add(cyl(0.12, 0.12, Math.max(1, y), m.steelDark, px, Math.max(1, y) / 2, pz, 6));
      if (sg > 0) g.add(box(0.7, 0.12, 0.7, m.steelDark, px, y - 0.16, pz));
    }
  }
}

/** 电缆桥架：两侧边梁 + 横档 + 每 6m 吊架 */
function cableTray(g, m, { x1, z1, x2, z2, y, width = 0.7, height = 0.18 }) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const ang = -Math.atan2(dz, dx);
  const g2 = new THREE.Group();
  for (const s of [-1, 1]) g2.add(box(len, height, 0.06, m.steelDark, 0, 0, (s * width) / 2));
  g2.add(box(len, 0.05, width, m.cable, 0, -height / 2 + 0.02, 0));
  const n = Math.max(2, Math.round(len / 0.8));
  for (let i = 0; i <= n; i++) g2.add(box(0.05, 0.04, width, m.steelLight, -len / 2 + (len * i) / n, -height / 2 - 0.03, 0));
  g2.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
  g2.rotation.y = ang;
  g.add(g2);
  // 支架
  const ns = Math.max(1, Math.round(len / 6));
  for (let i = 0; i <= ns; i++) {
    const t = i / ns;
    const px = x1 + dx * t, pz = z1 + dz * t;
    g.add(box(0.14, y - 0.2, 0.14, m.steelDark, px, (y - 0.2) / 2, pz));
    g.add(box(0.9, 0.1, 0.1, m.steelDark, px, y - 0.24, pz));
  }
}

/** 消防立管：红色主管 + 每 8m 一个支管阀门 + 管卡 */
function fireRiser(g, m, { x, z, y0 = 0, y1 = 22, branches = [6, 14] }) {
  g.add(cyl(0.16, 0.16, y1 - y0, m.fireRed, x, y0 + (y1 - y0) / 2, z, 10));
  for (let y = y0 + 2; y < y1; y += 4) g.add(cyl(0.2, 0.2, 0.1, m.steelDark, x, y, z, 8));
  for (const by of branches) {
    g.add(cyl(0.11, 0.11, 1.6, m.fireRed, x + 0.8, by, z, 8, 0, 0, Math.PI / 2));
    g.add(torus(0.3, 0.045, m.fireRed, x + 1.6, by, z, 0, 0, 0, 12));
    g.add(box(0.3, 0.3, 0.24, m.fireRed, x + 1.6, by, z));
  }
  g.add(box(0.6, 0.12, 0.6, m.concreteSmooth, x, y0 + 0.06, z));
}

/** 阀门组：法兰阀体 + 手轮 + 短管 */
function valveBank(g, m, { x, y, z, n = 3, axis = 'x', spacing = 1.5, size = 0.3 }) {
  const along = axis === 'x' ? [1, 0] : [0, 1];
  for (let i = 0; i < n; i++) {
    const px = x + along[0] * i * spacing;
    const pz = z + along[1] * i * spacing;
    g.add(box(size * 1.5, size * 1.3, size * 1.3, m.steelDark, px, y, pz));
    // 两侧法兰
    for (const s of [-1, 1]) {
      g.add(cyl(size * 1.05, size * 1.05, 0.07, m.steelLight, px + along[0] * s * size * 1.1, y, pz + along[1] * s * size * 1.1, 12,
        0, 0, axis === 'x' ? Math.PI / 2 : 0));
      const dir = axis === 'x' ? [0, 0, 1] : [1, 0, 0];
      bolts(g, m, px + along[0] * s * size * 1.1, y, pz + along[1] * s * size * 1.1, dir, size * 0.9, 6);
    }
    // 阀杆与手轮
    g.add(cyl(0.06, 0.06, size * 2.2, m.steelLight, px, y + size * 1.1, pz, 6));
    g.add(torus(size * 0.72, 0.045, m.railing, px, y + size * 2.2, pz, 0, 0, 0, 14));
    for (const s of [-1, 1]) g.add(box(0.06, 0.06, size * 1.4, m.railing, px, y + size * 2.2, pz + s * size * 0.7));
  }
}

/** 法兰螺栓：沿法兰圆周的小圆柱 */
function bolts(g, m, x, y, z, dir, r, n) {
  const [dx, dy, dz] = dir;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // 在垂直于 dir 的平面内取圆
    const ux = Math.abs(dx) > 0.5 ? 0 : 1;
    const vx = Math.abs(dz) > 0.5 ? 0 : 1;
    const px = x + Math.cos(a) * r * ux + (dx ? 0 : 0);
    const pz = z + Math.cos(a) * r * vx;
    const py = y + Math.sin(a) * r * (Math.abs(dy) > 0.5 ? 0 : (dx || dz ? 1 : 0));
    g.add(cyl(0.035, 0.035, 0.12, m.steelDark, px, py, pz, 4, dx ? Math.PI / 2 : 0, 0, dz ? Math.PI / 2 : 0));
  }
}

/** 保温层接缝与捆扎带：沿水平管道每 step 米一个箍 */
function pipeStraps(g, m, { x, y, z, len, axis = 'x', r = 0.4, step = 2.4, seam = true }) {
  const n = Math.max(2, Math.round(len / step));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const px = axis === 'x' ? x + (t - 0.5) * len : x;
    const pz = axis === 'z' ? z + (t - 0.5) * len : z;
    g.add(cyl(r * 1.03, r * 1.03, 0.05, m.steelLight, px, y, pz, 14, 0, 0, axis === 'x' ? Math.PI / 2 : 0));
  }
  if (seam) {
    // 纵向接缝
    g.add(box(len, 0.05, 0.06, m.steelDark, x, y + r * 0.98, z));
  }
}

/* ---------------- 现场布置 ---------------- */

function fccDetails(g, m) {
  // 再生器框架（90,-80，高 34，平台 9/18/27）
  frame(g, m, { x: 90, z: -80, w: 17, d: 17, h: 30, levels: [9, 18, 27] });
  for (const y of [9, 18, 27]) {
    // 框架 → 塔体平台的连接走道（塔体外半径 6.35）
    for (const s of [-1, 1]) {
      walkway(g, m, { x1: 90 + s * 8.5, z1: -80, x2: 90 + s * 5.2, z2: -80, y, width: 1.3, posts: false });
    }
    deck(g, m, { x: 90 + 8.5, y, z: -80, w: 2.4, d: 2.2, rails: false });
  }
  stairs(g, 90 + 8.8, -80 - 9.6, 0, 9, m.steel, { rotY: Math.PI, width: 1.2, run: 7 });

  // 反应器框架（70,-72，高 38，塔外半径 4.45）
  frame(g, m, { x: 70, z: -72, w: 12, d: 12, h: 32, levels: [10, 20, 30] });
  for (const y of [10, 20, 30]) {
    walkway(g, m, { x1: 70, z1: -72 + 6, x2: 70, z2: -72 + 3.6, y, width: 1.2, posts: false });
  }
  stairs(g, 70 + 6.6, -72 + 6.6, 0, 10, m.steel, { rotY: -Math.PI / 2, width: 1.2, run: 7 });

  // 塔体之间的层间走道（反应器 → 再生器，22m）
  walkway(g, m, { x1: 76, z1: -72, x2: 84, z2: -76, y: 20, width: 1.4 });

  // 电缆桥架：鼓风机房 → 再生器框架；主分馏塔 → 变电所
  cableTray(g, m, { x1: 104, z1: -96, x2: 96, z2: -86, y: 6.2 });
  cableTray(g, m, { x1: 96, z1: -86, x2: 90, z2: -86, y: 6.2 });
  cableTray(g, m, { x1: 112, z1: -46, x2: 112, z2: -30, y: 5.6 });

  // 消防立管 + 阀门组
  fireRiser(g, m, { x: 62, z: -88, y1: 20, branches: [7, 15] });
  fireRiser(g, m, { x: 118, z: -66, y1: 16, branches: [6, 12] });
  valveBank(g, m, { x: 64, y: 1.2, z: -66, n: 3, axis: 'x', spacing: 1.6 });
  valveBank(g, m, { x: 78, y: 1.2, z: -76, n: 2, axis: 'z', spacing: 1.6 });

  // 保温层捆扎带（催化剂立管 + 主蒸汽线）
  pipeStraps(g, m, { x: 73, y: 3.2, z: -76, len: 12, axis: 'x', r: 0.62, step: 2.0 });
  pipeStraps(g, m, { x: 96, y: 38, z: -86, len: 30, axis: 'x', r: 1.18, step: 3.0 });
}

function reformerDetails(g, m) {
  // 三台重整反应器（x=52/70/88, z=42）之间的层间走道
  for (const y of [7, 15, 22]) {
    // 分成两段，绕开塔体（塔半径 2.7）
    walkway(g, m, { x1: 55.2, z1: 42, x2: 66.8, z2: 42, y, width: 1.35 });
    walkway(g, m, { x1: 73.2, z1: 42, x2: 84.8, z2: 42, y, width: 1.35 });
  }
  // 端头楼梯 + 框架柱
  for (const x of [52, 70, 88]) {
    for (const y of [7, 15, 22]) g.add(box(0.2, 3.2, 0.2, m.steelDark, x, y + 1.6, 42));
  }
  stairs(g, 94, 42, 0, 7, m.steel, { rotY: Math.PI / 2, width: 1.2, run: 6 });

  // 电缆桥架 + 消防立管
  cableTray(g, m, { x1: 46, z1: 48, x2: 98, z2: 48, y: 4.4 });
  fireRiser(g, m, { x: 100, z: 56, y1: 18, branches: [6, 13] });
  valveBank(g, m, { x: 44, y: 1.2, z: 66, n: 4, axis: 'z', spacing: 1.4 });
  // 重整循环管束的保温接缝
  pipeStraps(g, m, { x: 70, y: 31, z: 50, len: 16, axis: 'z', r: 0.3, step: 2.0 });
}

function cduDetails(g, m) {
  // 常压塔（-48,-30）楼梯塔 + 平台走道
  stairs(g, -40.5, -22, 0, 8.5, m.steel, { rotY: -Math.PI / 2, width: 1.25, run: 7.5 });
  walkway(g, m, { x1: -40.5, z1: -22, x2: -44.5, z2: -25.5, y: 8.5, width: 1.2, posts: false });
  // 减压塔（-26,-56）楼梯
  stairs(g, -18, -56, 0, 8.5, m.steel, { rotY: Math.PI / 2, width: 1.2, run: 7.5 });
  // 两塔之间的层间走道
  walkway(g, m, { x1: -44, z1: -33, x2: -30, z2: -52, y: 17, width: 1.3 });

  // 换热器区桥架 + 阀门组（沿 z=-18 的换热器排）
  cableTray(g, m, { x1: -14, z1: -12, x2: 40, z2: -12, y: 4.6 });
  valveBank(g, m, { x: -12, y: 1.3, z: -24, n: 4, axis: 'x', spacing: 1.7 });
  valveBank(g, m, { x: 12, y: 1.3, z: -24, n: 3, axis: 'x', spacing: 1.7 });

  // 消防立管（塔前 / 炉前）
  fireRiser(g, m, { x: -70, z: -24, y1: 24, branches: [7, 16] });
  fireRiser(g, m, { x: -66, z: -4, y1: 14, branches: [5, 11] });

  // 塔顶蒸汽线的保温接缝 / 捆扎带
  pipeStraps(g, m, { x: -36, y: 62, z: -36, len: 14, axis: 'x', r: 0.46, step: 2.2 });
  pipeStraps(g, m, { x: -26, y: 55, z: -40, len: 28, axis: 'z', r: 0.42, step: 2.6 });

  // 塔体裙座周围的检修平台
  for (const [x, z, r] of [[-48, -30, 6.2], [-26, -56, 5.3]]) {
    deck(g, m, { x: x + r + 1.1, y: 2.2, z, w: 2.4, d: 2.6 });
    walkway(g, m, { x1: x + r + 2.2, z1: z, x2: x + r + 2.2, z2: z + 6, y: 2.2, width: 1.2, posts: false });
  }
}

export function addStructureDetails(plant, m) {
  const g = new THREE.Group();
  g.name = 'details';
  fccDetails(g, m);
  reformerDetails(g, m);
  cduDetails(g, m);
  plant.add(g);
  return g;
}