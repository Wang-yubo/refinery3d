import * as THREE from 'three';

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
/* 设备清单（坐标与尺寸对应场景里的真实几何）                             */
/* ------------------------------------------------------------------ */
function buildItems() {
  const items = [];
  const push = (o) => items.push(o);

  // 原油储罐
  [[-181, -76], [-140, -76], [-181, -34], [-140, -34], [-181, 34], [-140, 34]].forEach(([x, z], i) => {
    push({
      id: `tank-${101 + i}`, unit: '原油储运', kind: '储罐',
      cn: `原油储罐 T-${101 + i}`, en: 'Crude Oil Storage Tank',
      x, z, w: 38, h: 19, d: 38, cy: 9.5,
      desc: '浮顶式原油储罐，接收管输与船运来油，经罐区泵组加压后沿主管廊送入常减压蒸馏装置。',
      specs: [['公称容积', '1.5 × 10⁴ m³'], ['罐径 / 罐高', '34 m / 17 m'], ['介质', '原油'], ['操作温度', '常温']],
    });
  });

  // 液化气球罐
  [[-178, 76], [-146, 76], [-116, 60]].forEach(([x, z], i) => {
    push({
      id: `sphere-${201 + i}`, unit: '原油储运', kind: '球罐',
      cn: `液化气球罐 V-${201 + i}`, en: 'LPG Spherical Tank',
      x, z, w: 17, h: 18, d: 17, cy: 9,
      desc: '压力储存液化石油气，为重整、加氢装置提供原料，并作为全厂燃料气缓冲。',
      specs: [['公称容积', '3 000 m³'], ['球径', '14.8 m'], ['设计压力', '1.6 MPa'], ['介质', '液化石油气']],
    });
  });

  // 常减压
  push({
    id: 'cdu-atm', unit: '常减压蒸馏', kind: '塔器',
    cn: '常压塔', en: 'Atmospheric Distillation Column',
    x: -48, z: -30, w: 11, h: 58, d: 11, cy: 29,
    desc: '原油在塔内按沸点分割为石脑油、煤油、柴油与常压渣油，是炼厂第一道主分馏环节。',
    specs: [['塔径 / 塔高', '8.8 m / 56 m'], ['操作温度', '350 °C'], ['操作压力', '130 kPa'], ['处理能力', '800 × 10⁴ t/a']],
  });
  push({
    id: 'cdu-vac', unit: '常减压蒸馏', kind: '塔器',
    cn: '减压塔', en: 'Vacuum Distillation Column',
    x: -26, z: -56, w: 9, h: 50, d: 9, cy: 25,
    desc: '在负压下继续分离常压渣油，拔出催化裂化与加氢装置的优质原料。',
    specs: [['塔径 / 塔高', '7.4 m / 49 m'], ['操作温度', '390 °C'], ['操作压力', '4 kPa'], ['处理能力', '400 × 10⁴ t/a']],
  });
  push({
    id: 'cdu-strip', unit: '常减压蒸馏', kind: '塔器',
    cn: '汽提塔', en: 'Side Stripper',
    x: -62, z: -56, w: 6, h: 32, d: 6, cy: 16,
    desc: '用过热蒸汽汽提侧线油品中的轻组分，保证柴油、煤油闪点合格。',
    specs: [['塔径 / 塔高', '4.6 m / 31 m'], ['操作温度', '260 °C'], ['汽提蒸汽', '2.5 t/h'], ['侧线', '煤油 / 柴油']],
  });
  push({
    id: 'cdu-stab', unit: '常减压蒸馏', kind: '塔器',
    cn: '稳定塔', en: 'Stabilizer',
    x: -10, z: -64, w: 7, h: 43, d: 7, cy: 21.5,
    desc: '脱除石脑油中的 C4 及更轻组分，稳定塔顶气送燃料气管网。',
    specs: [['塔径 / 塔高', '5.6 m / 42 m'], ['操作压力', '1.2 MPa'], ['塔顶温度', '60 °C'], ['处理能力', '120 × 10⁴ t/a']],
  });
  push({
    id: 'cdu-furnace', unit: '常减压蒸馏', kind: '加热炉',
    cn: '常压加热炉', en: 'Crude Furnace',
    x: -56, z: -4, w: 21, h: 15, d: 13, cy: 7.5,
    desc: '将脱盐脱水后的原油加热至 365 °C 后送入常压塔，是常减压装置的核心热源。',
    specs: [['热负荷', '120 MW'], ['炉管程数', '4 程'], ['出口温度', '365 °C'], ['热效率', '92 %']],
  });
  push({
    id: 'cdu-exch', unit: '常减压蒸馏', kind: '换热器',
    cn: '换热器组', en: 'Exchanger Train',
    x: 11, z: -18, w: 50, h: 5.5, d: 8, cy: 2.8,
    desc: '六台浮头式换热器串联回收塔底渣油热量，用于预热原油、降低加热炉负荷。',
    specs: [['台数', '6 台'], ['总换热面积', '4 800 m²'], ['型式', '浮头式'], ['回收热量', '48 MW']],
  });
  push({
    id: 'cdu-ac', unit: '常减压蒸馏', kind: '空冷器',
    cn: '空冷器 A-201', en: 'Air Cooler',
    x: -28, z: 8, w: 13, h: 8, d: 7, cy: 4,
    desc: '以强制通风方式冷凝塔顶油气，替代传统水冷，节约循环水用量。',
    specs: [['台数', '3 台'], ['风机功率', '45 kW'], ['换热面积', '1 200 m²'], ['出口温度', '45 °C']],
  });

  // 催化裂化
  push({
    id: 'fcc-reactor', unit: '催化裂化', kind: '反应器',
    cn: '提升管反应器', en: 'Riser Reactor',
    x: 70, z: -72, w: 6.5, h: 39, d: 6.5, cy: 19.5,
    desc: '原料油与高温再生催化剂在提升管内快速反应，生成汽油、柴油与液化气。',
    specs: [['反应温度', '510 °C'], ['反应时间', '3.5 s'], ['提升管高度', '38 m'], ['剂油比', '6.5']],
  });
  push({
    id: 'fcc-regen', unit: '催化裂化', kind: '反应器',
    cn: '催化剂再生器', en: 'Catalyst Regenerator',
    x: 90, z: -80, w: 10, h: 53, d: 10, cy: 26.5,
    desc: '烧去待生催化剂上的积炭，恢复活性后循环回反应器，同时回收高温烟气余热。',
    specs: [['烧焦能力', '5.5 t/min'], ['再生温度', '700 °C'], ['烟气量', '110 000 Nm³/h'], ['藏量', '180 t']],
  });
  push({
    id: 'fcc-frac', unit: '催化裂化', kind: '塔器',
    cn: '主分馏塔', en: 'Main Fractionator',
    x: 112, z: -52, w: 9, h: 47, d: 9, cy: 23.5,
    desc: '将反应油气分割为富气、粗汽油、轻柴油与油浆，塔顶油气经空冷器冷凝。',
    specs: [['塔径 / 塔高', '8.6 m / 46 m'], ['操作温度', '120 °C'], ['操作压力', '0.2 MPa'], ['处理量', '300 × 10⁴ t/a']],
  });
  push({
    id: 'fcc-stack', unit: '催化裂化', kind: '烟囱',
    cn: 'FCC 烟气烟囱', en: 'Flue Gas Stack',
    x: 142, z: -104, w: 5.5, h: 44, d: 5.5, cy: 22,
    desc: '排放再生烟气，底部设余热锅炉回收高温烟气的显热。',
    specs: [['高度', '44 m'], ['出口直径', '5.2 m'], ['排烟温度', '180 °C'], ['余热回收', '22 MW']],
  });
  push({
    id: 'fcc-blower', unit: '催化裂化', kind: '机泵',
    cn: '主风机 / 增压机', en: 'Main Air Blower',
    x: 104, z: -96, w: 10, h: 13, d: 7, cy: 6.5,
    desc: '为再生器提供烧焦所需主风，是催化裂化装置的关键动设备。',
    specs: [['风量', '2 400 Nm³/min'], ['出口压力', '0.32 MPa'], ['电机功率', '6 500 kW'], ['备用', '1 台']],
  });
  push({
    id: 'fcc-cat', unit: '催化裂化', kind: '储罐',
    cn: '催化剂罐', en: 'Catalyst Hopper',
    x: 58, z: -96, w: 7, h: 19, d: 7, cy: 17,
    desc: '储存新鲜与平衡催化剂，经小型输送风送至再生器补充系统。',
    specs: [['容积', '180 m³'], ['设计压力', '0.35 MPa'], ['介质', 'FCC 催化剂'], ['输送方式', '气力输送']],
  });
  push({
    id: 'fcc-ac', unit: '催化裂化', kind: '空冷器',
    cn: '空冷器 A-301', en: 'Air Cooler',
    x: 98, z: -58, w: 13, h: 8, d: 8, cy: 4,
    desc: '冷凝分馏塔顶油气与富吸收油，维持塔顶压力稳定。',
    specs: [['台数', '2 台'], ['风机功率', '55 kW'], ['换热面积', '1 600 m²'], ['出口温度', '50 °C']],
  });

  // 连续重整
  push({
    id: 'ccr-reactors', unit: '连续重整', kind: '反应器',
    cn: '重整反应器组', en: 'CCR Reactor Train',
    x: 70, z: 42, w: 44, h: 28, d: 9.5, cy: 14,
    desc: '三台叠置反应器串联操作，将石脑油转化为高辛烷值汽油组分与芳烃。',
    specs: [['反应器数', '3 台'], ['操作温度', '525 °C'], ['操作压力', '0.35 MPa'], ['产品辛烷值', 'RON 102']],
  });
  push({
    id: 'ccr-furnace', unit: '连续重整', kind: '加热炉',
    cn: '重整加热炉', en: 'Reformer Furnace',
    x: 58, z: 76, w: 19, h: 16, d: 12, cy: 8,
    desc: '为重整反应提供热量，双烟囱设计，炉出口温度约 525 °C。',
    specs: [['热负荷', '85 MW'], ['烟囱', '2 座'], ['出口温度', '525 °C'], ['热效率', '91 %']],
  });
  push({
    id: 'ccr-comp', unit: '连续重整', kind: '厂房',
    cn: '重整压缩机房', en: 'Recycle Gas Compressor House',
    x: 96, z: 74, w: 23, h: 10, d: 15, cy: 5,
    desc: '布置循环氢压缩机与增压机，为重整反应系统提供氢气和反应压力。',
    specs: [['建筑面积', '330 m²'], ['压缩机型式', '离心式'], ['功率', '4 200 kW'], ['氢气纯度', '≥ 92 %']],
  });

  // 公用工程
  [[-22, 88, '1#'], [18, 92, '2#']].forEach(([x, z, no]) => {
    push({
      id: `cool-${no[0]}`, unit: '公用工程', kind: '冷却塔',
      cn: `${no} 循环水冷却塔`, en: 'Cooling Tower',
      x, z, w: 36, h: 29, d: 36, cy: 14.5,
      desc: '双曲线自然通风冷却塔，为全厂换热器提供循环冷却水。',
      specs: [['塔高', '28 m'], ['淋水面积', '3 000 m²'], ['循环水量', '12 000 m³/h'], ['出水温度', '32 °C']],
    });
  });
  push({
    id: 'util-boiler', unit: '公用工程', kind: '锅炉房',
    cn: '锅炉房及烟囱', en: 'Boiler House & Stacks',
    x: 0, z: 56.5, w: 25, h: 37, d: 20, cy: 18,
    desc: '产生 4.0 MPa 过热蒸汽供各装置使用，烟气经两座 36 m 烟囱排放。',
    specs: [['锅炉', '2 × 130 t/h'], ['蒸汽压力', '4.0 MPa'], ['烟囱高度', '36 m'], ['燃料', '燃料气 / 燃料油']],
  });
  push({
    id: 'util-flare', unit: '公用工程', kind: '火炬',
    cn: '火炬系统', en: 'Flare System',
    x: 172, z: -120, w: 7, h: 78, d: 7, cy: 39,
    desc: '事故与开停车工况下安全排放可燃气体，高架火炬保证燃烧完全。',
    specs: [['火炬高度', '74 m'], ['最大排放量', '60 t/h'], ['点火方式', '长明灯'], ['消烟', '蒸汽助燃']],
  });

  // 产品调和
  push({
    id: 'blend-tanks', unit: '产品调和', kind: '储罐',
    cn: '产品调和罐组', en: 'Product Blending Tanks',
    x: 132, z: 44, w: 36, h: 13, d: 12, cy: 6.5,
    desc: '汽油、柴油组分按牌号调和，经调和泵与在线分析仪控制质量指标。',
    specs: [['调和罐', '3 × 5 000 m³'], ['调和泵', '2 台'], ['调和方式', '管道自动调和'], ['在线分析', '辛烷值 / 硫含量']],
  });

  // 产品装卸
  push({
    id: 'load-gantry', unit: '产品装卸', kind: '装车设施',
    cn: '成品油装车棚', en: 'Product Loading Gantry',
    x: 172, z: 74, w: 38, h: 8, d: 12, cy: 4,
    desc: '四套装车鹤管完成汽柴油公路出厂，配套油气回收与定量装车控制。',
    specs: [['鹤管', '4 套'], ['装车能力', '8 车 / h'], ['单车道', '2 条'], ['油气回收', '≤ 25 g/m³']],
  });

  // 管廊与总图
  push({
    id: 'rack-main', unit: '总图', kind: '管廊',
    cn: '主管廊', en: 'Pipe Corridor',
    x: 8, z: 8, w: 236, h: 11, d: 12, cy: 5.5,
    view: { pos: [30, 120, 215], target: [8, 4, 8] },
    desc: '贯通东西厂区的主工艺管廊，双层布置原油、成品油与公用工程管线。',
    specs: [['全长', '236 m'], ['层数', '2 层'], ['管位数', '7'], ['净空', '9.5 m']],
  });
  push({
    id: 'admin-office', unit: '总图', kind: '建筑',
    cn: '综合办公楼', en: 'Administration Building',
    x: -112, z: 152, w: 35, h: 13, d: 19, cy: 6.5,
    desc: '厂前区综合办公楼，布置生产调度、安全环保与行政办公。',
    specs: [['层数', '4 层'], ['建筑面积', '2 400 m²'], ['功能', '调度 / 办公'], ['位置', '厂前区']],
  });
  push({
    id: 'admin-ctrl', unit: '总图', kind: '建筑',
    cn: '中央控制室', en: 'Central Control Room',
    x: -80, z: 148, w: 25, h: 9, d: 14, cy: 4.5,
    desc: '全厂 DCS 集中控制，设抗爆墙与独立空调，是生产运行的中枢。',
    specs: [['层数', '2 层'], ['建筑面积', '620 m²'], ['控制系统', 'DCS / SIS'], ['结构', '抗爆']],
  });

  return items;
}

/* ------------------------------------------------------------------ */

export function createInteraction({ scene, camera, controls, renderer, anim, onFocus }) {
  const canvas = renderer.domElement;
  const items = buildItems();
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