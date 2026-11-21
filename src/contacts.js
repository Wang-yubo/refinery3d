import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * 程序化接触阴影：主要设备底部一张柔和的径向渐变暗斑。
 * 使用一张共享 CanvasTexture，合并为单个透明 Mesh（1 draw call），
 * 并在 bakeStatic 之后加入场景，避免被静态合并。
 */
function makeShadowTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.04, S / 2, S / 2, S * 0.5);
  g.addColorStop(0.0, 'rgba(0,0,0,0.76)');
  g.addColorStop(0.38, 'rgba(0,0,0,0.52)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.2)');
  g.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** [x, z, radiusX, radiusZ, opacity, y] —— 覆盖塔器、罐区、建筑、冷却塔、装车棚 */
const SPOTS = [
  // 原油罐区（6 座浮顶罐）
  [-181, -76, 22, 22, 0.85], [-140, -76, 22, 22, 0.85],
  [-181, -34, 22, 22, 0.85], [-140, -34, 22, 22, 0.85],
  [-181, 34, 22, 22, 0.85], [-140, 34, 22, 22, 0.85],
  // 球罐
  [-178, 76, 11, 11, 0.7], [-146, 76, 11, 11, 0.7], [-116, 60, 11, 11, 0.7],
  // 常减压：四塔 + 加热炉 + 换热器组 + 空冷器 + 泵组
  [-48, -30, 8.5, 8.5, 0.9], [-26, -56, 7.5, 7.5, 0.9],
  [-62, -56, 5.5, 5.5, 0.75], [-10, -64, 6.2, 6.2, 0.8],
  [-56, -4, 15, 10, 0.75], [11, -18, 26, 6.5, 0.55],
  [-24, 7, 22, 7, 0.6], [-10, -6, 15, 5, 0.5],
  // 催化裂化
  [70, -72, 7, 7, 0.85], [90, -80, 8.5, 8.5, 0.85],
  [112, -52, 7.5, 7.5, 0.85], [142, -104, 5.5, 5.5, 0.7],
  [104, -96, 8, 7, 0.65], [58, -96, 5, 5, 0.55],
  [84, -34, 44, 6.5, 0.5], [60, -52, 22, 7, 0.45],
  // 连续重整
  [52, 42, 5.2, 5.2, 0.75], [70, 42, 5.2, 5.2, 0.75], [88, 42, 5.2, 5.2, 0.75],
  [58, 76, 12, 9, 0.7], [96, 74, 14, 10, 0.55], [52, 62, 22, 6, 0.5],
  // 公用工程：冷却塔、锅炉房、烟囱、水罐、球罐
  [-22, 88, 21, 21, 0.85], [18, 92, 21, 21, 0.85],
  [0, 60, 16, 10, 0.65], [-9, 54, 4, 4, 0.6], [9, 54, 4, 4, 0.6],
  [-36, 66, 5, 5, 0.65], [-36, 100, 9, 9, 0.65],
  // 行政 / 仓库 / 装车棚
  [-112, 152, 20, 12, 0.65], [-80, 148, 15, 9, 0.6],
  [-62, 178, 11, 8, 0.6], [125, 145, 23, 15, 0.65],
  [172, 74, 21, 9, 0.75], [164, 80, 14, 6, 0.45],
  // 烟囱 / 火炬 / 管廊支柱局部
  [172, -120, 7, 7, 0.55], [8, 8, 120, 4.5, 0.35],
  // 变电 / 机柜
  [-102, 108, 10, 5, 0.45], [-78, 96, 6, 6, 0.4],
];

export function createContactShadows() {
  const tex = makeShadowTexture();
  const geos = [];
  for (const [x, z, rx, rz, opacity, y = 0.09] of SPOTS) {
    const g = new THREE.PlaneGeometry(rx * 2, rz * 2);
    g.rotateX(-Math.PI / 2);
    g.translate(x, y + (opacity - 0.5) * 0.008, z);
    // 用顶点色承载每块暗斑的不透明度，合并后仍只需 1 个材质
    const count = g.attributes.position.count;
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) col.fill(opacity, i * 3, i * 3 + 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: 0.82, depthWrite: false,
    vertexColors: true, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(merged, mat);
  mesh.name = 'contact-shadows';
  mesh.renderOrder = 1;
  mesh.userData.noBake = true;
  mesh.frustumCulled = false;
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  return mesh;
}
