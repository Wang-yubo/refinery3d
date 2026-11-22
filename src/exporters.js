/* E2：导出（4K PNG）+ 录屏（WebM）
 * - exportPNG：临时放大到目标分辨率（DPR=1、相机 aspect 同步），渲染一帧后
 *   用 gl.readPixels 读回像素（不依赖 preserveDrawingBuffer），最后完整恢复
 *   尺寸 / DPR / 相机 / composer，恢复后画面与导出前逐像素一致
 * - recordTour：canvas.captureStream + MediaRecorder（优先 vp9，回退 vp8），
 *   录制导览 / 全景巡游若干秒，返回 blob 与 duration，由 UI 触发下载
 */
import * as THREE from 'three';

/** readPixels → canvas → PNG dataURL（需要刚从 render 里返回，未被合成清空） */
function readPixelsPng(renderer, width, height) {
  const gl = renderer.getContext();
  const px = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(width, height);
  const row = width * 4;
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * row;
    img.data.set(px.subarray(src, src + row), y * row);
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

export function createExporters({ renderer, camera, composer, dofPass, renderFrame, onProgress = () => {} }) {
  const tmpSize = new THREE.Vector2();

  async function exportPNG({ width = 3840, height = 2160 } = {}) {
    const t0 = performance.now();
    renderer.getSize(tmpSize);
    const prev = {
      w: tmpSize.x, h: tmpSize.y,
      dpr: renderer.getPixelRatio(),
      aspect: camera.aspect,
      fov: camera.fov,
    };
    onProgress('准备 4K 渲染 …');
    try {
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false);
      if (composer) {
        composer.setPixelRatio(1);
        composer.setSize(width, height);
      }
      dofPass?.setSize?.(width, height);
      camera.aspect = width / height;
      camera.fov = prev.fov;
      camera.updateProjectionMatrix();
      renderFrame();
      const dataUrl = readPixelsPng(renderer, width, height);
      onProgress('导出完成');
      return { dataUrl, width, height, ms: +(performance.now() - t0).toFixed(0) };
    } finally {
      renderer.setPixelRatio(prev.dpr);
      renderer.setSize(prev.w, prev.h, false);
      if (composer) {
        composer.setPixelRatio(prev.dpr);
        composer.setSize(prev.w, prev.h);
      }
      dofPass?.setSize?.(prev.w * prev.dpr, prev.h * prev.dpr);
      camera.aspect = prev.aspect;
      camera.fov = prev.fov;
      camera.updateProjectionMatrix();
      renderFrame();
    }
  }

  const MIMES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

  /** 录制 seconds 秒；开始/结束时可回调（用于按钮状态与倒计时） */
  async function recordTour({ seconds = 30, fps = 30, onStart = () => {}, onTick = () => {}, onEnd = () => {} } = {}) {
    const canvas = renderer.domElement;
    if (!canvas.captureStream || typeof MediaRecorder === 'undefined') {
      throw new Error('MediaRecorder / captureStream 不可用');
    }
    const mime = MIMES.find((x) => MediaRecorder.isTypeSupported(x)) || '';
    /* fps=0 + 手动 requestFrame：部分 headless / SwiftShader 下更可靠 */
    const stream = canvas.captureStream(fps);
    const videoTrack = stream.getVideoTracks()[0];
    const manualFrames = typeof videoTrack?.requestFrame === 'function';
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 }) : new MediaRecorder(stream);
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise((resolve) => { rec.onstop = () => resolve(new Blob(chunks, { type: mime || 'video/webm' })); });

    // 录制期间的帧率统计
    let frames = 0;
    let raf = 0;
    const tick = () => { frames++; if (manualFrames && frames % 2 === 0) try { videoTrack.requestFrame(); } catch {} raf = requestAnimationFrame(tick); };
    const t0 = performance.now();
    onStart({ seconds, mime });
    rec.start(1000);
    raf = requestAnimationFrame(tick);
    const startedAt = performance.now();
    while (performance.now() - startedAt < seconds * 1000) {
      await new Promise((r) => setTimeout(r, 100));
      onTick({ left: +Math.max(0, seconds - (performance.now() - startedAt) / 1000).toFixed(1) });
    }
    rec.stop();
    cancelAnimationFrame(raf);
    const blob = await done;
    const ms = performance.now() - t0;
    const elapsed = (performance.now() - startedAt) / 1000;
    stream.getTracks().forEach((t) => t.stop());

    // 用 <video> 读 duration（WebM 头里可能没有，读到则返回）
    const duration = await new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => { const d = v.duration; URL.revokeObjectURL(url); resolve(Number.isFinite(d) ? +d.toFixed(2) : null); };
      v.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      v.src = url;
      setTimeout(() => resolve(null), 4000);
    });
    const out = { blob, bytes: blob.size, mime: mime || rec.mimeType, ms: +ms.toFixed(0), elapsed: +elapsed.toFixed(2), duration, recordedFps: +(frames / elapsed).toFixed(1) };
    onEnd(out);
    return out;
  }

  function download(dataUrlOrBlob, name) {
    const a = document.createElement('a');
    a.download = name;
    a.href = typeof dataUrlOrBlob === 'string' ? dataUrlOrBlob : URL.createObjectURL(dataUrlOrBlob);
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (typeof dataUrlOrBlob !== 'string') setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  return { exportPNG, recordTour, download };
}