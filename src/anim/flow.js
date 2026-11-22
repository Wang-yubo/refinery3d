/* 物料流线 + 粒子 + 阶段光环 / 聚光灯（D1 从 animation.js 拆出） */
import * as THREE from 'three';
import { mark } from '../prof.js';
import { makeGlow } from '../helpers.js';
import { STAGES, STREAMS, POINT_VERT, POINT_FRAG, TUBE_VERT, TUBE_FRAG } from '../data/stages.js';
import { V, hash, lerp } from './util.js';

class Stream {
  /**
   * @param {object} def 流线定义
   * @param {THREE.Texture} glowTex 粒子贴图
   * @param {THREE.Group} flowRoot 流线容器
   */
  constructor(def, glowTex, flowRoot) {
    this.def = def;
    this._tmp = new THREE.Vector3();
    this.curve = new THREE.CatmullRomCurve3(def.points.map((p) => V(...p)), false, 'catmullrom', 0.28);
    this.len = Math.max(1, this.curve.getLength());
    const tubular = Math.max(80, Math.round(this.len / 5));
    const tubeGeo = new THREE.TubeGeometry(this.curve, tubular, 0.42, 5, false);
    this.lineMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(def.color) },
        uOpacity: { value: 0.2 },
        uTime: { value: 0 },
        uSpeed: { value: def.speed / 9 },
        uRepeat: { value: this.len / 9 },
      },
      vertexShader: TUBE_VERT,
      fragmentShader: TUBE_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.tube = new THREE.Mesh(tubeGeo, this.lineMat);
    this.tube.frustumCulled = false;

    const n = def.particles;
    this.n = n;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const siz = new Float32Array(n);
    const base = new THREE.Color(def.color);
    this.offsets = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const c = base.clone().offsetHSL((hash(i * 3.7) - 0.5) * 0.1, 0, (hash(i * 5.1) - 0.5) * 0.18);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      siz[i] = 0.55 + hash(i * 9.3) * 0.95;
      this.offsets[i] = (i / n + hash(i * 2.3) * 0.02) % 1;
    }
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pgeo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    pgeo.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
    this.pointMat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: glowTex }, uOpacity: { value: 0.7 }, uSize: { value: 1.0 } },
      vertexShader: POINT_VERT,
      fragmentShader: POINT_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.points = new THREE.Points(pgeo, this.pointMat);
    this.points.frustumCulled = false;

    this.group = new THREE.Group();
    this.group.add(this.tube, this.points);
    flowRoot.add(this.group);

    this.opacity = 0.2;
    this.speed = def.speed;
  }

  update(t, active, dt, snap = false) {
    const target = active ? 1.0 : 0.32;
    this.opacity = snap ? target : lerp(this.opacity, target, 1 - Math.exp(-dt * 3.2));
    const v = this.def.speed * (active ? 1 : 0.45);
    this.lineMat.uniforms.uOpacity.value = this.opacity * 0.62;
    this.lineMat.uniforms.uTime.value = t;
    this.lineMat.uniforms.uSpeed.value = v / 9;
    this.pointMat.uniforms.uOpacity.value = this.opacity * 0.95;
    this.pointMat.uniforms.uSize.value = active ? 1.15 : 0.78;
    const du = v / this.len;
    const pos = this.points.geometry.attributes.position;
    for (let i = 0; i < this.n; i++) {
      let u = (this.offsets[i] + t * du) % 1;
      if (u < 0) u += 1;
      this.curve.getPointAt(u, this._tmp);
      pos.setXYZ(i, this._tmp.x, this._tmp.y, this._tmp.z);
    }
    pos.needsUpdate = true;
  }
}

/**
 * 创建物料流线、阶段光环与阶段聚光灯（D1 从 animation.js 拆出，行为不变）
 * @param {object} o
 * @param {THREE.Group} o.flowRoot 流线容器（调用方已加入场景）
 * @param {object} o.m 材质库（取 glowTex）
 * @param {object} o.state 动画状态机（stage / overview / active / time）
 */
