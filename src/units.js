import * as THREE from 'three';
import {
  mesh, box, cyl, sphere, torus, pipeRun, railingRing, railingLine,
  ladder, stairs, makeGlow, valve, pipeSupport,
} from './helpers.js';

const V = (x, y, z) => [x, y, z];

/* ------------------------------------------------------------------ */
/*  Storage tank (floating roof)                                       */
/* ------------------------------------------------------------------ */
export function storageTank(m, { r = 17, h = 17 } = {}) {
  const g = new THREE.Group();

  // foundation ring
  g.add(cyl(r + 1.5, r + 1.7, 1.1, m.concreteSmooth, 0, 0.55, 0, 40));
  // shell
  g.add(cyl(r, r * 1.005, h, m.shell, 0, h / 2, 0, 48));
  // wind girders
  for (const f of [0.42, 0.75]) {
    g.add(torus(r + 0.05, 0.16, m.steelLight, 0, h * f, 0, Math.PI / 2, 0, 0, 48));
  }
  // rim + floating roof
  g.add(torus(r, 0.22, m.steelDark, 0, h, 0, Math.PI / 2, 0, 0, 48));
  g.add(cyl(r * 0.975, r * 0.975, 0.85, m.shellWhite, 0, h + 0.4, 0, 48));
  const roof = cyl(r * 0.975, r * 0.82, 1.0, m.shellWhite, 0, h + 1.2, 0, 48);
  g.add(roof);
  g.add(torus(r * 0.975, 0.12, m.steelLight, 0, h + 0.85, 0, Math.PI / 2, 0, 0, 48));
  // rim seal
  g.add(torus(r * 0.995, 0.18, m.steelDark, 0, h + 0.25, 0, Math.PI / 2, 0, 0, 48));

  // roof fittings
  for (const a of [0.5, 2.4, 4.2]) {
    g.add(cyl(0.5, 0.5, 0.5, m.steel, Math.cos(a) * r * 0.55, h + 1.6, Math.sin(a) * r * 0.55, 10));
  }
  g.add(pipeRun([V(0, h + 1.7, 0), V(0, h + 4.2, 0), V(3, h + 4.2, 0)], 0.16, m.pipeGray));

  // spiral stair
  const turns = 3.1;
  const steps = Math.round((h / 0.3));
  const stairR = r + 1.05;
  const stairG = new THREE.Group();
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    const y = 1.1 + t * (h - 1.1);
    const tread = box(1.25, 0.06, 0.34, m.railingGray, Math.cos(a) * stairR, y, Math.sin(a) * stairR);
    tread.rotation.y = -a;
    stairG.add(tread);
    if (i % 3 === 0) {
      stairG.add(cyl(0.045, 0.045, 1.05, m.railingGray, Math.cos(a) * (stairR + 0.55), y + 0.5, Math.sin(a) * (stairR + 0.55), 5));
    }
  }
  // helix handrail
  for (const [rr, hh] of [[stairR + 0.55, 1.05], [stairR + 0.55, 0.55]]) {
    const pts = [];
    for (let i = 0; i <= 90; i++) {
      const t = i / 90;
      const a = t * turns * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * rr, 1.1 + t * (h - 1.1) + hh, Math.sin(a) * rr));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    stairG.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 140, 0.05, 5, false), m.railingGray));
  }
  g.add(stairG);

  // nozzles at base
  for (const [a, y] of [[0.4, 1.8], [2.6, 1.8], [4.6, 2.4]]) {
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const len = 2.2;
    g.add(pipeRun([V(x, y, z), V(x + Math.cos(a) * len, y, z + Math.sin(a) * len)], 0.42, m.pipeSilver));
    g.add(torus(0.62, 0.1, m.steelDark, x + Math.cos(a) * len, y, z + Math.sin(a) * len, 0, 0, 0, 14));
  }
  // vertical ladder
  ladder(g, r * 0.72, r * 0.72, 1.0, h - 1.3, m.ladder, { rotY: Math.PI * 0.25 });
  return g;
}

