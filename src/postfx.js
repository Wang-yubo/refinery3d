import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/* ------------------------------------------------------------------ */
/* SSAO：直接读取 RenderPass 的 depth texture，在颜色空间做乘法          */
/* ------------------------------------------------------------------ */
const SSAO_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform mat4 uProj;
uniform mat4 uProjInv;
uniform vec2 uRes;
uniform float uRadius;
uniform float uIntensity;
uniform float uBias;
varying vec2 vUv;

const vec3 KERNEL[10] = vec3[10](
  vec3( 0.118,  0.114, 0.906),
  vec3(-0.291,  0.422, 0.858),
  vec3( 0.612, -0.119, 0.781),
  vec3(-0.154, -0.680, 0.717),
  vec3( 0.778,  0.423, 0.463),
  vec3(-0.704,  0.286, 0.650),
  vec3( 0.209,  0.817, 0.537),
  vec3(-0.412, -0.214, 0.886),
  vec3( 0.915, -0.386, 0.118),
  vec3(-0.859,  0.501, 0.098)
);

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 viewPos(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  vec4 ndc = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 p = uProjInv * ndc;
  return p.xyz / p.w;
}

void main() {
  vec4 scene = texture2D(tDiffuse, vUv);
  float depth = texture2D(tDepth, vUv).x;
  if (depth >= 0.999999) { gl_FragColor = scene; return; }

  vec3 p = viewPos(vUv);
  vec3 n = normalize(cross(dFdx(p), dFdy(p)));
  if (dot(n, -p) < 0.0) n = -n;

  // 以屏幕像素为单位构造切线基，随机旋转削弱采样图案
  float ang = hash12(gl_FragCoord.xy) * 6.2831853;
  vec3 rv = vec3(cos(ang), sin(ang), 0.0);
  vec3 t = normalize(rv - n * dot(rv, n));
  vec3 b = cross(n, t);

  float radius = uRadius;
  float occ = 0.0;
  for (int i = 0; i < 10; i++) {
    vec3 dir = t * KERNEL[i].x + b * KERNEL[i].y + n * KERNEL[i].z;
    // 远处像素扩大采样半径，保持接触阴影的尺度感
    float scale = radius * (0.55 + clamp(-p.z / 220.0, 0.0, 1.6));
    vec3 sp = p + dir * scale;
    vec4 clip = uProj * vec4(sp, 1.0);
    vec2 suv = clip.xy / clip.w * 0.5 + 0.5;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
    float sd = texture2D(tDepth, suv).x;
    if (sd >= 0.999999) continue;
    vec3 spv = viewPos(suv);
    float range = smoothstep(0.0, 2.5, abs(spv.z - p.z));
    if (spv.z >= sp.z + uBias && spv.z <= sp.z + scale * 2.4) occ += (1.0 - range) * 0.85;
  }

  float ao = clamp(1.0 - (occ / 10.0) * uIntensity, 0.52, 1.0);
  // 在暗部保守一些，避免低照度区域糊成黑块
  float lum = dot(scene.rgb, vec3(0.2126, 0.7152, 0.0722));
  ao = mix(1.0, ao, smoothstep(0.015, 0.18, lum) * 0.9 + 0.1);
  gl_FragColor = vec4(scene.rgb * ao, scene.a);
}`;

export class SSAOPass extends Pass {
  constructor(camera, depthTexture, { radius = 1.15, intensity = 0.62, bias = 0.035 } = {}) {
    super();
    this.camera = camera;
    this.depthTexture = depthTexture;
    this.needsSwap = true;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: depthTexture },
        uProj: { value: camera.projectionMatrix },
        uProjInv: { value: camera.projectionMatrixInverse },
        uRes: { value: new THREE.Vector2(1, 1) },
        uRadius: { value: radius },
        uIntensity: { value: intensity },
        uBias: { value: bias },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: SSAO_FRAG,
      depthTest: false, depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }
  setSize(w, h) { this.material.uniforms.uRes.value.set(w, h); }
  render(renderer, writeBuffer, readBuffer) {
    const u = this.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.tDepth.value = this.depthTexture;
    u.uProj.value = this.camera.projectionMatrix;
    u.uProjInv.value = this.camera.projectionMatrixInverse;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }
}

/* ------------------------------------------------------------------ */
/* FXAA（vendor 中没有 SMAAPass；用轻量 FXAA 代替 composer 的 MSAA）     */
/* ------------------------------------------------------------------ */
const FXAA_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform vec2 uRes;
varying vec2 vUv;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec2 inv = 1.0 / uRes;
  vec2 uv = vUv;
  vec3 rgbM = texture2D(tDiffuse, uv).rgb;
  vec3 rgbNW = texture2D(tDiffuse, uv + vec2(-1.0, -1.0) * inv).rgb;
  vec3 rgbNE = texture2D(tDiffuse, uv + vec2( 1.0, -1.0) * inv).rgb;
  vec3 rgbSW = texture2D(tDiffuse, uv + vec2(-1.0,  1.0) * inv).rgb;
  vec3 rgbSE = texture2D(tDiffuse, uv + vec2( 1.0,  1.0) * inv).rgb;
  float lM = luma(rgbM);
  float lNW = luma(rgbNW), lNE = luma(rgbNE), lSW = luma(rgbSW), lSE = luma(rgbSE);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < max(0.0312, lMax * 0.125)) { gl_FragColor = vec4(rgbM, 1.0); return; }

  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float dirReduce = max((lNW + lNE + lSW + lSE) * 0.25 * 0.03125, 0.0078125);
  float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = clamp(dir * rcpDirMin, vec2(-8.0), vec2(8.0)) * inv;

  vec3 rgbA = 0.5 * (
    texture2D(tDiffuse, uv + dir * (1.0 / 3.0 - 0.5)).rgb +
    texture2D(tDiffuse, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 rgbB = rgbA * 0.5 + 0.25 * (
    texture2D(tDiffuse, uv + dir * -0.5).rgb +
    texture2D(tDiffuse, uv + dir * 0.5).rgb);
  float lB = luma(rgbB);
  gl_FragColor = vec4((lB < lMin || lB > lMax) ? rgbA : rgbB, 1.0);
}`;

