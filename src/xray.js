/* E4：X-Ray 透视（内部构件叠加）
 * bake 后按材质合并，无法单独降某台塔外壳的透明度，所以采用「内构件叠加」：
 * 为关键设备程序化生成简化内构件（塔板 / 填料层 / 旋风分离器 / 催化剂床 / 管束），
 * depthTest:false + 半透明 + 线框，透过外壳显示；关闭时整组 visible=false，
 * 因此关闭态画面与基线逐像素一致。
 */
import * as THREE from 'three';

const MAT = () => ({
  solid: new THREE.MeshBasicMaterial({
    color: 0x7fe8ff, transparent: true, opacity: 0.22, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  }),
  line: new THREE.MeshBasicMaterial({
    color: 0xbfefff, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false, wireframe: true,
  }),
  hot: new THREE.MeshBasicMaterial({
    color: 0xffb15c, transparent: true, opacity: 0.5, depthTest: false, depthWrite: false,
  }),
});

/** 塔器内构件：n 层塔板 + 降液管 + 顶部除沫器 */
function columnInternals(g, mat, { x, z, y0, y1, r, trays = 12, label }) {
  const h = y1 - y0;
  for (let i = 0; i < trays; i++) {
    const y = y0 + (h * (i + 0.5)) / trays;
    const tray = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.12, 24, 1, true), mat.solid);
    tray.position.set(x, y, z);
    tray.renderOrder = 20;
    g.add(tray);
    const hole = new THREE.Mesh(new THREE.TorusGeometry(r * 0.55, 0.05, 4, 26), mat.line);
    hole.position.set(x, y, z);
    hole.rotation.x = Math.PI / 2;
    hole.renderOrder = 21;
    g.add(hole);
    // 降液管
    const dc = new THREE.Mesh(new THREE.BoxGeometry(r * 0.26, h / trays * 0.9, r * 0.16), mat.line);
    dc.position.set(x + r * 0.62, y - h / trays * 0.45, z + (i % 2 ? r * 0.2 : -r * 0.2));
    dc.renderOrder = 21;
    g.add(dc);
  }
  const demist = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r * 0.92, 0.5, 20, 1, true), mat.line);
  demist.position.set(x, y1 - 1.4, z);
  demist.renderOrder = 21;
  g.add(demist);
  return { x, z, y: (y0 + y1) / 2, r, label, y0, y1 };
}

/** 反应器：催化剂床 + 旋风分离器（锥 + 料腿） */
function reactorInternals(g, mat, { x, z, y0, y1, r, beds = 2, cyclones = 2, label }) {
  const h = y1 - y0;
  for (let i = 0; i < beds; i++) {
    const y = y0 + h * (0.25 + i * 0.3);
    const bed = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.9, h * 0.16, 22, 1, true), mat.hot);
    bed.position.set(x, y, z);
    bed.renderOrder = 20;
    g.add(bed);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.9, 0.06, 4, 24), mat.line);
    ring.position.set(x, y + h * 0.08, z);
    ring.rotation.x = Math.PI / 2;
    ring.renderOrder = 21;
    g.add(ring);
  }
  for (let i = 0; i < cyclones; i++) {
    const a = (i / cyclones) * Math.PI * 2;
    const cx = x + Math.cos(a) * r * 0.45;
    const cz = z + Math.sin(a) * r * 0.45;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.2, h * 0.2, 12, 1, true), mat.solid);
    body.position.set(cx, y1 - h * 0.22, cz);
    body.renderOrder = 20;
    g.add(body);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r * 0.2, h * 0.12, 12, 1, true), mat.line);
    cone.position.set(cx, y1 - h * 0.38, cz);
    cone.rotation.x = Math.PI;
    cone.renderOrder = 21;
    g.add(cone);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, h * 0.28, 8), mat.line);
    leg.position.set(cx, y1 - h * 0.56, cz);
    leg.renderOrder = 21;
    g.add(leg);
  }
  return { x, z, y: (y0 + y1) / 2, r, label, y0, y1 };
}

/** 换热器组：管束（细长管阵列）+ 管板 */
function exchangerInternals(g, mat, { x, z, w, h, d, label }) {
  const tubes = 7;
  for (let i = 0; i < tubes; i++) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, w * 0.94, 8), mat.line);
    t.rotation.z = Math.PI / 2;
    t.position.set(x, 0.7 + (i % 3) * 1.1, z + (Math.floor(i / 3) - 1) * 1.6);
    t.renderOrder = 21;
    g.add(t);
  }
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.2, h * 0.8, d * 0.8), mat.solid);
  plate.position.set(x - w * 0.42, h * 0.55, z);
  plate.renderOrder = 20;
  g.add(plate);
  return { x, z, y: h * 0.6, r: w * 0.4, label };
}

export function createXray({ scene, m }) {
  const root = new THREE.Group();
  root.name = 'xray';
  root.visible = false;
  scene.add(root);
  const mat = MAT();
  const spots = [];

  function build() {
    if (spots.length) return;
    // 常压塔 / 减压塔 / 汽提塔 / 稳定塔
    spots.push(columnInternals(root, mat, { x: -48, z: -30, y0: 2, y1: 56, r: 4.2, trays: 18, label: '常压塔 18 层塔板 · 顶部除沫器' }));
    spots.push(columnInternals(root, mat, { x: -26, z: -56, y0: 2, y1: 48, r: 3.2, trays: 14, label: '减压塔 14 层塔板 · 规整填料' }));
    spots.push(columnInternals(root, mat, { x: -62, z: -56, y0: 1, y1: 30, r: 2.0, trays: 8, label: '汽提塔 8 层塔板' }));
    spots.push(columnInternals(root, mat, { x: -10, z: -64, y0: 1, y1: 41, r: 2.6, trays: 10, label: '稳定塔 10 层塔板' }));
    // FCC 反应器 / 再生器
    spots.push(reactorInternals(root, mat, { x: 70, z: -72, y0: 3, y1: 37, r: 2.6, beds: 2, cyclones: 2, label: 'FCC 反应器 2 段催化剂床 · 2 组旋风分离器' }));
    spots.push(reactorInternals(root, mat, { x: 90, z: -80, y0: 3, y1: 51, r: 4.4, beds: 3, cyclones: 3, label: 'FCC 再生器 3 段催化剂床 · 3 组旋风分离器' }));
    // 连续重整 3 台反应器
    for (let i = 0; i < 3; i++) {
      const x = 58 + i * 12;
      spots.push(reactorInternals(root, mat, { x, z: 42, y0: 2, y1: 26, r: 2.6, beds: 2, cyclones: 0, label: `重整反应器 R-${i + 1} 催化剂床` }));
    }
    // 换热器组（管束）
    spots.push(exchangerInternals(root, mat, { x: 11, z: -18, w: 50, h: 5.5, d: 8, label: '常减压换热网络 管束 / 管板' }));
  }

  function setVisible(on) {
    if (on) build();
    root.visible = !!on;
    return root.visible;
  }

  /** 相机附近最近的内构件（透视时 HUD 显示） */
  function nearest(camera) {
    if (!root.visible || !spots.length) return null;
    let best = null;
    let bd = Infinity;
    for (const s of spots) {
      const d = camera.position.distanceTo(new THREE.Vector3(s.x, s.y, s.z));
      if (d < bd) { bd = d; best = s; }
    }
    return best ? { label: best.label, distance: +bd.toFixed(1) } : null;
  }

  return { setVisible, nearest, root, spots };
}