/* ------------------------------------------------------------------ */
/*  Spherical LPG tank                                                 */
/* ------------------------------------------------------------------ */
export function sphereTank(m, { r = 8 } = {}) {
  const g = new THREE.Group();
  const cy = r + 6.5;
  g.add(cyl(r + 1.2, r + 1.5, 0.9, m.concreteSmooth, 0, 0.45, 0, 32));
  const ball = sphere(r, m.shellWhite, 0, cy, 0, 32, 24);
  g.add(ball);
  // meridian welds
  for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
    g.add(torus(r * 0.99, 0.07, m.steelLight, 0, cy, 0, 0, a, 0, 36));
  }
  // legs
  const legs = 8;
  for (let i = 0; i < legs; i++) {
    const a = (i / legs) * Math.PI * 2 + 0.2;
    const x = Math.cos(a) * r * 0.82, z = Math.sin(a) * r * 0.82;
    const legTop = cy - Math.sqrt(Math.max(0.1, r * r - (r * 0.82) ** 2)) + 1.2;
    g.add(cyl(0.32, 0.4, legTop, m.steelDark, x, legTop / 2, z, 8));
    g.add(box(1.6, 0.35, 1.6, m.concreteSmooth, x, 0.3, z));
    // brace
    g.add(box(0.22, r * 1.1, 0.22, m.steelDark, x, legTop * 0.55, z, 0, -a, 0.55));
  }
  // equator platform
  const pr = r * 0.9;
  railingRing(g, pr, cy - 0.2, m.railingGray, { posts: 14, height: 1.05 });
  const ringG = new THREE.RingGeometry(r * 0.72, pr + 0.1, 40);
  const ring = new THREE.Mesh(ringG, m.grating);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = cy - 0.25;
  ring.receiveShadow = true;
  g.add(ring);
  // top platform + ladder
  g.add(cyl(0.9, 0.9, 0.35, m.steelLight, 0, cy + r - 0.2, 0, 12));
  ladder(g, 0, r * 0.98, 0.9, cy + r * 0.85, m.ladder, { rotY: -Math.PI / 2 });
  // nozzles
  g.add(pipeRun([V(0, cy + r, 0), V(0, cy + r + 2.6, 0), V(2.4, cy + r + 2.6, 0)], 0.3, m.pipeSilver));
  g.add(pipeRun([V(r * 0.9, cy - r * 0.35, 0), V(r + 2.2, cy - r * 0.35, 0)], 0.36, m.pipeSilver));
  return g;
}

/* ------------------------------------------------------------------ */
/*  Distillation / process column                                      */
/* ------------------------------------------------------------------ */
export function column(m, { r = 4, h = 48, topR = null, insulated = true, platforms = null } = {}) {
  const g = new THREE.Group();
  const skin = insulated ? m.insulation : m.shellWhite;
  const tr = topR ?? r * 0.94;

  g.add(cyl(r + 1.2, r + 1.5, 1.0, m.concreteSmooth, 0, 0.5, 0, 32));
  g.add(cyl(r + 0.42, r + 0.7, 3.4, m.steelDark, 0, 1.7, 0, 28)); // skirt
  g.add(cyl(r, r * 1.02, h - 3.4, skin, 0, 3.4 + (h - 3.4) / 2, 0, 36));
  // top head
  const head = sphere(tr, skin, 0, h, 0, 32, 16);
  head.scale.set(1, 0.55, 1);
  g.add(head);
  g.add(cyl(tr * 1.01, tr, 0.8, m.steelLight, 0, h, 0, 32));

  // decorative weld bands
  for (let y = 6; y < h - 2; y += 5.5) {
    g.add(torus(r + 0.03, 0.07, m.steelLight, 0, y, 0, Math.PI / 2, 0, 0, 36));
  }

  // platforms
  const levels = platforms ?? (() => {
    const arr = [];
    for (let y = 8; y < h - 3; y += 8.5) arr.push(y);
    return arr;
  })();
  for (const y of levels) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 1.45, 36), m.grating);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = y;
    ring.receiveShadow = true;
    g.add(ring);
    // toe plate
    g.add(cyl(r + 1.45, r + 1.45, 0.14, m.railingGray, 0, y + 0.07, 0, 36, 0, 0, 0));
    railingRing(g, r + 1.4, y, m.railing, { posts: 14, height: 1.05 });
  }

  // vertical ladder through platforms
  ladder(g, r + 0.55, 0, 1.0, h - 2.5, m.ladder, { rotY: Math.PI / 2 });

  // nozzles / manways
  const angles = [0.35, 1.9, 3.4, 4.9];
  for (let i = 0; i < angles.length; i++) {
    const a = angles[i];
    const y = 9 + i * (h - 15) / angles.length;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const len = 1.8 + (i % 2) * 0.8;
    g.add(pipeRun([
      V(x * 0.92, y, z * 0.92),
      V(x + Math.cos(a) * len, y, z + Math.sin(a) * len),
      V(x + Math.cos(a) * len, y + 0.9, z + Math.sin(a) * len),
    ], 0.24, m.pipeGray));
    g.add(torus(0.36, 0.07, m.steelDark, x + Math.cos(a) * len, y + 0.9, z + Math.sin(a) * len, Math.PI / 2, 0, 0, 12));
  }
  // manways
  for (const [y, a] of [[14, 2.8], [26, 5.4], [38, 1.2]]) {
    if (y > h - 6) continue;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const mw = cyl(0.55, 0.55, 0.3, m.steelDark, x, y, z, 12, Math.PI / 2, 0, -a + Math.PI / 2);
    g.add(mw);
  }

  // top nozzle + relief line
  g.add(pipeRun([V(0, h + tr * 0.5, 0), V(0, h + 3.6, 0), V(2.8, h + 3.6, 0), V(2.8, h + 1.2, 0)], 0.3, m.pipeSilver));
  g.add(cyl(1.0, 1.0, 0.5, m.steelLight, 0, h + 3.85, 0, 11));
  // relief valve
  g.add(box(0.7, 0.8, 0.7, m.fireRed, 2.8, h + 4.2, 0));
  // skirt access
  g.add(box(1.1, 2.2, 0.12, m.steelDark, r + 0.45, 1.6, 0, 0, Math.PI / 2, 0));
  return g;
}