export class FXAAPass extends Pass {
  constructor() {
    super();
    this.material = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: FXAA_FRAG,
      depthTest: false, depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }
  setSize(w, h) { this.material.uniforms.uRes.value.set(w, h); }
  render(renderer, writeBuffer, readBuffer) {
    const u = this.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.uRes.value.set(readBuffer.width, readBuffer.height);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }
}

/* ------------------------------------------------------------------ */
/* 电影感调色：色差、柔暗角、细颗粒、曝光自适应                            */
/* ------------------------------------------------------------------ */
const CINEMATIC_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform float uCA;
uniform float uExposure;
uniform vec2 uRes;
varying vec2 vUv;

float rand(vec2 co) {
  return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 d = vUv - 0.5;
  float r2 = dot(d, d);
  // 轻微径向色差：中心无偏移，边缘约 1.5px
  vec2 off = d * r2 * uCA * 0.026;
  vec3 c;
  c.r = texture2D(tDiffuse, vUv + off).r;
  c.g = texture2D(tDiffuse, vUv).g;
  c.b = texture2D(tDiffuse, vUv - off).b;

  c *= uExposure;

  // 更柔的暗角 + 保留中心曝光
  vec2 vp = (vUv - 0.5) * vec2(1.0, 0.92);
  float vig = smoothstep(1.16, 0.34, length(vp));
  c *= mix(1.0, vig, uVignette);

  // 细颗粒：两个不同频率的 hash 叠加，避免块状噪点
  float g1 = rand(vUv * uRes + uTime * 37.0) - 0.5;
  float g2 = rand(vUv * uRes * 1.77 - uTime * 19.0) - 0.5;
  c += (g1 * 0.65 + g2 * 0.35) * uGrain;

  gl_FragColor = vec4(c, 1.0);
}`;

export class CinematicPass extends Pass {
  constructor() {
    super();
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uVignette: { value: 0.46 },
        uGrain: { value: 0.014 },
        uTime: { value: 0 },
        uCA: { value: 0.22 },
        uExposure: { value: 1.0 },
        uRes: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: CINEMATIC_FRAG,
      depthTest: false, depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }
  setSize(w, h) { this.material.uniforms.uRes.value.set(w, h); }
  render(renderer, writeBuffer, readBuffer) {
    const u = this.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.uRes.value.set(readBuffer.width, readBuffer.height);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }
}

/* ------------------------------------------------------------------ */
/* 景深：仅在高质量 + 机位截图 / 巡游 / ?dof=1 时开启                     */
/* ------------------------------------------------------------------ */
const DOF_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uNear;
uniform float uFar;
uniform float uFocus;
uniform float uMaxBlur;
varying vec2 vUv;

float linearDepth(float d) {
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}

void main() {
  vec3 center = texture2D(tDiffuse, vUv).rgb;
  float depth = linearDepth(texture2D(tDepth, vUv).x);
  float farCoc = smoothstep(uFocus * 1.05, uFocus * 2.15, depth);
  float nearCoc = smoothstep(uFocus * 0.72, uFocus * 0.3, depth) * 0.55;
  float coc = clamp(max(farCoc, nearCoc), 0.0, 1.0);
  if (coc < 0.015) { gl_FragColor = vec4(center, 1.0); return; }

  float radius = uMaxBlur * coc;
  vec3 sum = center;
  float wsum = 1.0;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 2.39996323;
    float r = sqrt((float(i) + 0.5) / 12.0) * radius;
    vec2 o = vec2(cos(a), sin(a)) * r * uTexel;
    sum += texture2D(tDiffuse, vUv + o).rgb;
    wsum += 1.0;
  }
  vec3 blurred = sum / wsum;
  gl_FragColor = vec4(mix(center, blurred, coc * 0.92), 1.0);
}`;

