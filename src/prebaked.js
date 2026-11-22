import * as THREE from 'three';
import { mark } from './prof.js';
import { idbGet, idbSet, idbPrune, idbSupported } from './idb.js';

/**
 * 优先下载 gzip 快照（2.9MB vs 20.5MB），用浏览器原生 DecompressionStream 解压；
 * 浏览器不支持 / 404 / 解压失败时回退到未压缩 baked.bin。
 */
export async function fetchSnapshot({
  binUrl = './assets/baked.bin',
  gzUrl = './assets/baked.bin.gz',
  version = null,
} = {}) {
  const t0 = performance.now();
  const stats = { source: 'network', ms: 0, bytes: 0, key: null, idb: idbSupported };
  window.__cacheState = stats;
  /* E1：IndexedDB 命中则完全跳过网络（版本变了 key 就变，自动失效） */
  const key = version != null ? `${gzUrl.split('/').pop()}|v=${version}` : null;
  stats.key = key;
  if (key) {
    const hit = await idbGet(key);
    if (hit && hit.byteLength > 1e6) {
      stats.source = 'idb';
      stats.ms = +(performance.now() - t0).toFixed(1);
      stats.bytes = hit.byteLength;
      mark('bin-idb-hit');
      return hit;
    }
  }
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const res = await fetch(gzUrl, { cache: 'force-cache' });
      if (res.ok && res.body) {
        const stream = res.body.pipeThrough(new DecompressionStream('gzip'));
        const buf = await new Response(stream).arrayBuffer();
        stats.ms = +(performance.now() - t0).toFixed(1);
        stats.bytes = buf.byteLength;
        if (key) idbSet(key, buf).then(() => idbPrune('baked.bin.gz|', key));
        return buf;
      }
    } catch (err) {
      console.warn('[baked] gzip 快照不可用，回退 baked.bin：', err.message);
    }
  }
  const binRes = await fetch(binUrl, { cache: 'force-cache' });
  if (!binRes.ok) throw new Error(`snapshot bin ${binRes.status}`);
  const raw = await binRes.arrayBuffer();
  stats.ms = +(performance.now() - t0).toFixed(1);
  stats.bytes = raw.byteLength;
  stats.source = 'network-bin';
  if (key) idbSet(key, raw).then(() => idbPrune('baked.bin.gz|', key));
  return raw;
}

/**
 * 把快照二进制重建为 42 个 BufferGeometry（零拷贝视图），返回 plant root。
 * 快照只包含不透明、已合并的装置 Mesh；标签、蒸汽、夜间光晕、火炬火焰等
 * 动态/透明对象由 createPlantDecor() 在运行时补充。
 */
export function buildSnapshot(buffer, meta, materials, { onProgress = () => {} } = {}) {
  const t0 = performance.now();
  if (buffer.byteLength !== meta.bytes) {
    throw new Error(`snapshot size mismatch ${buffer.byteLength} != ${meta.bytes}`);
  }

  const root = new THREE.Group();
  root.name = 'plant';
  const total = meta.items.length;
  const itemMs = [];
  let progressMs = 0;
  const progress = (p, text) => { const t = performance.now(); onProgress(p, text); progressMs += performance.now() - t; };
  let vertexCount = 0;
  let triangleCount = 0;

  meta.items.forEach((it, i) => {
    const tItem = performance.now();
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
    itemMs.push({ mat: it.material, verts: it.position.count, ms: +(performance.now() - tItem).toFixed(1) });
    vertexCount += it.position.count;
    triangleCount += it.index.count / 3;
    if (i % 8 === 0) progress(0.2 + 0.78 * (i / total), '重建烘焙几何 …');
  });

  if (typeof window !== 'undefined') {
    window.__snapProfile = { items: itemMs, progressMs: +progressMs.toFixed(1), totalMs: +(performance.now() - t0).toFixed(1) };
    window.__snapshotBuffer = buffer;
  }
  onProgress(1, '快照加载完成');
  return { root, meta, vertexCount, triangleCount, bytes: buffer.byteLength };
}

/** 兼容旧调用：下载 + 重建一步完成 */
export async function loadPlantSnapshot(materials, {
  jsonUrl = './assets/baked.json',
  binUrl = './assets/baked.bin',
  gzUrl = './assets/baked.bin.gz',
  meta: inlineMeta = null,
  onProgress = () => {},
} = {}) {
  let meta = inlineMeta;
  if (!meta) {
    const metaRes = await fetch(jsonUrl, { cache: 'force-cache' });
    if (!metaRes.ok) throw new Error(`snapshot meta ${metaRes.status}`);
    meta = await metaRes.json();
  }
  mark('bin-fetch-start');
  const buffer = await fetchSnapshot({ binUrl, gzUrl });
  mark('bin-fetch-done');
  const snap = buildSnapshot(buffer, meta, materials, { onProgress });
  mark('bin-rebuild-done');
  return snap;
}