/* ------------------------------------------------------------------ */
/*  Fired heater / furnace                                             */
/* ------------------------------------------------------------------ */
export function furnace(m, { w = 20, d = 12, h = 14, stacks = 2 } = {}) {
  const g = new THREE.Group();
  g.add(box(w + 3, 1.2, d + 3, m.concreteSmooth, 0, 0.6, 0));
  g.add(box(w, h, d, m.buildingWarm, 0, 1.2 + h / 2, 0));
  // corner trim + ribs
  for (const x of [-w / 2, w / 2]) {
    for (const z of [-d / 2, d / 2]) {
      g.add(box(0.5, h, 0.5, m.rust, x, 1.2 + h / 2, z));
    }
  }
  // roof slab and convection section
  g.add(box(w + 1, 0.6, d + 1, m.roof, 0, h + 1.5, 0));
  g.add(box(w * 0.55, 3.2, d * 0.55, m.buildingWarm, -w * 0.15, h + 3.4, 0));
  // stacks
  for (let i = 0; i < stacks; i++) {
    const sx = -w * 0.15 + (i - (stacks - 1) / 2) * (w * 0.36);
    g.add(cyl(1.25, 1.5, 9, m.rust, sx, h + 8.4, -d * 0.12, 18));
    g.add(torus(1.35, 0.1, m.steelDark, sx, h + 12.4, -d * 0.12, Math.PI / 2, 0, 0, 18));
  }
  // burner fronts (south face)
  for (let i = 0; i < 4; i++) {
    const x = -w * 0.32 + (i * w * 0.64) / 3;
    g.add(box(1.6, 1.2, 0.35, m.steelDark, x, 2.0, d / 2 + 0.2));
    g.add(cyl(0.52, 0.52, 0.4, m.rust, x, 3.6, d / 2 + 0.2, 10, Math.PI / 2, 0, 0));
  }
  // exterior tube headers
  for (const z of [-d / 2 - 0.7, d / 2 + 0.7]) {
    g.add(pipeRun([V(-w / 2, 4.5, z), V(w / 2, 4.5, z)], 0.32, m.pipeGray));
    g.add(pipeRun([V(-w / 2, h + 0.2, z), V(w / 2, h + 0.2, z)], 0.32, m.pipeGray));
    for (let i = 0; i <= 5; i++) {
      const x = -w / 2 + (w * i) / 5;
      g.add(cyl(0.16, 0.16, h - 4, m.pipeGray, x, 4.5 + (h - 4) / 2, z, 8));
    }
  }
  // stair + platform
  stairs(g, w * 0.35, d / 2 + 1.2, 0, h + 1.2, m.railingGray, { rotY: 0, run: 8 });
  g.add(box(3.4, 0.12, d * 0.45, m.grating, w * 0.35, h + 1.2, d * 0.2));
  railingLine(g, w * 0.35 - 1.6, d / 2 + 1.2, w * 0.35 + 1.6, d / 2 + 1.2, h + 1.2, m.railing);
  return g;
}