export class DepthOfFieldPass extends Pass {
  constructor(camera, depthTexture, { maxBlur = 9.0 } = {}) {
    super();
    this.camera = camera;
    this.depthTexture = depthTexture;
    this.focus = 120;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: depthTexture },
        uTexel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) },
        uNear: { value: camera.near },
        uFar: { value: camera.far },
        uFocus: { value: this.focus },
        uMaxBlur: { value: maxBlur },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: DOF_FRAG,
      depthTest: false, depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(this.material);
  }
  setFocus(distance) { this.focus = distance; }
  setSize(w, h) { this.material.uniforms.uTexel.value.set(1 / w, 1 / h); }
  render(renderer, writeBuffer, readBuffer) {
    const u = this.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.tDepth.value = this.depthTexture;
    u.uFocus.value = this.focus;
    u.uNear.value = this.camera.near;
    u.uFar.value = this.camera.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }
}

/* ------------------------------------------------------------------ */
/* 1x1 平均亮度采样器（16x16 输出，每个像素 16 taps），供曝光自适应使用   */
/* ------------------------------------------------------------------ */
const LUMA_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
varying vec2 vUv;
void main() {
  vec3 sum = vec3(0.0);
  for (int y = 0; y < 4; y++) {
    for (int x = 0; x < 4; x++) {
      vec2 o = (vec2(float(x), float(y)) + 0.5) / 4.0 - 0.5;
      sum += texture2D(tDiffuse, vUv + o * 0.018).rgb;
    }
  }
  gl_FragColor = vec4(sum / 16.0, 1.0);
}`;

export function createLuminanceMeter() {
  const rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.UnsignedByteType });
  const mat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: LUMA_FRAG,
    depthTest: false, depthWrite: false,
  });
  const quad = new FullScreenQuad(mat);
  const buf = new Uint8Array(16 * 16 * 4);
  return {
    rt, mat, quad, buf,
    sample(renderer, texture) {
      mat.uniforms.tDiffuse.value = texture;
      renderer.setRenderTarget(rt);
      quad.render(renderer);
      renderer.setRenderTarget(null);
      renderer.readRenderTargetPixels(rt, 0, 0, 16, 16, buf);
      let sum = 0;
      for (let i = 0; i < 256; i++) {
        sum += 0.2126 * buf[i * 4] + 0.7152 * buf[i * 4 + 1] + 0.0722 * buf[i * 4 + 2];
      }
      return sum / 256 / 255;
    },
    dispose() { rt.dispose(); mat.dispose(); quad.dispose(); },
  };
}
