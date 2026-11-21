import * as THREE from 'three';
import { box, cyl, sphere, torus, pipeRun, railingLine, ladder, labelSprite, leaderLine, makeGlow, valve, pipeSupport } from './helpers.js';
import {
  storageTank, sphereTank, column, furnace, heatExchanger, airCooler, pipeRack,
  coolingTower, flareStack, chimney, building, loadingGantry, tankTruck, car,
  transformer, lampPost, tree, latticeTower, createFlareFlame,
} from './units.js';

const V = (x, y, z) => [x, y, z];

function pump(m) {
  const g = new THREE.Group();
  g.add(box(2.2, 0.3, 1.6, m.concreteSmooth, 0, 0.15, 0));
  g.add(cyl(0.55, 0.55, 1.6, m.steelLight, -0.3, 0.9, 0, 12, 0, 0, Math.PI / 2));
  g.add(box(1.1, 0.9, 0.9, m.blue, 0.9, 0.85, 0));
  g.add(cyl(0.18, 0.18, 1.1, m.pipeGray, -0.3, 1.7, 0, 8));
  return g;
}

function steamColumn(m, { x, z, y, h = 38, count = 7, size = 9, tint = 0xdfe6ea }) {
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const s = makeGlow(m.smokeTex, tint, size * (0.55 + t * 1.5), 0.15 * (1 - t * 0.75));
    s.position.set(x + t * 9 + Math.sin(i * 2.1) * 2.4, y + t * h, z + Math.cos(i * 1.7) * 2.2);
    g.add(s);
  }
  return g;
}

function createTankFarm(m) {
  const g = new THREE.Group();
  g.name = 'tankfarm';

  const positions = [
    [-181, -76], [-140, -76], [-181, -34], [-140, -34],
    [-181, 34], [-140, 34],
  ];
  for (const [x, z] of positions) {
    const t = storageTank(m, { r: 17, h: 17 });
    t.position.set(x, 0, z);
    g.add(t);
  }
  for (const [x, z] of [[-178, 76], [-146, 76], [-116, 60]]) {
    const s = sphereTank(m, { r: 7.4 });
    s.position.set(x, 0, z);
    g.add(s);
  }

  // tank farm manifold + pipes
  const header = new THREE.Group();
  header.add(pipeRack(m, { length: 90, height: 4.5, levels: 1, spacing: 9, pipes: [[0.45, 'silver'], [0.34, 'yellow'], [0.28, 'green'], [0.22, 'gray']], closed: false }));
  header.position.set(-158, 0, -6);
  g.add(header);

  for (const [x, z] of positions.slice(0, 4)) {
    g.add(pipeRun([V(x + 8, 1.4, z + 8), V(-124, 1.4, z + 8), V(-124, 4.2, z + 8), V(-124, 4.2, -6)], 0.34, m.pipeSilver));
  }
  for (const [x, z] of [[-178, 76], [-146, 76]]) {
    g.add(pipeRun([V(x, 3.4, z - 7), V(-124, 3.4, z - 7), V(-124, 3.4, -6)], 0.28, m.pipeYellow));
  }
  // send-out line toward process units
  g.add(pipeRun([V(-112, 4.2, -6), V(-96, 4.2, -6), V(-96, 1.4, -6), V(-70, 1.4, -6)], 0.45, m.pipeSilver));

  // pumps at tank outlet
  for (const [x, z] of [[-110, -40], [-110, -20], [-110, 20]]) {
    const p = pump(m);
    p.position.set(x, 0, z);
    p.rotation.y = Math.PI / 2;
    g.add(p);
  }
  // fire water ring
  g.add(pipeRun([V(-206, 1.2, -100), V(-108, 1.2, -100), V(-108, 1.2, 90), V(-206, 1.2, 90), V(-206, 1.2, -100)], 0.26, m.pipeRed));

  return g;
}