/* ------------------------------------------------------------------ */
/*  Shell & tube heat exchanger                                        */
/* ------------------------------------------------------------------ */
export function heatExchanger(m, { r = 1.25, l = 8 } = {}) {
  const g = new THREE.Group();
  const body = cyl(r, r, l, m.steelLight, 0, 3.2, 0, 20);
  body.rotation.z = Math.PI / 2;
  g.add(body);
  for (const s of [-1, 1]) {
    const hd = sphere(r * 1.02, m.steelLight, (s * l) / 2, 3.2, 0, 18, 12);
    hd.scale.set(0.5, 1, 1);
    g.add(hd);
  }
  // saddles
  for (const x of [-l * 0.28, l * 0.28]) {
    g.add(box(0.5, 2.0, 1.9, m.concreteSmooth, x, 1.0, 0));
    g.add(box(0.9, 0.4, r * 1.7, m.steelDark, x, 2.4, 0));
  }
  // nozzles
  g.add(cyl(0.3, 0.3, 1.4, m.pipeGray, -l * 0.3, 3.2 + r + 0.5, 0, 10));
  g.add(cyl(0.3, 0.3, 1.4, m.pipeGray, l * 0.3, 3.2 + r + 0.5, 0, 10));
  g.add(cyl(0.26, 0.26, 1.2, m.pipeGray, l * 0.42, 3.2 - r - 0.4, 0, 10));
  // small platform
  g.add(box(l * 0.7, 0.08, 1.1, m.grating, 0, 2.7, -r - 0.65));
  return g;
}

/* ------------------------------------------------------------------ */
/*  Air cooler                                                         */
/* ------------------------------------------------------------------ */
export function airCooler(m, { w = 10, d = 6 } = {}) {
  const g = new THREE.Group();
  const y0 = 5.2;
  g.add(box(w, 0.35, d, m.steelDark, 0, y0, 0));
  g.add(box(w - 0.5, 2.0, d - 0.5, m.grating, 0, y0 + 1.2, 0));
  for (const x of [-w / 2 + 0.8, w / 2 - 0.8]) {
    for (const z of [-d / 2 + 0.7, d / 2 - 0.7]) {
      g.add(box(0.35, y0, 0.35, m.steelDark, x, y0 / 2, z));
    }
  }
  // fans
  const fans = Math.max(2, Math.round(w / 3.2));
  for (let i = 0; i < fans; i++) {
    const x = -w / 2 + (w / fans) * (i + 0.5);
    g.add(torus(1.55, 0.1, m.steelDark, x, y0 + 2.3, 0, Math.PI / 2, 0, 0, 24));
    for (let b = 0; b < 4; b++) {
      const bl = box(1.35, 0.08, 0.5, m.steelLight, x, y0 + 2.3, 0);
      bl.rotation.y = (b * Math.PI) / 2 + 0.4;
      g.add(bl);
    }
    g.add(cyl(0.35, 0.35, 0.25, m.steelLight, x, y0 + 2.3, 0, 10));
  }
  return g;
}

