import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();

export function mesh(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function box(w, h, d, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx, ry, rz);
}

export function cyl(rTop, rBot, h, mat, x = 0, y = 0, z = 0, seg = 20, rx = 0, ry = 0, rz = 0) {
  return mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat, x, y, z, rx, ry, rz);
}

export function sphere(r, mat, x = 0, y = 0, z = 0, wSeg = 20, hSeg = 14) {
  return mesh(new THREE.SphereGeometry(r, wSeg, hSeg), mat, x, y, z);
}

export function torus(r, tube, mat, x = 0, y = 0, z = 0, rx = Math.PI / 2, ry = 0, rz = 0, seg = 24) {
  return mesh(new THREE.TorusGeometry(r, tube, 8, seg), mat, x, y, z, rx, ry, rz);
}

/* -------- pipe runs with welded elbows (cylinder segments + sphere joints) -------- */
export function pipeRun(points, radius, mat, { seg = 10, group = new THREE.Group(), flanges = false } = {}) {
  for (let i = 0; i < points.length - 1; i++) {
    const a = new THREE.Vector3(...points[i]);
    const b = new THREE.Vector3(...points[i + 1]);
    const dir = b.clone().sub(a);
    const len = dir.length();
    if (len < 1e-4) continue;
    const g = new THREE.CylinderGeometry(radius, radius, len, seg, 1, false);
    const m = new THREE.Mesh(g, mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }
  for (let i = 0; i < points.length; i++) {
    const isEnd = i === 0 || i === points.length - 1;
    if (isEnd && !flanges) continue;
    const p = new THREE.Vector3(...points[i]);
    const prev = i > 0 ? new THREE.Vector3(...points[i - 1]) : null;
    const next = i < points.length - 1 ? new THREE.Vector3(...points[i + 1]) : null;
    const d1 = prev ? p.clone().sub(prev).normalize() : null;
    const d2 = next ? next.clone().sub(p).normalize() : null;
    if (d1 && d2 && d1.dot(d2) > 0.999) continue; // straight pass-through
    group.add(sphere(radius * 1.18, mat, p.x, p.y, p.z, 10, 8));
  }
  if (flanges) {
    for (const i of [0, points.length - 1]) {
      const p = new THREE.Vector3(...points[i]);
      const toward = i === 0 ? new THREE.Vector3(...points[1]) : new THREE.Vector3(...points[i - 1]);
      const dir = toward.clone().sub(p).normalize();
      const t = torus(radius * 1.7, radius * 0.42, mat, p.x, p.y, p.z, Math.PI / 2, 0, 0, 12);
      t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      t.position.copy(p);
      group.add(t);
    }
  }
  return group;
}

/* -------- railings -------- */
export function railingRing(group, radius, y, mat, { posts = 12, height = 1.1, thickness = 0.055 } = {}) {
  group.add(torus(radius, thickness, mat, 0, y + height, 0, Math.PI / 2, 0, 0, 40));
  group.add(torus(radius, thickness * 0.75, mat, 0, y + height * 0.55, 0, Math.PI / 2, 0, 0, 40));
  for (let i = 0; i < posts; i++) {
    const a = (i / posts) * Math.PI * 2;
    group.add(cyl(thickness, thickness, height, mat, Math.cos(a) * radius, y + height / 2, Math.sin(a) * radius, 6));
  }
}

export function railingLine(group, x1, z1, x2, z2, y, mat, { height = 1.1, spacing = 2.2, thickness = 0.05 } = {}) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const n = Math.max(2, Math.round(len / spacing));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    group.add(cyl(thickness, thickness, height, mat, x1 + dx * t, y + height / 2, z1 + dz * t, 6));
  }
  for (const hh of [height, height * 0.55]) {
    const g = new THREE.BoxGeometry(len, thickness * 1.4, thickness * 1.4);
    const m = new THREE.Mesh(g, mat);
    m.position.set((x1 + x2) / 2, y + hh, (z1 + z2) / 2);
    m.rotation.y = -Math.atan2(dz, dx);
    m.castShadow = true;
    group.add(m);
  }
}

/* -------- ladders / stairs -------- */
export function ladder(group, x, z, y0, height, mat, { rotY = 0, width = 0.62, rung = 0.42 } = {}) {
  const g = new THREE.Group();
  g.position.set(x, y0, z);
  g.rotation.y = rotY;
  for (const s of [-1, 1]) {
    g.add(cyl(0.045, 0.045, height, mat, (s * width) / 2, height / 2, 0, 6));
  }
  for (let y = 0.4; y < height; y += rung) {
    g.add(cyl(0.028, 0.028, width, mat, 0, y, 0, 5, 0, 0, Math.PI / 2));
  }
  // safety hoops for tall ladders
  if (height > 8) {
    for (let y = 3; y < height; y += 3) {
      const t = torus(width * 0.85, 0.03, mat, 0, y, -0.35, 0, 0, 0, 14);
      t.rotation.y = Math.PI / 2;
      g.add(t);
    }
  }
  group.add(g);
  return group;
}