function createCDU(m) {
  const g = new THREE.Group();
  g.name = 'cdu';

  const colA = column(m, { r: 4.4, h: 56 });
  colA.position.set(-48, 0, -30);
  g.add(colA);

  const colB = column(m, { r: 3.7, h: 49 });
  colB.position.set(-26, 0, -56);
  g.add(colB);

  const colC = column(m, { r: 2.3, h: 31, insulated: false });
  colC.position.set(-62, 0, -56);
  g.add(colC);

  const colD = column(m, { r: 2.8, h: 42, insulated: false });
  colD.position.set(-10, 0, -64);
  g.add(colD);

  const f = furnace(m, { w: 20, d: 12, h: 14 });
  f.position.set(-56, 0, -4);
  g.add(f);

  // exchanger train
  for (let i = 0; i < 6; i++) {
    const e = heatExchanger(m, { r: 1.2, l: 8.5 });
    e.position.set(-10 + i * 8.4, 0, -18);
    e.rotation.y = Math.PI / 2;
    g.add(e);
  }
  // air coolers
  for (const [x, z, rot] of [[-28, 8, 0], [8, 6, 0], [-52, 8, 0]]) {
    const ac = airCooler(m, { w: 12, d: 6 });
    ac.position.set(x, 0, z);
    ac.rotation.y = rot;
    g.add(ac);
  }

  // piping
  g.add(pipeRun([V(-110, 1.4, -6), V(-72, 1.4, -6), V(-72, 2.2, -10), V(-66, 2.2, -8)], 0.42, m.pipeSilver));
  g.add(pipeRun([V(-50, 2.0, -8), V(-42, 2.0, -14), V(-42, 2.0, -25)], 0.4, m.pipeSilver));
  // overhead vapour lines
  g.add(pipeRun([V(-48, 58, -30), V(-48, 62, -30), V(-36, 62, -36), V(-30, 54, -50), V(-30, 51, -56)], 0.42, m.pipeGray));
  g.add(pipeRun([V(-26, 50, -56), V(-26, 55, -56), V(14, 55, -56), V(14, 55, -22), V(14, 12, -20)], 0.38, m.pipeGray));
  g.add(pipeRun([V(-10, 43, -64), V(-10, 47, -64), V(4, 47, -46), V(4, 47, -28), V(4, 17, -26)], 0.3, m.pipeGray));
  // side draw to stripper
  g.add(pipeRun([V(-42, 24, -34), V(-52, 24, -42), V(-58, 24, -52), V(-58, 14, -56)], 0.26, m.pipeOrange));
  // reflux / rundown
  g.add(pipeRun([V(-26, 12, -56), V(-16, 12, -56), V(-16, 3.2, -40), V(-16, 3.2, -22), V(-10, 3.2, -18)], 0.3, m.pipeYellow));
  g.add(pipeRun([V(-8, 3.0, -18), V(6, 3.0, -18), V(6, 3.0, -10)], 0.28, m.pipeGreen));
  // furnace outlet risers
  g.add(pipeRun([V(-46, 2.2, -6), V(-32, 2.2, -6), V(-32, 2.2, -24)], 0.34, m.pipeOrange));
  // pumps
  for (let i = 0; i < 4; i++) {
    const p = pump(m);
    p.position.set(-4 + i * 5, 0, -6);
    g.add(p);
  }
  // valve manifolds
  for (let i = 0; i < 5; i++) {
    valve(g, -12 + i * 8.4, 5.6, -18, m.steelDark, 0.4);
  }
  // rack inside unit
  const r = pipeRack(m, { length: 46, height: 6.5, levels: 1, spacing: 6, pipes: [[0.3, 'silver'], [0.24, 'yellow'], [0.2, 'green'], [0.16, 'gray']], closed: false });
  r.position.set(-40, 0, -72);
  g.add(r);

  return g;
}

