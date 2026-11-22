import * as THREE from 'three';

/**
 * C2：分享链接（状态序列化）。
 *
 * 把机位 / 相机位姿 / 画质档 / 选中设备 / 动画阶段+时间压进 URL 的一个 `st` 参数，
 * 其余既有参数（shot / q / clean / procedural / stats …）原样保留。
 * 编码用 JSON + base64url，一台设备 + 位姿约 200 字符，远小于 2 KB。
 */

const r3 = (v) => Math.round(v * 1000) / 1000;

function b64u(str) {
  const bin = unescape(encodeURIComponent(str));
  return btoa(bin).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function unb64u(s) {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return decodeURIComponent(escape(bin));
}

export function createShare({
  camera, controls, anim, interact,
  getShot, setShot, getQuality, applyQuality, pinQuality = null, isClean = false,
}) {
  const btn = document.getElementById('share-btn');
  const toastEl = document.getElementById('share-toast');
  let toastTimer = 0;

  function snapshot() {
    const st = interact?.state ? interact.state() : {};
    const a = anim && anim.isActive()
      ? { s: anim.state.stage, t: r3(anim.state.time || 0), p: anim.state.playing ? 1 : 0, o: anim.state.overview ? 1 : 0 }
      : null;
    return {
      v: 1,
      s: getShot(),
      p: [r3(camera.position.x), r3(camera.position.y), r3(camera.position.z)],
      t: [r3(controls.target.x), r3(controls.target.y), r3(controls.target.z)],
      f: Math.round(camera.fov * 10) / 10,
      q: getQuality(),
      e: st.selected || null,
      a,
    };
  }

  function url(state = snapshot()) {
    const u = new URL(location.href);
    u.searchParams.set('st', b64u(JSON.stringify(state)));
    if (state.s && state.s !== 'process') u.searchParams.set('shot', state.s);
    u.hash = '';
    return u.toString();
  }

  function toast(text, ms = 1900) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  async function copy() {
    const link = url();
    try {
      await navigator.clipboard.writeText(link);
      toast('分享链接已复制（含机位 / 画质 / 选中设备 / 动画进度）');
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = link;
        ta.style.cssText = 'position:fixed;opacity:0;left:-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        toast('分享链接已复制');
      } catch {
        // 最后兜底：把链接显示在 toast 里（不弹 prompt 阻塞页面），并打到控制台
        console.info('[share] 无法写入剪贴板，请手动复制：', link);
        toast(`复制失败，请手动复制：${link}`, 6000);
      }
    }
    return { url: link, len: link.length };
  }

  function apply(state) {
    if (!state || state.v !== 1) return null;
    const out = { shot: null, quality: null, equip: null, anim: null, camera: false };
    if (state.a) { setShot('process'); out.shot = 'process'; }
    else if (state.s) { setShot(state.s); out.shot = state.s; }
    if (state.q && state.q !== getQuality()) {
      pinQuality?.(state.q);           // 分享链接里写了画质档 → 不再被自动降档覆盖
      applyQuality(state.q);
      out.quality = state.q;
    }
    if (state.a) {
      anim.enter({ stage: state.a.s | 0, immediate: true, playing: !!state.a.p, cruise: false });
      anim.setTime(state.a.t || 0);
      if (state.a.o) { anim.overview(); anim.state.overview = true; }
      out.anim = { stage: anim.state.stage, time: +anim.state.time.toFixed(2), playing: anim.state.playing };
    }
    if (state.e) { out.equip = interact.selectById(state.e) || null; }
    if (Array.isArray(state.p) && Array.isArray(state.t)) {
      camera.position.set(state.p[0], state.p[1], state.p[2]);
      controls.target.set(state.t[0], state.t[1], state.t[2]);
      if (state.f) { camera.fov = state.f; camera.updateProjectionMatrix(); }
      camera.lookAt(new THREE.Vector3(state.t[0], state.t[1], state.t[2]));
      controls.update();
      out.camera = true;
    }
    return out;
  }

  function applyFromUrl() {
    const raw = new URLSearchParams(location.search).get('st');
    if (!raw) return null;
    let state = null;
    try { state = JSON.parse(unb64u(raw)); } catch (err) { console.warn('[share] 链接解析失败：', err.message); return null; }
    try { return apply(state); } catch (err) { console.warn('[share] 链接恢复失败：', err.message); return null; }
  }

  if (btn) {
    btn.addEventListener('click', () => { copy(); });
    if (isClean) btn.style.display = 'none';
  }

  return { snapshot, url, copy, apply, applyFromUrl, toast, encode: (s) => b64u(JSON.stringify(s)), decode: unb64u };
}