/* ------------------------------------------------------------------ */
/*  Pipe rack                                                          */
/* ------------------------------------------------------------------ */
export function pipeRack(m, {
  length = 60, height = 8, levels = 2, spacing = 7,
  pipes = [[0.55, 'silver'], [0.42, 'yellow'], [0.3, 'green'], [0.24, 'silver'], [0.18, 'red']],
  closed = true,
} = {}) {
  const g = new THREE.Group();
  const bays = Math.max(1, Math.round(length / spacing));
  const step = length / bays;
  const width = 5.4;
  const colors = { silver: m.pipeSilver, yellow: m.pipeYellow, green: m.pipeGreen, red: m.pipeRed, orange: m.pipeOrange, gray: m.pipeGray };

  for (let i = 0; i <= bays; i++) {
    const x = -length / 2 + i * step;
    for (const z of [-width / 2, width / 2]) {
      g.add(box(0.28, height + 1.2, 0.28, m.steelDark, x, (height + 1.2) / 2, z));
      g.add(box(1.1, 0.4, 1.1, m.concreteSmooth, x, 0.2, z));
    }
    for (let l = 0; l < levels; l++) {
      const y = height * (0.55 + 0.45 * (l / Math.max(1, levels - 1)));
      g.add(box(0.24, 0.34, width + 0.6, m.steelDark, x, y, 0));
    }
    // bracing
    if (i < bays) {
      const brace = box(0.14, 0.14, Math.hypot(step, width), m.steelDark, x + step / 2, height * 0.45, 0);
      brace.rotation.x = Math.atan2(width, step);
      g.add(brace);
    }
  }
  // longitudinal beams
  for (const z of [-width / 2, width / 2]) {
    for (let l = 0; l < levels; l++) {
      const y = height * (0.55 + 0.45 * (l / Math.max(1, levels - 1)));
      g.add(box(length, 0.3, 0.3, m.steelDark, 0, y, z));
    }
  }

  // pipes along the rack
  pipes.forEach(([radius, color], idx) => {
    const y = height * 0.55 + 0.5 + (idx % 3) * 0.5;
    const z = -width / 2 + 1.0 + ((idx * 1.35) % (width - 1.4));
    const pts = [];
    const n = Math.max(2, bays * 2);
    for (let i = 0; i <= n; i++) pts.push(V(-length / 2 + (length * i) / n, y, z));
    g.add(pipeRun(pts, radius, colors[color] || m.pipeSilver));
    // flanges at bay joints
    for (let i = 1; i < bays; i++) {
      const x = -length / 2 + i * step;
      g.add(torus(radius * 1.6, radius * 0.4, m.steelDark, x, y, z, 0, 0, 0, 12));
    }
    if (idx % 2 === 1) {
      value: {
        const x = -length / 2 + step * (1 + (idx % (bays - 1)));
        valve(g, x, y + radius + 0.35, z, m.steelDark, 0.34);
      }
    }
  });

  // cable tray
  g.add(box(length, 0.12, 1.5, m.grating, 0, height * 0.5 + 0.1, width / 2 - 1.2));
  for (let c = 0; c < 3; c++) {
    g.add(box(length, 0.1, 0.12, m.cable, 0, height * 0.5 + 0.28, width / 2 - 1.7 + c * 0.45));
  }
  if (closed) {
    // vertical drops at ends
    for (const s of [-1, 1]) {
      g.add(pipeRun([V((s * length) / 2, height * 0.55 + 0.75, 0), V((s * length) / 2, 0.6, 0)], 0.34, m.pipeSilver));
    }
  }
  return g;
}

/* ------------------------------------------------------------------ */
/*  Cooling tower                                                      */
/* ------------------------------------------------------------------ */
export function coolingTower(m, { rBase = 17, rThroat = 11, rTop = 13, h = 28 } = {}) {
  const g = new THREE.Group();
  // profile (hyperboloid)
  const pts = [
    new THREE.Vector2(rBase * 1.04, 0),
    new THREE.Vector2(rBase, h * 0.08),
    new THREE.Vector2(rBase * 0.78, h * 0.35),
    new THREE.Vector2(rThroat, h * 0.62),
    new THREE.Vector2(rThroat * 1.02, h * 0.75),
    new THREE.Vector2(rTop, h * 0.92),
    new THREE.Vector2(rTop * 1.02, h),
  ];
  const shellMat = m.concreteSmooth.clone();
  shellMat.side = THREE.DoubleSide;
  shellMat.color = new THREE.Color(0xb9b6ad);
  const shell = new THREE.Mesh(new THREE.LatheGeometry(pts, 56), shellMat);
  shell.castShadow = true;
  shell.receiveShadow = true;
  g.add(shell);
  // rim
  g.add(torus(rTop * 1.02, 0.22, m.concreteSmooth, 0, h, 0, Math.PI / 2, 0, 0, 48));
  // legs
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    g.add(box(0.7, 3.4, 0.55, m.concreteSmooth, Math.cos(a) * rBase * 0.97, 1.7, Math.sin(a) * rBase * 0.97, 0, -a, 0));
  }
  // basin water
  const water = new THREE.Mesh(new THREE.CircleGeometry(rBase * 1.15, 48), m.water);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.35;
  g.add(water);
  g.add(cyl(rBase * 1.2, rBase * 1.22, 1.6, m.concrete, 0, 0.8, 0, 48));
  // ladder
  ladder(g, 0, rBase * 1.01, 3.0, h * 0.75, m.ladder, { rotY: Math.PI / 2 });
  return g;
}