function createFCC(m) {
  const g = new THREE.Group();
  g.name = 'fcc';

  // reactor / riser
  const reactor = column(m, { r: 3.0, h: 38, insulated: false });
  reactor.position.set(70, 0, -72);
  g.add(reactor);
  g.add(cyl(1.25, 1.25, 16, m.pipeGray, 70, 8, -78, 14));

  // regenerator
  const regen = column(m, { r: 4.9, h: 34, platforms: [9, 18, 27] });
  regen.position.set(90, 0, -80);
  g.add(regen);
  // regenerator cyclones
  for (const [dx, dz] of [[-2.2, -1.6], [2.2, 1.6]]) {
    g.add(cyl(1.1, 1.5, 9, m.steelLight, 90 + dx, 40, -80 + dz, 14));
    g.add(cyl(0.9, 0.9, 6, m.pipeGray, 90 + dx, 47, -80 + dz, 10));
  }
  // catalyst standpipes
  g.add(pipeRun([V(86, 8, -80), V(80, 8, -80), V(80, 3, -76), V(73, 3, -74)], 0.6, m.pipeGray));

  // main fractionator
  const frac = column(m, { r: 4.3, h: 46 });
  frac.position.set(112, 0, -52);
  g.add(frac);
  // product stripper
  const strip = column(m, { r: 2.2, h: 30, insulated: false });
  strip.position.set(122, 0, -78);
  g.add(strip);

  // flue gas duct + stack
  g.add(pipeRun([
    V(90, 34, -80), V(96, 38, -86), V(132, 38, -96), V(138, 34, -100),
  ], 1.15, m.steelDark));
  const st = chimney(m, { h: 44, r: 2.6 });
  st.position.set(142, 0, -104);
  g.add(st);

  // air blower + catalyst hopper
  g.add(box(8, 4, 5, m.steelLight, 104, 3.4, -96));
  g.add(cyl(2.2, 2.2, 7, m.steelLight, 104, 8, -96, 14));
  const hopper = sphere(3.2, m.shellWhite, 58, 22, -96, 18, 12);
  g.add(hopper);
  g.add(cyl(0.9, 0.9, 8, m.steelDark, 58, 12, -96, 10));

  // air coolers
  for (const [x, z] of [[92, -58], [104, -58]]) {
    const ac = airCooler(m, { w: 11, d: 6 });
    ac.position.set(x, 0, z);
    g.add(ac);
  }
  // piping
  g.add(pipeRun([V(70, 39, -72), V(70, 43, -72), V(104, 43, -66), V(104, 40, -58)], 0.5, m.pipeGray));
  g.add(pipeRun([V(112, 47, -52), V(112, 51, -52), V(128, 51, -60), V(128, 51, -76), V(128, 24, -78)], 0.34, m.pipeGray));
  g.add(pipeRun([V(90, 6, -80), V(90, 6, -60), V(100, 6, -56), V(108, 6, -56)], 0.55, m.pipeOrange));
  g.add(pipeRun([V(108, 3, -52), V(126, 3, -52), V(126, 3, -20)], 0.3, m.pipeYellow));
  // pumps + exchangers
  for (let i = 0; i < 3; i++) {
    const e = heatExchanger(m, { r: 1.1, l: 7.5 });
    e.position.set(48 + i * 9, 0, -52);
    g.add(e);
  }
  for (let i = 0; i < 3; i++) {
    const p = pump(m);
    p.position.set(52 + i * 8, 0, -40);
    g.add(p);
  }
  // local rack
  const r = pipeRack(m, { length: 70, height: 7, levels: 2, spacing: 7, pipes: [[0.36, 'silver'], [0.3, 'yellow'], [0.24, 'gray'], [0.2, 'green']], closed: false });
  r.position.set(84, 0, -34);
  g.add(r);

  return g;
}