export function createFlow({ flowRoot, m, state }) {
  const glowTex = m.glowTex;

  const streams = STREAMS.map((def) => new Stream(def, glowTex, flowRoot));

  mark('anim-streams-done');
  /* ---------------- stage rings ---------------- */
  const ringGroups = [];
  for (const s of STAGES) {
    const g = new THREE.Group();
    g.position.set(s.focus[0], 0.5, s.focus[2]);
    const mkRing = (r, w, op) => {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(Math.max(0.1, r - w), r, 96),
        new THREE.MeshBasicMaterial({
          color: s.color, transparent: true, opacity: op,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.frustumCulled = false;
      g.add(mesh);
      return mesh;
    };
    const outer = mkRing(s.ring, s.ring * 0.03, 0.0);
    const inner = mkRing(s.ring * 0.72, s.ring * 0.012, 0.0);
    const aura = makeGlow(glowTex, s.color, s.ring * 1.9, 0.0);
    aura.position.y = 2.4;
    g.add(aura);
    flowRoot.add(g);
    ringGroups.push({ group: g, outer, inner, aura, stage: s });
  }

  mark('anim-rings-done');
  /* ---------------- stage spot light ---------------- */
  const spotTarget = new THREE.Object3D();
  const spot = new THREE.SpotLight(0xffd7a6, 0, 230, 0.48, 0.72, 2);
  spot.castShadow = false;
  spot.visible = false;
  spotTarget.position.set(0, 0, 0);
  flowRoot.add(spot, spotTarget);
  spot.target = spotTarget;

  mark('anim-spot-done');
  /* ---------------- stage visuals ---------------- */
  function isStreamActive(st) {
    if (!state.active) return false;
    if (state.overview) return true;
    return st.def.stages.includes(state.stage);
  }

  function applyStageVisuals() {
    for (let i = 0; i < ringGroups.length; i++) {
      const rg = ringGroups[i];
      const on = state.active && (state.overview || i === state.stage);
      rg.group.visible = on;
      if (!on) continue;
      const base = state.overview ? 0.14 : 0.34;
      rg.outer.material.opacity = base;
      rg.inner.material.opacity = base * 0.8;
      rg.aura.material.opacity = base * 0.22;
    }
    if (state.active && !state.overview) {
      const s = STAGES[state.stage];
      spot.visible = true;
      spot.position.set(s.focus[0], 96, s.focus[2] + 26);
      spotTarget.position.set(s.focus[0], 2, s.focus[2]);
      spot.intensity = 12000;
      spot.color.setHex(0xffdcb4);
    } else {
      spot.visible = false;
    }
    for (const st of streams) st.update(state.time, isStreamActive(st), 0, true);
  }

  function updateFlow(t, dt) {
    for (const st of streams) st.update(t, isStreamActive(st), dt);
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
    for (let i = 0; i < ringGroups.length; i++) {
      const rg = ringGroups[i];
      if (!rg.group.visible) continue;
      const base = state.overview ? 0.13 : 0.3;
      rg.outer.material.opacity = base * (0.75 + 0.35 * pulse);
      rg.inner.material.opacity = base * 0.75 * (0.7 + 0.4 * (1 - pulse));
      rg.aura.material.opacity = base * (0.18 + 0.12 * pulse);
    }
    if (spot.visible) {
      spot.intensity = 11000 * (0.88 + 0.14 * pulse);
    }
    if (state.overview) {
      // 总览时所有阶段环轻微呼吸
      for (const rg of ringGroups) {
        rg.outer.material.opacity = 0.1 + 0.05 * Math.sin(t * 1.4 + rg.stage.focus[0] * 0.05);
      }
    }
  }

  /** 跳到指定时间（setTime 用，不做插值） */
  function refreshStreams(t) {
    for (const st of streams) st.update(t, isStreamActive(st), 0, true);
  }

  return { streams, ringGroups, spot, spotTarget, isStreamActive, applyStageVisuals, updateFlow, refreshStreams };
}