/* ------------------------------------------------------------------ */
/*  Flare stack                                                        */
/* ------------------------------------------------------------------ */
export function flareStack(m, { h = 72, r = 1.0 } = {}) {
  const g = new THREE.Group();
  g.add(cyl(r * 2.6, r * 3.2, 1.6, m.concreteSmooth, 0, 0.8, 0, 24));
  g.add(cyl(r * 0.72, r, h, m.steel, 0, h / 2, 0, 20));
  // stiffening rings
  for (let y = 8; y < h; y += 10) {
    g.add(torus(r * 0.75 + (r * 0.25 * y) / h, 0.09, m.steelDark, 0, y, 0, Math.PI / 2, 0, 0, 20));
  }
  // ladder
  ladder(g, r * 0.9, 0, 1.6, h - 2, m.ladder, { rotY: Math.PI / 2 });
  // tip + steam ring
  g.add(cyl(r * 1.1, r * 0.8, 1.4, m.steelDark, 0, h + 0.6, 0, 16));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    g.add(cyl(0.16, 0.16, 1.6, m.pipeGray, Math.cos(a) * 1.5, h + 1.6, Math.sin(a) * 1.5, 6, 0.4, 0, 0));
  }
  g.add(createFlareFlame(m, { h }));
  return g;
}

/** 只创建火炬顶部的火焰 / 烟雾 / 光晕，供预烘焙场景补充动态代理 */
export function createFlareFlame(m, { h = 72 } = {}) {
  const flame = new THREE.Group();
  const f1 = new THREE.Mesh(new THREE.ConeGeometry(2.0, 9, 14, 1, true), m.flame.clone());
  f1.position.y = h + 5.6;
  flame.add(f1);
  const f2 = new THREE.Mesh(new THREE.ConeGeometry(1.0, 5.5, 12, 1, true), m.flameCore.clone());
  f2.position.y = h + 3.9;
  flame.add(f2);
  const glow = makeGlow(m.glowTex, 0xffa347, 34, 0.85);
  glow.position.y = h + 6;
  flame.add(glow);
  for (let i = 0; i < 9; i++) {
    const s = makeGlow(m.smokeTex, 0x2a2a30, 8 + i * 2.6, 0.14 - i * 0.008);
    s.position.set(1.5 + i * 1.9, h + 9 + i * 3.4, 0.8);
    flame.add(s);
  }
  return flame;
}

/* ------------------------------------------------------------------ */
/*  Chimney                                                            */
/* ------------------------------------------------------------------ */
export function chimney(m, { h = 34, r = 2.2 } = {}) {
  const g = new THREE.Group();
  g.add(cyl(r * 1.7, r * 2.1, 1.2, m.concreteSmooth, 0, 0.6, 0, 24));
  g.add(cyl(r * 0.72, r, h, m.shellWhite, 0, h / 2, 0, 24));
  for (let i = 1; i <= 3; i++) {
    g.add(torus(r * (1 - (0.28 * i) / 3) + 0.06, 0.09, m.steelDark, 0, (h * i) / 3.4, 0, Math.PI / 2, 0, 0, 24));
  }
  // red / white banding near top
  g.add(cyl(r * 0.74, r * 0.76, 4.0, m.fireRed, 0, h - 2.5, 0, 24));
  g.add(cyl(r * 0.72, r * 0.74, 2.0, m.shellWhite, 0, h - 0.8, 0, 24));
  // aviation light
  g.add(sphere(0.35, m.beacon, 0, h + 0.2, 0, 8, 6));
  return g;
}