function createReformer(m) {
  const g = new THREE.Group();
  g.name = 'reformer';

  for (let i = 0; i < 3; i++) {
    const c = column(m, { r: 2.7, h: 27, insulated: false, platforms: [7, 15, 22] });
    c.position.set(52 + i * 18, 0, 42);
    g.add(c);
    g.add(pipeRun([V(52 + i * 18, 28, 42), V(52 + i * 18, 32, 42), V(52 + i * 18, 32, 58), V(60, 32, 62)], 0.24, m.pipeYellow));
  }
  const f = furnace(m, { w: 18, d: 11, h: 13, stacks: 2 });
  f.position.set(58, 0, 76);
  g.add(f);

  g.add(box(22, 9, 14, m.building, 96, 4.5, 74));
  g.add(box(22.6, 0.4, 14.6, m.roof, 96, 9.2, 74));
  g.add(box(3, 2.4, 0.3, m.steelDark, 96, 2.2, 81.2));

  for (let i = 0; i < 4; i++) {
    const e = heatExchanger(m, { r: 1.0, l: 7 });
    e.position.set(38 + i * 7, 0, 62);
    e.rotation.y = Math.PI / 2;
    g.add(e);
  }
  // reformer loop piping
  g.add(pipeRun([V(52, 2.2, 42), V(48, 2.2, 42), V(48, 2.2, 74), V(52, 2.2, 74)], 0.3, m.pipeSilver));
  g.add(pipeRun([V(88, 2.2, 42), V(100, 2.2, 42), V(100, 2.2, 66), V(106, 2.2, 68)], 0.28, m.pipeSilver));
  g.add(pipeRun([V(70, 27, 42), V(70, 31, 42), V(64, 31, 58), V(62, 16, 72)], 0.26, m.pipeGray));
  const r = pipeRack(m, { length: 50, height: 6, levels: 1, spacing: 7, pipes: [[0.28, 'silver'], [0.22, 'yellow'], [0.18, 'gray']], closed: false });
  r.position.set(70, 0, 26);
  g.add(r);

  return g;
}

function createUtilities(m) {
  const g = new THREE.Group();
  g.name = 'utilities';

  for (const [x, z] of [[-22, 88], [18, 92]]) {
    const ct = coolingTower(m, { rBase: 17, rThroat: 11, rTop: 13, h: 28 });
    ct.position.set(x, 0, z);
    g.add(ct);
    g.add(steamColumn(m, { x, z, y: 29, h: 40, count: 8, size: 13 }));
  }
  // boiler house
  const bh = building(m, { w: 26, d: 13, h: 10, floors: 1 });
  bh.position.set(0, 0, 60);
  g.add(bh);
  for (const x of [-9, 9]) {
    const ch = chimney(m, { h: 36, r: 1.8 });
    ch.position.set(x, 0, 54);
    g.add(ch);
    g.add(steamColumn(m, { x, z: 54, y: 37, h: 22, count: 4, size: 7, tint: 0xcfd6d8 }));
  }
  // water / chemical tanks
  const t1 = column(m, { r: 3.2, h: 14, insulated: false });
  t1.position.set(-36, 0, 66);
  g.add(t1);
  const st = sphereTank(m, { r: 6 });
  st.position.set(-36, 0, 100);
  g.add(st);
  // pipe rack to units
  const r = pipeRack(m, { length: 58, height: 5.5, levels: 1, spacing: 6, pipes: [[0.34, 'green'], [0.28, 'silver'], [0.22, 'red'], [0.18, 'gray']], closed: false });
  r.position.set(6, 0, 48);
  g.add(r);
  // electrical
  for (const x of [-108, -96]) {
    const tr = transformer(m);
    tr.position.set(x, 0, 108);
    g.add(tr);
  }
  const lt = latticeTower(m, { h: 46, base: 7 });
  lt.position.set(-78, 0, 96);
  g.add(lt);

  return g;
}

function createAdmin(m) {
  const g = new THREE.Group();
  g.name = 'admin';
  const b = building(m, { w: 34, d: 18, h: 12, floors: 4 });
  b.position.set(-112, 0, 152);
  g.add(b);
  const ctrl = building(m, { w: 24, d: 13, h: 8, floors: 2, glass: true });
  ctrl.position.set(-80, 0, 148);
  g.add(ctrl);
  // parking
  g.add(box(34, 0.1, 16, m.concreteSmooth, -108, 0.1, 172));
  const colors = [0xb9c0c7, 0x7b8794, 0x9a4b3f, 0x2f3a45, 0xd6d2c4, 0x5d6f7e];
  for (let i = 0; i < 6; i++) {
    const c = car(m, colors[i]);
    c.position.set(-122 + i * 5.6, 0, 172);
    c.rotation.y = Math.PI / 2;
    g.add(c);
  }
  return g;
}

