import * as THREE from 'three';
import * as T from './textures.js';

function std(opts) {
  return new THREE.MeshStandardMaterial(opts);
}

function withRepeat(map, x, y) {
  const m = map.clone();
  m.needsUpdate = true;
  m.wrapS = m.wrapT = THREE.RepeatWrapping;
  m.repeat.set(x, y);
  return m;
}

/** 统一 shader 变体：不透明 MeshStandardMaterial 全部带 map+emissiveMap+roughnessMap+normalMap，
 *  让它们共享同一批 shader program；同时登记 PBR 基准值（供湿滑变体 restore） */
export function constrainPrograms(m) {
  const white = solidTexture(255, 255, 255);
  const black = solidTexture(0, 0, 0);
  const whiteData = T.solidDataTexture(255, 255, 255);
  const flatNormal = T.solidDataTexture(128, 128, 255);
  for (const mat of Object.values(m)) {
    if (!mat || !mat.isMaterial || mat.isSpriteMaterial) continue;
    if (mat.isMeshStandardMaterial) {
      if (!mat.map) mat.map = white;
      if (!mat.emissiveMap) {
        const e = mat.emissive;
        const lit = e && (e.r > 0 || e.g > 0 || e.b > 0);
        mat.emissiveMap = lit ? white : black;
      }
      if (!mat.roughnessMap) mat.roughnessMap = whiteData;
      if (!mat.normalMap) mat.normalMap = flatNormal;
      if (!mat.userData.pbrBase) {
        mat.userData.pbrBase = {
          roughness: mat.roughness,
          metalness: mat.metalness,
          color: mat.color ? mat.color.getHex() : null,
          envMapIntensity: mat.envMapIntensity,
        };
      }
    } else if (mat.isMeshBasicMaterial) {
      if (!mat.map && !mat.vertexColors) mat.map = white;
    }
  }
}

/* 1×1 纯色纹理：给所有 MeshStandardMaterial 补齐 map / emissiveMap，
 * 让它们共享同一个 shader program（否则 map / emissiveMap 的有无会各自生成变体）。
 * 白色乘法不改变颜色；黑色 emissiveMap 让无自发光材质与原来完全一致。 */
