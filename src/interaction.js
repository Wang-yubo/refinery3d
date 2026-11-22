import * as THREE from 'three';
import { layoutSync } from './data/layout.js';

/**
 * 设备交互：静态几何在 bakeStatic 之后已被合并，无法按部件拾取，
 * 因此为每台设备建立一个不可见的包围盒代理（proxy），只对代理做射线检测。
 * 代理按距离排序，天然具备“近处遮挡远处”的效果。
 */

const UNIT_COLORS = {
  原油储运: 0xffc46b,
  常减压蒸馏: 0x5fd0ff,
  催化裂化: 0xff9a5c,
  连续重整: 0xffd27a,
  公用工程: 0x7fe8ff,
  产品调和: 0x9fe9ff,
  产品装卸: 0x9fe9ff,
  总图: 0xa8c4d8,
};

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;


/* ------------------------------------------------------------------ */

export function createInteraction({ scene, camera, controls, renderer, anim, onFocus }) {
  const canvas = renderer.domElement;
  const items = layoutSync().map((d) => ({ ...d }));
  const byId = new Map();
  const proxies = [];
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const UP = new THREE.Vector3(0, 1, 0);
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });

  for (const it of items) {
    it.color = UNIT_COLORS[it.unit] || 0x5fd0ff;
    it.center = new THREE.Vector3(it.x, it.cy, it.z);
    byId.set(it.id, it);

    const mesh = new THREE.Mesh(new THREE.BoxGeometry(it.w, it.h, it.d), proxyMat);
    mesh.position.set(it.x, it.cy, it.z);
    mesh.userData.equipId = it.id;
    mesh.updateMatrixWorld(true);
    proxies.push(mesh);
  }

  /* -------- 选中高亮：地面光环 + 包围盒线框 -------- */
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x5fd0ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 96), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 3;
  ring.visible = false;
  scene.add(ring);

  const edgeMat = new THREE.LineBasicMaterial({ color: 0x5fd0ff, transparent: true, opacity: 0.72, depthWrite: false });
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), edgeMat);
  edge.visible = false;
  edge.renderOrder = 4;
  scene.add(edge);

  /* -------- DOM -------- */
  const card = document.getElementById('equip');
  const tip = document.getElementById('picktip');
  const el = {
    cat: document.getElementById('equip-cat'),
    cn: document.getElementById('equip-cn'),
    en: document.getElementById('equip-en'),
    desc: document.getElementById('equip-desc'),
    specs: document.getElementById('equip-specs'),
    close: document.getElementById('equip-close'),
  };

  let selected = null;
  let hover = null;
  let tween = null;
  let hoverDirty = false;
  let pointerX = 0;
  let pointerY = 0;
  let lastPick = 0;
  let downAt = null;

  function showCard(it) {
    el.cat.textContent = `${it.unit} · ${it.kind}`;
    el.cat.style.color = hex(it.color);
    el.cn.textContent = it.cn;
    el.en.textContent = it.en;
    el.desc.textContent = it.desc;
    el.specs.innerHTML = it.specs.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    card.style.setProperty('--ecolor', hex(it.color));
    card.classList.add('open');
  }

  function closeSelection() {
    selected = null;
    card.classList.remove('open');
    ring.visible = false;
    edge.visible = false;
  }

  function select(it) {
    selected = it;
    showCard(it);
    const r = Math.max(it.w, it.d) * 0.62 + 2;
    ring.position.set(it.x, 0.5, it.z);
    ring.scale.set(r, r, 1);
    ringMat.color.setHex(it.color);
    ring.visible = true;
    edge.position.copy(it.center);
    edge.scale.set(it.w * 1.04, it.h * 1.04, it.d * 1.04);
    edgeMat.color.setHex(it.color);
    edge.visible = true;
    if (anim && anim.isActive()) anim.setCruise(false);
    setHover(null);
  }

  const fitCam = new THREE.PerspectiveCamera(46, 1, 0.5, 7000);
  function presetFor(it) {
    if (it.view) {
      return {
        pos: new THREE.Vector3(...it.view.pos),
        target: new THREE.Vector3(...it.view.target),
        fov: 46,
      };
    }
    const c = it.center;
    const dir = new THREE.Vector3(c.x - 10, 0, c.z + 6);
    if (dir.length() < 45) dir.set(0.62, 0, 0.78);
    dir.normalize().applyAxisAngle(UP, 0.5);
    const target = new THREE.Vector3(c.x, Math.min(c.y, it.h * 0.55), c.z);
    const corners = [];
    for (const sx of [-0.5, 0.5]) {
      for (const sy of [0, 1]) {
        for (const sz of [-0.5, 0.5]) {
          corners.push(new THREE.Vector3(c.x + sx * it.w, it.h * sy, c.z + sz * it.d));
        }
      }
    }
    let dist = Math.max(45, Math.max(it.w, it.d, it.h) * 1.5);
    const pos = new THREE.Vector3();
    const v = new THREE.Vector3();
    for (let iter = 0; iter < 4; iter++) {
      pos.set(c.x + dir.x * dist, Math.max(c.y + it.h * 0.55, 16), c.z + dir.z * dist);
      fitCam.aspect = camera.aspect;
      fitCam.fov = 46;
      fitCam.position.copy(pos);
      fitCam.updateProjectionMatrix();
      fitCam.lookAt(target);
      fitCam.updateMatrixWorld();
      let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity, behind = false;
      for (const corner of corners) {
        v.copy(corner).project(fitCam);
        if (v.z >= 1) behind = true;
        minx = Math.min(minx, v.x); maxx = Math.max(maxx, v.x);
        miny = Math.min(miny, v.y); maxy = Math.max(maxy, v.y);
      }
      const f = Math.max((maxx - minx) / 2, (maxy - miny) / 2) / 0.8;
      if (!behind && f <= 1.02) break;
      dist *= Math.max(1.05, f);
    }
    return { pos, target, fov: 46 };
  }

  function applyPreset(it) {
    const pr = presetFor(it);
    if (onFocus) onFocus();
    cancelTween();
    camera.position.copy(pr.pos);
    controls.target.copy(pr.target);
    camera.fov = pr.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(pr.target);
    controls.update();
    camera.updateMatrixWorld();
  }

  function cancelTween() {
    tween = null;
    controls.enabled = true;
  }

  function focus(it) {
    if (onFocus) onFocus();
    const preset = presetFor(it);
    tween = {
      start: performance.now(), dur: 1600,
      fromPos: camera.position.clone(), toPos: preset.pos,
      fromTgt: controls.target.clone(), toTgt: preset.target,
      fromFov: camera.fov, toFov: preset.fov,
    };
    controls.enabled = false;
  }

  /* -------- 拾取 -------- */
  function pick(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(proxies, false);
    return hits.length ? byId.get(hits[0].object.userData.equipId) : null;
  }

  function setHover(it) {
    if (it === hover) return;
    hover = it;
    canvas.style.cursor = it ? 'pointer' : '';
    if (it) {
      document.getElementById('picktip-cn').textContent = it.cn;
      document.getElementById('picktip-en').textContent = it.en;
      tip.style.display = 'block';
    } else {
      tip.style.display = 'none';
    }
  }

  function placeTip(x, y) {
    if (tip.style.display !== 'block') return;
    tip.style.left = `${Math.min(innerWidth - tip.offsetWidth - 16, x + 16)}px`;
    tip.style.top = `${Math.min(innerHeight - tip.offsetHeight - 16, y + 18)}px`;
  }

  /* -------- 事件 -------- */
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    pointerX = e.clientX;
    pointerY = e.clientY;
    placeTip(pointerX, pointerY);
    if (e.buttons) { setHover(null); return; }
    hoverDirty = true;
  });
  canvas.addEventListener('pointerdown', (e) => {
    downAt = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt || downAt.id !== e.pointerId) return;
    const dx = e.clientX - downAt.x;
    const dy = e.clientY - downAt.y;
    const dt = performance.now() - downAt.t;
    downAt = null;
    if (dx * dx + dy * dy > 36 || dt > 700) return;
    const it = pick(e.clientX, e.clientY);
    if (it) select(it);
    else closeSelection();
  });
  canvas.addEventListener('pointerleave', () => setHover(null));

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeSelection(); setHover(null); }
  });

  if (el.close) el.close.onclick = closeSelection;
  const closeBtn = document.getElementById('equip-close2');
  if (closeBtn) closeBtn.onclick = closeSelection;
  const focusBtn = document.getElementById('equip-focus');
  if (focusBtn) focusBtn.onclick = () => { if (selected) focus(selected); };

  /* -------- 每帧 -------- */
  function update(dt) {
    const now = performance.now();
    if (tween) {
      const k = Math.min(1, (now - tween.start) / tween.dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      camera.position.lerpVectors(tween.fromPos, tween.toPos, e);
      const tgt = new THREE.Vector3().lerpVectors(tween.fromTgt, tween.toTgt, e);
      controls.target.copy(tgt);
      camera.fov = tween.fromFov + (tween.toFov - tween.fromFov) * e;
      camera.updateProjectionMatrix();
      camera.lookAt(tgt);
      camera.updateMatrixWorld();
      if (k >= 1) {
        tween = null;
        controls.enabled = true;
        controls.update();
      }
    } else if (hoverDirty && now - lastPick > 90) {
      hoverDirty = false;
      lastPick = now;
      setHover(pick(pointerX, pointerY));
      placeTip(pointerX, pointerY);
    }
    if (selected) {
      ringMat.opacity = 0.38 + 0.18 * Math.sin(now * 0.003 + 0.6);
    }
  }

  const api = {
    items,
    proxies,
    update,
    list: () => items.map((i) => ({
      id: i.id, cn: i.cn, en: i.en, unit: i.unit, kind: i.kind,
      x: i.x, y: i.cy, z: i.z, w: i.w, h: i.h, d: i.d,
    })),
    selectById: (id) => {
      const it = byId.get(id);
      if (!it) return null;
      select(it);
      return it.cn;
    },
    focusById: (id, immediate = false) => {
      const it = byId.get(id);
      if (!it) return null;
      select(it);
      if (immediate) applyPreset(it);
      else focus(it);
      return it.cn;
    },
    close: closeSelection,
    cancel: () => { cancelTween(); closeSelection(); setHover(null); },
    state: () => ({
      selected: selected ? selected.id : null,
      hover: hover ? hover.id : null,
      card: card.classList.contains('open'),
      tween: !!tween,
      camera: [+camera.position.x.toFixed(1), +camera.position.y.toFixed(1), +camera.position.z.toFixed(1)],
      target: [+controls.target.x.toFixed(1), +controls.target.y.toFixed(1), +controls.target.z.toFixed(1)],
    }),
    presetFor,
  };

  return api;
}