/* ------------------------------------------------------------------ */
/*  Buildings                                                          */
/* ------------------------------------------------------------------ */
export function building(m, { w = 30, d = 16, h = 9, floors = 3, glass = false } = {}) {
  const g = new THREE.Group();
  g.add(box(w + 1.5, 0.4, d + 1.5, m.concreteSmooth, 0, 0.2, 0));
  g.add(box(w, h, d, glass ? m.glass : m.building, 0, h / 2 + 0.4, 0));
  // horizontal floor bands
  for (let f = 1; f < floors; f++) {
    g.add(box(w + 0.4, 0.28, d + 0.4, m.buildingWarm, 0, 0.4 + (h * f) / floors, 0));
  }
  // window strips
  const fh = h / floors;
  for (let f = 0; f < floors; f++) {
    for (const s of [-1, 1]) {
      const strip = box(w * 0.86, fh * 0.46, 0.12, m.window, 0, 0.4 + fh * (f + 0.55), (s * d) / 2 + 0.05);
      g.add(strip);
    }
    for (const s of [-1, 1]) {
      g.add(box(0.12, fh * 0.46, d * 0.7, m.window, (s * w) / 2 + 0.05, 0.4 + fh * (f + 0.55), 0));
    }
  }
  // roof
  g.add(box(w + 0.8, 0.35, d + 0.8, m.roof, 0, h + 0.55, 0));
  railingLine(g, -w / 2, -d / 2, w / 2, -d / 2, h + 0.7, m.railingGray, { height: 0.9 });
  railingLine(g, -w / 2, d / 2, w / 2, d / 2, h + 0.7, m.railingGray, { height: 0.9 });
  // rooftop units
  for (const x of [-w * 0.28, 0, w * 0.28]) {
    g.add(box(3.2, 1.4, 2.2, m.steelLight, x, h + 1.4, 0));
  }
  // entrance canopy
  g.add(box(9, 0.3, 3.4, m.roof, 0, 3.1, d / 2 + 1.7));
  for (const s of [-1, 1]) g.add(cyl(0.16, 0.16, 3.1, m.steel, (s * 4.2), 1.55, d / 2 + 3.2, 8));
  return g;
}

/* ------------------------------------------------------------------ */
/*  Truck loading gantry                                               */
/* ------------------------------------------------------------------ */
export function loadingGantry(m, { w = 34, d = 10 } = {}) {
  const g = new THREE.Group();
  // canopy
  g.add(box(w, 0.5, d, m.roof, 0, 6.5, 0));
  for (let i = 0; i < 5; i++) {
    const x = -w / 2 + (w / 4) * i;
    for (const z of [-d / 2 + 0.8, d / 2 - 0.8]) {
      g.add(box(0.4, 6.5, 0.4, m.steelDark, x, 3.25, z));
    }
    g.add(torus(0.6, 0.09, m.steelDark, x, 6.2, 0, Math.PI / 2, 0, 0, 12));
  }
  // loading arms + pipes
  for (let i = 0; i < 4; i++) {
    const x = -w / 2 + 5 + i * 7.5;
    g.add(pipeRun([V(x, 6.2, 0), V(x, 4.2, 0), V(x, 4.2, 1.8), V(x + 1.2, 3.6, 2.4)], 0.15, m.pipeSilver));
    g.add(box(0.5, 0.5, 0.5, m.steelDark, x, 6.2, 0));
  }
  // concrete islands
  for (const z of [-3.7, 3.7]) {
    g.add(box(w, 0.45, 3.2, m.concreteSmooth, 0, 0.22, z));
  }
  return g;
}

export function tankTruck(m) {
  const g = new THREE.Group();
  // tractor
  g.add(box(2.4, 2.2, 2.2, m.carBody, -4.4, 1.5, 0));
  g.add(box(2.2, 1.0, 2.0, m.carDark, -4.4, 2.7, 0));
  // trailer tank
  const tank = cyl(1.5, 1.5, 8.5, m.tankTruck, 1.4, 2.6, 0, 18);
  tank.rotation.z = Math.PI / 2;
  g.add(tank);
  g.add(sphere(1.5, m.tankTruck, -2.9, 2.6, 0, 14, 10));
  // wheels
  for (const x of [-4.8, -0.5, 3.0, 4.2]) {
    for (const z of [-1.1, 1.1]) {
      g.add(cyl(0.62, 0.62, 0.4, m.carDark, x, 0.62, z, 12, Math.PI / 2, 0, 0));
    }
  }
  return g;
}

export function car(m, color = 0x99a2ab) {
  const g = new THREE.Group();
  const bodyMat = m.carBody.clone();
  bodyMat.color = new THREE.Color(color);
  g.add(box(4.3, 0.9, 1.9, bodyMat, 0, 0.75, 0));
  g.add(box(2.4, 0.8, 1.75, bodyMat, -0.2, 1.5, 0));
  for (const x of [-1.4, 1.4]) {
    for (const z of [-0.85, 0.85]) {
      g.add(cyl(0.36, 0.36, 0.28, m.carDark, x, 0.36, z, 10, Math.PI / 2, 0, 0));
    }
  }
  return g;
}