function createLoading(m) {
  const g = new THREE.Group();
  g.name = 'loading';
  const lg = loadingGantry(m, { w: 36, d: 10 });
  lg.position.set(172, 0, 74);
  g.add(lg);
  for (let i = 0; i < 3; i++) {
    const t = tankTruck(m);
    t.position.set(156 + i * 13, 0, 80);
    g.add(t);
  }
  // product pipes to gantry
  g.add(pipeRun([V(140, 6.2, 74), V(154, 6.2, 74)], 0.28, m.pipeSilver));
  g.add(pipeRun([V(140, 1.2, 64), V(164, 1.2, 64), V(164, 1.2, 69)], 0.24, m.pipeYellow));
  return g;
}

function createMisc(m) {
  const g = new THREE.Group();
  const wh = building(m, { w: 40, d: 24, h: 10, floors: 1 });
  wh.position.set(125, 0, 145);
  g.add(wh);
  // maintenance workshop
  g.add(box(18, 7, 12, m.building, -62, 3.5, 178));
  g.add(box(19, 0.4, 13, m.roof, -62, 7.2, 178));

  // perimeter fence
  const fence = new THREE.Group();
  const X0 = -238, X1 = 238, Z0 = -178, Z1 = 178;
  const pts = [];
  const corners = [[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1]];
  for (let s = 0; s < 4; s++) {
    const [ax, az] = corners[s];
    const [bx, bz] = corners[(s + 1) % 4];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.round(len / 10);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (s === 0 && Math.abs(x + 100) < 8) continue;
      if (s === 3 && Math.abs(z - 122) < 9) continue;
      fence.add(box(0.12, 2.6, 0.12, m.steelDark, x, 1.3, z));
      pts.push([x, 1.6, z], [x + (bx - ax) / n, 1.6, z + (bz - az) / n]);
      pts.push([x, 2.4, z], [x + (bx - ax) / n, 2.4, z + (bz - az) / n]);
    }
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0x6c7378, transparent: true, opacity: 0.55 }));
  lines.userData.noBake = true;
  fence.add(lines);
  g.add(fence);

  // lamp posts along roads
  const lampPositions = [
    [-180, 132], [-120, 132], [-60, 132], [0, 132], [60, 132], [120, 132], [180, 132],
    [-140, -128], [-60, -128], [20, -128], [100, -128], [180, -128],
    [-90, 60], [-90, 10], [-90, -40], [-90, -90],
  ];
  for (const [x, z] of lampPositions) {
    const l = lampPost(m, { h: 10 });
    l.position.set(x, 0, z);
    const halo = makeGlow(m.glowTex, 0xffc07a, 7.5, 0.5);
    halo.position.set(1.35, 9.6, 0);
    l.add(halo);
    g.add(l);
  }

  // trees / landscaping
  const treePositions = [
    [-146, 140, 1.1], [-136, 156, 0.9], [-126, 138, 1.0], [-70, 130, 0.85],
    [-40, 118, 0.9], [20, 110, 0.8], [70, 112, 0.95], [100, 108, 0.85],
    [130, 112, 0.9], [168, 104, 0.8], [-150, 120, 1.0], [-60, 162, 0.9],
    [40, 160, 1.0], [88, 160, 0.85], [150, 172, 0.9], [-200, 120, 1.0],
    [-220, -120, 1.1], [-220, -60, 0.95], [-218, 20, 1.0], [225, -140, 1.0],
    [232, 60, 1.05], [150, -160, 0.9], [60, -160, 1.0], [-40, -160, 0.9],
    [-140, -160, 1.0], [200, 160, 1.0], [-190, 160, 0.95], [110, 170, 0.8],
  ];
  for (const [x, z, s] of treePositions) {
    const t = tree(m, { s });
    t.position.set(x, 0, z);
    g.add(t);
  }
  // distant transmission towers
  for (const [x, z] of [[-210, -155], [226, -108]]) {
    const lt = latticeTower(m, { h: 42, base: 8 });
    lt.position.set(x, 0, z);
    g.add(lt);
  }
  return g;
}

