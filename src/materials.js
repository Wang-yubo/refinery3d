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

export function createMaterials() {
  const shell = T.shellTexture(23);
  const insulation = T.insulationTexture(31);
  const concrete = T.concreteTexture(7);
  const asphalt = T.asphaltTexture(3);
  const grass = T.grassTexture(11);
  const gravel = T.gravelTexture(17);
  const grating = T.gratingTexture(41);
  const windows = T.windowTexture(51);

  const m = {
    /* structure & equipment */
    steel: std({ color: 0xb8bfc5, metalness: 0.72, roughness: 0.42 }),
    steelLight: std({ color: 0xd2d5d4, metalness: 0.55, roughness: 0.45 }),
    steelDark: std({ color: 0x6b7178, metalness: 0.7, roughness: 0.5 }),
    painted: std({ color: 0xc9ccc7, metalness: 0.35, roughness: 0.55 }),
    insulation: std({ map: withRepeat(insulation, 3, 2), color: 0xffffff, metalness: 0.35, roughness: 0.5 }),
    insulationDirty: std({ map: withRepeat(insulation, 3, 2), color: 0xb9b6ad, metalness: 0.3, roughness: 0.62 }),
    shell: std({ map: withRepeat(shell, 4, 2), color: 0xffffff, metalness: 0.3, roughness: 0.55 }),
    shellWhite: std({ map: withRepeat(shell, 4, 2), color: 0xf0f0ec, metalness: 0.3, roughness: 0.5 }),
    rust: std({ color: 0x8c5a38, metalness: 0.4, roughness: 0.8 }),

    /* pipes (colour coded) */
    pipeSilver: std({ color: 0xb4b9bd, metalness: 0.85, roughness: 0.34 }),
    pipeGray: std({ color: 0x8b9198, metalness: 0.8, roughness: 0.4 }),
    pipeYellow: std({ color: 0xc9a13c, metalness: 0.55, roughness: 0.45 }),
    pipeOrange: std({ color: 0xb2603a, metalness: 0.5, roughness: 0.5 }),
    pipeGreen: std({ color: 0x4f7a63, metalness: 0.5, roughness: 0.5 }),
    pipeRed: std({ color: 0x9c3f36, metalness: 0.5, roughness: 0.5 }),

    /* ground */
    concrete: std({ map: withRepeat(concrete, 8, 8), color: 0xffffff, metalness: 0.0, roughness: 0.9 }),
    concreteSmooth: std({ map: withRepeat(concrete, 3, 3), color: 0xb9b7b1, metalness: 0.0, roughness: 0.82 }),
    asphalt: std({ map: withRepeat(asphalt, 10, 10), color: 0xffffff, metalness: 0.0, roughness: 0.95 }),
    gravel: std({ map: withRepeat(gravel, 12, 12), color: 0xffffff, metalness: 0.0, roughness: 1.0 }),
    grass: std({ map: withRepeat(grass, 40, 40), color: 0xffffff, metalness: 0.0, roughness: 1.0 }),
    grating: std({ map: withRepeat(grating, 2, 2), color: 0xffffff, metalness: 0.6, roughness: 0.55 }),
    roadLine: std({ color: 0xd9d5c4, metalness: 0.0, roughness: 0.85 }),

    /* details */
    railing: std({ color: 0xb9a44e, metalness: 0.55, roughness: 0.5 }),
    railingGray: std({ color: 0x9aa0a5, metalness: 0.6, roughness: 0.48 }),
    ladder: std({ color: 0xa7adb1, metalness: 0.7, roughness: 0.45 }),
    cable: std({ color: 0x2e3237, metalness: 0.3, roughness: 0.8 }),
    roof: std({ color: 0x6e7477, metalness: 0.45, roughness: 0.65 }),
    building: std({ map: withRepeat(shell, 4, 2), color: 0xe4e2da, metalness: 0.1, roughness: 0.7 }),
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
  return m;
}