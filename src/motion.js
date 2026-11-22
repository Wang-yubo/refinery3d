import * as THREE from 'three';

/**
 * B5：动态细节（蒸汽/烟羽随风、旗帜、远处鸟群）。
 * 全部由显式时钟驱动（update(dt) 累加，__setAnimTime 同步），因此同一 t 重放一致。
 * 低画质档只保留蒸汽（已有静态 sprite 的轻微偏移），旗帜与鸟群关闭。
 */

function clothMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color, metalness: 0.05, roughness: 0.85, side: THREE.DoubleSide,
    emissive: 0x000000, map: null,
  });
}

function makeFlag(x, z, ry, color, height = 9) {
  const g = new THREE.Group();
  g.name = 'flag';
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, height, 8), new THREE.MeshStandardMaterial({ color: 0xb9c0c6, metalness: 0.7, roughness: 0.4 }));
  pole.position.set(x, height / 2, z);
  pole.castShadow = true;
  g.add(pole);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.5, 10), new THREE.MeshStandardMaterial({ color: 0x8e8c84, metalness: 0, roughness: 0.9 }));
  base.position.set(x, 0.25, z);
  g.add(base);
  const W = 2.6, H = 1.6, SX = 10, SY = 5;
  const geo = new THREE.PlaneGeometry(W, H, SX, SY);
  geo.translate(W / 2, 0, 0);
  const cloth = new THREE.Mesh(geo, clothMaterial(color));
  cloth.material.side = THREE.DoubleSide;
  cloth.castShadow = true;
  cloth.position.set(x + 0.06, height - H / 2 - 0.1, z);
  cloth.rotation.y = ry;
  g.add(cloth);
  const pos = geo.attributes.position;
  const rest = Float32Array.from(pos.array);
  return { g, cloth, geo, pos, rest, W, H };
}

export function createMotion({ scene, plant, m, getQuality }) {
  const state = { time: 0, frozen: false };
  const group = new THREE.Group();
  group.name = 'motion';
  scene.add(group);

  const flags = [
    makeFlag(-96, 128, 0.35, 0xa8443a),
    makeFlag(-88, 128, 0.35, 0xd9d5c9),
    makeFlag(178, 44, -0.6, 0x3f6b96),
  ];
  for (const f of flags) group.add(f.g);

  /* 远处鸟群：9 个点绕厂区缓慢盘旋 */
  const birdGeo = new THREE.BufferGeometry();
  const NB = 9;
  birdGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NB * 3), 3));
  const birds = new THREE.Points(birdGeo, new THREE.PointsMaterial({
    color: 0x2a2f36, size: 1.6, sizeAttenuation: true, transparent: true, opacity: 0.75, depthWrite: false,
  }));
  birds.name = 'birds';
  birds.frustumCulled = false;
  group.add(birds);

  /* 蒸汽 sprite：由 plant.js 的 steam-decor 组收集 */
  const steam = [];
  function collectSteam() {
    const decor = plant && plant.getObjectByName('steam-decor');
    if (!decor) return;
    decor.traverse((o) => {
      if (o.isSprite && !o.userData.mot) {
        o.userData.mot = true;
        steam.push({ sprite: o, base: o.position.clone(), phase: steam.length * 0.7 });
      }
    });
  }
  collectSteam();

  function update(dt) {
    if (!steam.length) collectSteam();
    const Q = getQuality && getQuality();
    const low = !Q || Q.level === 'low';
    if (!state.frozen) state.time += dt;
    const t = state.time;
    const wind = 1.0 + 0.35 * Math.sin(t * 0.09);        // 风速缓慢起伏
    const dirX = Math.cos(0.5 + 0.22 * Math.sin(t * 0.05)); // 风向缓慢变化
    const dirZ = Math.sin(0.5 + 0.22 * Math.sin(t * 0.05));

    // 蒸汽柱随风偏移
    for (let i = 0; i < steam.length; i++) {
      const s = steam[i];
      const k = 0.18 + (i % 6) * 0.05;
      s.sprite.position.set(
        s.base.x + dirX * wind * k * 6 + Math.sin(t * 0.35 + s.phase) * 1.6,
        s.base.y,
        s.base.z + dirZ * wind * k * 6 + Math.cos(t * 0.28 + s.phase) * 1.4,
      );
    }

    // 旗帜摆动（顶点动画，端点固定）
    for (let fi = 0; fi < flags.length; fi++) {
      const f = flags[fi];
      f.g.visible = !low;
      if (low) continue;
      const arr = f.pos.array, rest = f.rest;
      for (let i = 0; i < arr.length; i += 3) {
        const x = rest[i], y = rest[i + 1];
        const w = Math.min(1, (x / f.W) * 1.15);
        arr[i + 2] = rest[i + 2] + Math.sin(x * 1.9 - t * 4.2 + fi) * 0.26 * w + Math.sin(y * 2.4 + t * 2.1) * 0.10 * w;
        arr[i + 1] = rest[i + 1] + Math.sin(x * 1.5 - t * 3.4) * 0.08 * w;
      }
      f.pos.needsUpdate = true;
      f.geo.computeVertexNormals();
    }

    // 鸟群
    birds.visible = !low;
    if (!low) {
      const bp = birds.geometry.attributes.position;
      for (let i = 0; i < NB; i++) {
        const a = t * 0.045 + (i / NB) * Math.PI * 2;
        const r = 210 + Math.sin(t * 0.11 + i) * 26;
        bp.array[i * 3] = Math.cos(a) * r + 20;
        bp.array[i * 3 + 1] = 108 + Math.sin(t * 0.5 + i * 1.7) * 5;
        bp.array[i * 3 + 2] = Math.sin(a) * r - 20;
      }
      bp.needsUpdate = true;
    }
  }

  return {
    update,
    setTime: (t) => { state.time = Math.max(0, t); state.frozen = true; update(0); },
    resume: () => { state.frozen = false; },
    state: () => ({ time: +state.time.toFixed(2), flags: flags.length, birds: NB, steam: steam.length }),
    group,
  };
}