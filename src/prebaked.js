import * as THREE from 'three';

/**
 * 读取构建期 bakeStatic 导出的静态合并几何快照，跳过 units/plant 的建模与合并。
 * 快照只包含不透明、已合并的装置 Mesh；标签、蒸汽、夜间光晕、火炬火焰等
 * 动态/透明对象由 createPlantDecor() 在运行时补充。
 */
export async function loadPlantSnapshot(materials, {
  jsonUrl = './assets/baked.json',
  binUrl = './assets/baked.bin',
  onProgress = () => {},
} = {}) {
  const t0 = performance.now();
  onProgress(0.05, '读取场景快照 …');
  // 元数据与 20MB 几何并行下载，减少串行等待
  const [metaRes, binRes] = await Promise.all([
    fetch(jsonUrl, { cache: 'force-cache' }),
    fetch(binUrl, { cache: 'force-cache' }),
  ]);
  if (!metaRes.ok) throw new Error(`snapshot meta ${metaRes.status}`);
  if (!binRes.ok) throw new Error(`snapshot bin ${binRes.status}`);
  const meta = await metaRes.json();
  const tMeta = performance.now();
  onProgress(0.18, '下载烘焙几何 …');
  const buffer = await binRes.arrayBuffer();
  const tBin = performance.now();
  if (buffer.byteLength !== meta.bytes) {
    throw new Error(`snapshot size mismatch ${buffer.byteLength} != ${meta.bytes}`);
  }

  const root = new THREE.Group();
  root.name = 'plant';
  const total = meta.items.length;
  let vertexCount = 0;
  let triangleCount = 0;

  meta.items.forEach((it, i) => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(buffer, it.position.offset, it.position.count * 3);
    const nor = new Float32Array(buffer, it.normal.offset, it.normal.count * 3);
    const uv = new Float32Array(buffer, it.uv.offset, it.uv.count * 2);
    const idx = new Uint32Array(buffer, it.index.offset, it.index.count);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();

    const mat = materials[it.material];
    if (!mat) throw new Error(`missing material ${it.material}`);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `baked-${it.material}-${i}`;
    mesh.castShadow = it.castShadow !== false;
    mesh.receiveShadow = it.receiveShadow !== false;
    mesh.userData.baked = true;
    mesh.userData.bakeMaterial = it.material;
    root.add(mesh);
    vertexCount += it.position.count;
    triangleCount += it.index.count / 3;
    if (i % 6 === 0) onProgress(0.2 + 0.78 * (i / total), '重建烘焙几何 …');
  });

  onProgress(1, '快照加载完成');
  console.log(`[snapshot] meta ${(tMeta - t0).toFixed(0)}ms bin ${(tBin - tMeta).toFixed(0)}ms rebuild ${(performance.now() - tBin).toFixed(0)}ms`);
  return { root, meta, vertexCount, triangleCount, bytes: buffer.byteLength };
}