function createPipeCorridor(m) {
  const g = new THREE.Group();
  g.name = 'racks';

  const main = pipeRack(m, {
    length: 236, height: 9.5, levels: 2, spacing: 8,
    pipes: [[0.55, 'silver'], [0.42, 'yellow'], [0.34, 'green'], [0.3, 'gray'], [0.24, 'silver'], [0.2, 'red'], [0.18, 'orange']],
    closed: false,
  });
  main.position.set(8, 0, 8);
  g.add(main);

  const north = pipeRack(m, {
    length: 64, height: 9.5, levels: 2, spacing: 8,
    pipes: [[0.45, 'silver'], [0.3, 'yellow'], [0.24, 'green'], [0.2, 'gray']],
    closed: false,
  });
  north.rotation.y = Math.PI / 2;
  north.position.set(58, 0, -24);
  g.add(north);

  const south = pipeRack(m, {
    length: 26, height: 9.5, levels: 1, spacing: 8,
    pipes: [[0.4, 'silver'], [0.26, 'yellow'], [0.2, 'gray']],
    closed: false,
  });
  south.rotation.y = Math.PI / 2;
  south.position.set(52, 0, 22);
  g.add(south);

  // drops into units
  g.add(pipeRun([V(58, 9.9, -54), V(58, 6, -64), V(58, 6, -72)], 0.4, m.pipeSilver));
  g.add(pipeRun([V(52, 9.9, 34), V(52, 6, 40), V(52, 6, 42)], 0.34, m.pipeSilver));
  g.add(pipeRun([V(-96, 9.9, 8), V(-96, 4, 8), V(-96, 4, -6)], 0.45, m.pipeSilver));

  return g;
}

function createLabels(m, g = new THREE.Group()) {
  g.name = 'labels';
  const items = [
    { t: '原油罐区', s: 'Crude Oil Storage', p: [-172, 46, 6], a: [-165, 22, 0] },
    { t: '常减压蒸馏', s: 'CDU / VDU', p: [-18, 82, -26], a: [-38, 58, -32] },
    { t: '催化裂化', s: 'FCC Unit', p: [124, 74, -58], a: [100, 44, -74] },
    { t: '连续重整', s: 'CCR Reformer', p: [64, 58, 54], a: [62, 30, 43] },
    { t: '产品装卸', s: 'Product Loading', p: [212, 38, 72], a: [184, 15, 70] },
    { t: '公用工程', s: 'Utilities', p: [-62, 58, 92], a: [-20, 30, 90] },
    { t: '火炬系统', s: 'Flare System', p: [188, 104, -128], a: [174, 76, -120] },
  ];
  for (const it of items) {
    const sp = labelSprite(it.t, it.s, { accent: '#5fd0ff', scale: 1.55 });
    sp.position.set(...it.p);
    g.add(sp);
    const line = leaderLine(it.a, [it.p[0], it.p[1] - 4.2, it.p[2]]);
    line.userData.noBake = true;
    g.add(line);
  }
  g.visible = false;
  return g;
}