export function stairs(group, x, z, y0, y1, mat, { rotY = 0, width = 1.3, run = 4.8 } = {}) {
  const steps = Math.max(4, Math.round((y1 - y0) / 0.24));
  const g = new THREE.Group();
  g.position.set(x, y0, z);
  g.rotation.y = rotY;
  const dz = run / steps;
  for (let i = 0; i < steps; i++) {
    g.add(box(width, 0.06, dz * 1.15, mat, 0, (i + 1) * ((y1 - y0) / steps), -i * dz));
  }
  for (const s of [-1, 1]) {
    const len = Math.hypot(run, y1 - y0);
    const stringer = box(0.09, 0.34, len, mat, (s * width) / 2, (y1 - y0) / 2 - 0.1, -run / 2 + 0.1);
    stringer.rotation.x = Math.atan2(y1 - y0, run);
    g.add(stringer);
    for (const hh of [0.95, 0.55]) {
      const rail = box(0.05, 0.05, len, mat, (s * width) / 2, (y1 - y0) / 2 + hh, -run / 2 + 0.1);
      rail.rotation.x = Math.atan2(y1 - y0, run);
      g.add(rail);
    }
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      g.add(cyl(0.04, 0.04, 1.0, mat, (s * width) / 2, (y1 - y0) * t + 0.48, -run * t, 5));
    }
  }
  group.add(g);
  return group;
}

/* -------- labels / sprites -------- */
export function labelSprite(title, sub = '', { accent = '#7fd4ff', scale = 1 } = {}) {
  const W = 768, H = 192;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const pad = 16;
  const plateH = sub ? 132 : 96;
  ctx.fillStyle = 'rgba(8,16,24,0.62)';
  const r = 18;
  const x0 = pad, y0 = (H - plateH) / 2, w = W - pad * 2, h = plateH;
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0);
  ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, r);
  ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, r);
  ctx.arcTo(x0, y0 + h, x0, y0, r);
  ctx.arcTo(x0, y0, x0 + w, y0, r);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.fillRect(x0, y0 + 14, 6, h - 28);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 86px "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
  ctx.fillText(title, x0 + 30, sub ? y0 + 50 : y0 + h / 2);
  if (sub) {
    ctx.fillStyle = 'rgba(190,214,230,0.9)';
    ctx.font = '400 27px "Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.fillText(sub, x0 + 32, y0 + 102);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(40 * scale, 10 * scale, 1);
  sp.renderOrder = 20;
  sp.userData.noBake = true;
  return sp;
}

export function leaderLine(from, to, color = 0x7fd4ff, radius = 0.12) {
  const g = new THREE.Group();
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, len, 6),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, depthWrite: false })
  );
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
  m.userData.noBake = true;
  g.add(m);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(radius * 3, 8, 6), new THREE.MeshBasicMaterial({ color }));
  dot.position.copy(a);
  dot.userData.noBake = true;
  g.add(dot);
  return g;
}

export function glowSprite(color, size, opacity = 0.8) {
  return null; // replaced below (needs materials' texture)
}

export function makeGlow(texture, color, size, opacity = 0.85) {
  const mat = new THREE.SpriteMaterial({
    map: texture, color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(size, size, 1);
  s.userData.noBake = true;
  return s;
}

/* -------- bake static meshes into few draw calls -------- */
export function bakeStatic(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const remove = [];
  root.traverse((o) => {
    if (!o.isMesh || o.userData.noBake) return;
    const mat = o.material;
    if (Array.isArray(mat) || mat.transparent || mat.isSpriteMaterial) return;
    const geo = o.geometry;
    if (!geo.index) return;
    const g = geo.clone();
    g.applyMatrix4(o.matrixWorld);
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    }
    if (!g.attributes.uv) return;
    if (!buckets.has(mat)) buckets.set(mat, []);
    buckets.get(mat).push(g);
    remove.push(o);
  });
  for (const o of remove) {
    o.parent && o.parent.remove(o);
    o.geometry.dispose();
  }
  for (const [mat, geos] of buckets) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!merged) { console.warn('merge failed', geos.length); continue; }
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
    if (geos.length > 1) geos.forEach((g) => g.dispose());
  }
  return root;
}

/* small helpers for repetitive details */
export function pipeSupport(group, x, y, z, h, mat) {
  group.add(box(0.28, h, 0.28, mat, x, y + h / 2, z));
  group.add(box(0.9, 0.16, 0.5, mat, x, y + h, z));
}

export function valve(group, x, y, z, mat, size = 0.42, rotY = 0) {
  group.add(box(size, size * 0.9, size * 0.8, mat, x, y, z, 0, rotY, 0));
  group.add(torus(size * 0.62, 0.05, mat, x, y + size * 0.62, z, 0, rotY, 0, 12));
}