function solidTexture(r, g, b) {
  const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** 湿滑 / 干燥切换：降低粗糙度、加深颜色、提高环境反射（天气系统用） */
export function applyWet(m, on = true) {
  for (const mat of Object.values(m)) {
    if (!mat || !mat.isMeshStandardMaterial) continue;
    const b = mat.userData.pbrBase;
    if (!b) continue;
    if (on) {
      mat.roughness = Math.max(0.05, b.roughness * 0.42);
      mat.metalness = Math.min(1, b.metalness + 0.16);
      mat.envMapIntensity = (b.envMapIntensity ?? 1) * 1.7;
      if (mat.color && b.color !== null) mat.color.setHex(b.color).multiplyScalar(0.82);
    } else {
      mat.roughness = b.roughness;
      mat.metalness = b.metalness;
      mat.envMapIntensity = b.envMapIntensity;
      if (mat.color && b.color !== null) mat.color.setHex(b.color);
    }
    mat.needsUpdate = true;
  }
}

export function createMaterials() {
  const shell = T.shellTexture(23);
  /* B1：法线贴图默认关闭——1440p 实测填充率开销约 -33%（超出 -15% 预算），
   * 需要时用 ?normal=1 打开（见 README「B 批」）。 */
  const useNormal = typeof location !== 'undefined' && new URLSearchParams(location.search).get('normal') === '1';
  // B1 新增（5 张）：粗糙度 / 法线 / 污渍 / 罐体雨痕 / 沥青油污
  const rough = T.metalRoughTexture(71);
  const normal = T.metalNormalTexture(73);
  const grime = T.grimeTexture(77);
  const shellWet = T.shellWeatheredTexture(79);
  const asphaltOil = T.asphaltOilTexture(83);
  const insulation = T.insulationTexture(31);
  const concrete = T.concreteTexture(7);
  const asphalt = T.asphaltTexture(3);
  const grass = T.grassTexture(11);
  const gravel = T.gravelTexture(17);
  const grating = T.gratingTexture(41);
  const windows = T.windowTexture(51);

  const m = {
    /* structure & equipment */
    steel: std({ map: withRepeat(grime, 3, 3), color: 0xc6ccd2, metalness: 0.78, roughness: 0.38, roughnessMap: withRepeat(rough, 3, 3), normalMap: useNormal ? withRepeat(normal, 3, 3) : undefined, normalScale: new THREE.Vector2(0.45, 0.45) }),
    steelLight: std({ map: withRepeat(grime, 3, 3), color: 0xdcdfde, metalness: 0.6, roughness: 0.4, roughnessMap: withRepeat(rough, 3, 3), normalMap: useNormal ? withRepeat(normal, 3, 3) : undefined, normalScale: new THREE.Vector2(0.35, 0.35) }),
    steelDark: std({ map: withRepeat(grime, 4, 4), color: 0x777e85, metalness: 0.75, roughness: 0.44, roughnessMap: withRepeat(rough, 4, 4), normalMap: useNormal ? withRepeat(normal, 3, 3) : undefined, normalScale: new THREE.Vector2(0.5, 0.5) }),
    painted: std({ map: withRepeat(grime, 3, 3), color: 0xd4d7d2, metalness: 0.4, roughness: 0.5, roughnessMap: withRepeat(rough, 3, 3), normalMap: useNormal ? withRepeat(normal, 3, 3) : undefined, normalScale: new THREE.Vector2(0.4, 0.4) }),
    insulation: std({ map: withRepeat(insulation, 3, 2), color: 0xffffff, metalness: 0.35, roughness: 0.5, roughnessMap: withRepeat(rough, 2, 2), normalMap: useNormal ? withRepeat(normal, 2, 2) : undefined, normalScale: new THREE.Vector2(0.8, 0.8) }),
    insulationDirty: std({ map: withRepeat(insulation, 3, 2), color: 0xc2bfb6, metalness: 0.32, roughness: 0.64, roughnessMap: withRepeat(rough, 2, 2), normalMap: useNormal ? withRepeat(normal, 2, 2) : undefined, normalScale: new THREE.Vector2(0.9, 0.9) }),
    shell: std({ map: withRepeat(shellWet, 4, 2), color: 0xffffff, metalness: 0.32, roughness: 0.5, roughnessMap: withRepeat(rough, 4, 2), normalMap: useNormal ? withRepeat(normal, 2, 2) : undefined, normalScale: new THREE.Vector2(0.3, 0.3) }),
    shellWhite: std({ map: withRepeat(shellWet, 4, 2), color: 0xf5f5f1, metalness: 0.32, roughness: 0.46, roughnessMap: withRepeat(rough, 4, 2), normalMap: useNormal ? withRepeat(normal, 2, 2) : undefined, normalScale: new THREE.Vector2(0.25, 0.25) }),
    rust: std({ map: withRepeat(grime, 5, 5), color: 0x9a6440, metalness: 0.35, roughness: 0.85, roughnessMap: withRepeat(rough, 4, 4), normalMap: useNormal ? withRepeat(normal, 4, 4) : undefined, normalScale: new THREE.Vector2(0.9, 0.9) }),

    /* pipes (colour coded) */
    pipeSilver: std({ map: withRepeat(grime, 6, 1), color: 0xbfc4c8, metalness: 0.88, roughness: 0.3, roughnessMap: withRepeat(rough, 6, 1), normalMap: useNormal ? withRepeat(normal, 4, 1) : undefined, normalScale: new THREE.Vector2(0.3, 0.3) }),
    pipeGray: std({ map: withRepeat(grime, 6, 1), color: 0x969ca3, metalness: 0.84, roughness: 0.36, roughnessMap: withRepeat(rough, 6, 1) }),
    pipeYellow: std({ map: withRepeat(grime, 6, 1), color: 0xd2aa46, metalness: 0.6, roughness: 0.42, roughnessMap: withRepeat(rough, 6, 1) }),
    pipeOrange: std({ map: withRepeat(grime, 6, 1), color: 0xbc6a42, metalness: 0.55, roughness: 0.46, roughnessMap: withRepeat(rough, 6, 1) }),
    pipeGreen: std({ map: withRepeat(grime, 6, 1), color: 0x578468, metalness: 0.55, roughness: 0.46, roughnessMap: withRepeat(rough, 6, 1) }),
    pipeRed: std({ map: withRepeat(grime, 6, 1), color: 0xa6483e, metalness: 0.55, roughness: 0.46, roughnessMap: withRepeat(rough, 6, 1) }),

    /* ground */
    concrete: std({ map: withRepeat(concrete, 8, 8), color: 0xffffff, metalness: 0.0, roughness: 0.9, roughnessMap: withRepeat(rough, 8, 8), normalMap: useNormal ? withRepeat(normal, 8, 8) : undefined, normalScale: new THREE.Vector2(0.5, 0.5) }),
    concreteSmooth: std({ map: withRepeat(concrete, 3, 3), color: 0xc0beb8, metalness: 0.0, roughness: 0.8, roughnessMap: withRepeat(rough, 3, 3) }),
    asphalt: std({ map: withRepeat(asphaltOil, 8, 8), color: 0xffffff, metalness: 0.05, roughness: 0.9, roughnessMap: withRepeat(rough, 8, 8) }),
    gravel: std({ map: withRepeat(gravel, 12, 12), color: 0xffffff, metalness: 0.0, roughness: 1.0 }),
    grass: std({ map: withRepeat(grass, 40, 40), color: 0xffffff, metalness: 0.0, roughness: 1.0 }),
    grating: std({ map: withRepeat(grating, 2, 2), color: 0xffffff, metalness: 0.65, roughness: 0.5, roughnessMap: withRepeat(rough, 2, 2) }),
    roadLine: std({ color: 0xd9d5c4, metalness: 0.0, roughness: 0.85 }),

    /* details */
    railing: std({ color: 0xb9a44e, metalness: 0.55, roughness: 0.5 }),
    railingGray: std({ color: 0x9aa0a5, metalness: 0.6, roughness: 0.48 }),
    ladder: std({ color: 0xa7adb1, metalness: 0.7, roughness: 0.45 }),
    cable: std({ color: 0x2e3237, metalness: 0.3, roughness: 0.8 }),
    roof: std({ color: 0x6e7477, metalness: 0.45, roughness: 0.65 }),
    building: std({ map: withRepeat(shellWet, 4, 2), color: 0xe9e7df, metalness: 0.12, roughness: 0.68, roughnessMap: withRepeat(rough, 4, 2) }),
    buildingWarm: std({ color: 0xcfc7b6, metalness: 0.05, roughness: 0.8 }),
    window: std({ map: windows, color: 0xffffff, metalness: 0.2, roughness: 0.35, emissive: 0xffc078, emissiveMap: windows, emissiveIntensity: 0.55 }),
    glass: std({ color: 0x6b8794, metalness: 0.6, roughness: 0.12, transparent: true, opacity: 0.55 }),
    water: std({ color: 0x2d4d55, metalness: 0.75, roughness: 0.08 }),
    treeLeaf: std({ color: 0x3d5136, metalness: 0.0, roughness: 0.9 }),
    treeLeaf2: std({ color: 0x4b6140, metalness: 0.0, roughness: 0.9 }),
    trunk: std({ color: 0x4a3b2e, metalness: 0.0, roughness: 0.9 }),
    carBody: std({ color: 0x9aa3ad, metalness: 0.5, roughness: 0.35 }),
    carDark: std({ color: 0x2b3036, metalness: 0.4, roughness: 0.5 }),
    tankTruck: std({ color: 0xcfd3d2, metalness: 0.6, roughness: 0.35 }),
    fireRed: std({ color: 0xa63a2e, metalness: 0.4, roughness: 0.5 }),
    blue: std({ color: 0x3f6b96, metalness: 0.4, roughness: 0.5 }),

    /* lights / emissive */
    lampWarm: std({ color: 0xfff0d0, emissive: 0xffc069, emissiveIntensity: 2.6, roughness: 1 }),
    lampCool: std({ color: 0xeaf4ff, emissive: 0xbcd8ff, emissiveIntensity: 2.2, roughness: 1 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffb15a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    flameCore: new THREE.MeshBasicMaterial({ color: 0xfff2cf, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    beacon: std({ color: 0xff4436, emissive: 0xff2211, emissiveIntensity: 3.2, roughness: 0.8 }),

    glowTex: T.glowTexture(),
    smokeTex: T.smokeTexture(61),
    flameTex: T.flameTexture(),
  };
  constrainPrograms(m);
  m.__applyWet = (on) => applyWet(m, on);
  return m;
}