function createNightGlow(m, g = new THREE.Group()) {
  g.name = 'nightglow';
  const add = (x, y, z, size = 5, opacity = 0.8, color = 0xffc27a) => {
    const s = makeGlow(m.glowTex, color, size, opacity);
    s.position.set(x, y, z);
    g.add(s);
  };
  // pipe corridor deck lights
  for (let x = -100; x <= 120; x += 20) add(x, 11.5, 8, 4.5, 0.65);
  // CDU columns / platforms
  for (const [x, z, hs] of [[-48, -30, [14, 30, 46]], [-26, -56, [14, 30, 44]], [-62, -56, [12, 22]]]) {
    for (const y of hs) add(x + 5.6, y, z, 4.2, 0.6);
  }
  // FCC
  for (const [x, z, hs] of [[70, -72, [16, 30]], [90, -80, [14, 26]], [112, -52, [16, 32, 44]]]) {
    for (const y of hs) add(x + 5.2, y, z, 4.2, 0.6);
  }
  // reformer
  for (const x of [52, 70, 88]) add(x + 3.4, 24, 42, 3.8, 0.55);
  // tank farm rim lights
  for (const [x, z] of [[-181, -76], [-140, -76], [-181, -34], [-140, -34], [-181, 34], [-140, 34]]) {
    add(x + 17, 17.5, z, 4.6, 0.5);
  }
  for (const [x, z] of [[-178, 76], [-146, 76], [-116, 60]]) add(x, 21, z, 4.6, 0.5);
  // utilities / cooling towers / loading / admin
  add(-22, 24, 71, 6, 0.5);
  add(18, 24, 75, 6, 0.5);
  add(6, 9, 66, 5, 0.5);
  for (const x of [152, 165, 178, 191]) add(x, 7.4, 74, 4.4, 0.6);
  add(-112, 14, 145, 4, 0.4);
  add(-80, 9, 142, 4, 0.4);
  add(125, 11, 134, 4, 0.4);
  // flare base work lights
  add(168, 6, -116, 6, 0.6, 0xffa347);
  g.visible = false;
  return g;
}

export function createPlant(m) {
  const root = new THREE.Group();
  root.name = 'plant';

  root.add(createTankFarm(m));
  root.add(createCDU(m));
  root.add(createFCC(m));
  root.add(createReformer(m));
  root.add(createUtilities(m));
  root.add(createAdmin(m));
  root.add(createLoading(m));
  root.add(createMisc(m));
  root.add(createPipeCorridor(m));

  // flare
  const fl = flareStack(m, { h: 74 });
  fl.position.set(172, 0, -120);
  root.add(fl);

  // steam / vapour from FCC stack
  root.add(steamColumn(m, { x: 142, z: -104, y: 46, h: 30, count: 6, size: 9, tint: 0xc9d2d6 }));

  const labels = createLabels(m);
  root.add(labels);
  const nightGlow = createNightGlow(m);
  root.add(nightGlow);

  return { root, labels, nightGlow };
}
/* ------------------------------------------------------------------ */
/* 预烘焙场景用的动态装饰：标签、夜间光晕、蒸汽、火炬火焰                  */
/* ------------------------------------------------------------------ */
function createSteamDecor(m) {
  const g = new THREE.Group();
  g.name = 'steam-decor';
  for (const [x, z] of [[-22, 88], [18, 92]]) {
    g.add(steamColumn(m, { x, z, y: 29, h: 40, count: 8, size: 13 }));
  }
  for (const x of [-9, 9]) {
    g.add(steamColumn(m, { x, z: 54, y: 37, h: 22, count: 4, size: 7, tint: 0xcfd6d8 }));
  }
  g.add(steamColumn(m, { x: 142, z: -104, y: 46, h: 30, count: 6, size: 9, tint: 0xc9d2d6 }));
  return g;
}

export function createPlantDecor(m, target = null) {
  // target：冷启动时先用空 group 占位（动画 / 交互已持有引用），首帧后再填充内容
  const root = target?.root || new THREE.Group();
  root.name = 'plant-decor';
  const labels = createLabels(m, target?.labels);
  const nightGlow = createNightGlow(m, target?.nightGlow);
  if (!target) root.add(labels, nightGlow);
  root.add(createSteamDecor(m));
  // 控制室玻璃幕墙在 bakeStatic 中因 transparent 被跳过，快照模式需补回
  root.add(box(24, 8, 13, m.glass, -80, 4.4, 148));
  const flame = createFlareFlame(m, { h: 74 });
  flame.position.set(172, 0, -120);
  root.add(flame);
  return { root, labels, nightGlow };
}