/* ------------------------------------------------------------------ */
/*  Substation / transformer                                           */
/* ------------------------------------------------------------------ */
export function transformer(m) {
  const g = new THREE.Group();
  g.add(box(4.6, 0.4, 3.6, m.concreteSmooth, 0, 0.2, 0));
  g.add(box(3.4, 3.2, 2.4, m.steelDark, 0, 2.0, 0));
  for (let i = 0; i < 6; i++) {
    g.add(box(0.12, 2.6, 0.9, m.steelDark, -1.9, 2.1, -1.3 + i * 0.52));
  }
  for (let i = 0; i < 3; i++) {
    g.add(cyl(0.16, 0.22, 1.6, m.shellWhite, -0.9 + i * 0.9, 4.4, 0, 8));
    g.add(cyl(0.35, 0.35, 0.25, m.steelDark, -0.9 + i * 0.9, 5.2, 0, 10));
  }
  return g;
}

/* ------------------------------------------------------------------ */
/*  Lamp post                                                          */
/* ------------------------------------------------------------------ */
export function lampPost(m, { h = 9, warm = true } = {}) {
  const g = new THREE.Group();
  g.add(cyl(0.14, 0.2, h, m.steelDark, 0, h / 2, 0, 8));
  g.add(box(1.6, 0.16, 0.16, m.steelDark, 0.7, h, 0));
  const headMat = warm ? m.lampWarm : m.lampCool;
  g.add(box(0.9, 0.22, 0.55, headMat, 1.35, h - 0.16, 0));
  g.add(box(0.9, 0.3, 0.6, m.steelDark, 1.35, h + 0.05, 0));
  return g;
}

/* ------------------------------------------------------------------ */
/*  Trees / vegetation                                                 */
/* ------------------------------------------------------------------ */
export function tree(m, { s = 1, seed = 1 } = {}) {
  const g = new THREE.Group();
  const h = 5.5 * s;
  g.add(cyl(0.18 * s, 0.3 * s, h, m.trunk, 0, h / 2, 0, 6));
  const r = 2.3 * s;
  g.add(mesh(new THREE.IcosahedronGeometry(r, 0), m.treeLeaf, 0, h + r * 0.6, 0));
  g.add(mesh(new THREE.IcosahedronGeometry(r * 0.75, 0), m.treeLeaf2, r * 0.7, h + r * 0.2, r * 0.35));
  g.add(mesh(new THREE.IcosahedronGeometry(r * 0.68, 0), m.treeLeaf2, -r * 0.65, h + r * 0.35, -r * 0.3));
  return g;
}

/* ------------------------------------------------------------------ */
/*  Lattice transmission tower (skyline)                               */
/* ------------------------------------------------------------------ */
export function latticeTower(m, { h = 46, base = 7 } = {}) {
  const g = new THREE.Group();
  const topW = 1.4;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of corners) {
    const p1 = new THREE.Vector3((sx * base) / 2, 0, (sz * base) / 2);
    const p2 = new THREE.Vector3((sx * topW) / 2, h, (sz * topW) / 2);
    const mid = p1.clone().add(p2).multiplyScalar(0.5);
    const dir = p2.clone().sub(p1);
    const len = dir.length();
    const leg = box(0.22, len, 0.22, m.steelDark, mid.x, mid.y, mid.z);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    g.add(leg);
  }
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    const w = base + (topW - base) * t;
    const y = h * t;
    for (const [sx, sz] of corners) {
      g.add(box(0.14, 0.14, w, m.steelDark, sx * w / 2, y, 0));
      g.add(box(w, 0.14, 0.14, m.steelDark, 0, y, sz * w / 2));
    }
  }
  // cross arms
  for (const y of [h * 0.65, h * 0.8]) {
    const arm = base * 0.75;
    g.add(box(arm * 2, 0.22, 0.22, m.steelDark, 0, y, 0));
    for (const s of [-1, 1]) {
      g.add(cyl(0.1, 0.1, 1.0, m.glass, s * arm, y - 0.6, 0, 6));
    }
  }
  return g;
}