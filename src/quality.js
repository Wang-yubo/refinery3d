/**
 * 画质分档：high / mid / low
 * 默认按设备能力自动选择；URL ?q=high|mid|low 可强制指定（显式指定时不做自动降档）。
 */
export const QUALITY_LEVELS = {
  high: {
    label: 'HIGH', pixelRatio: 2, shadowMap: 2048, shadows: true, bloom: true,
    ao: true, contactShadows: true, fxaa: true, dof: true, pointLights: 12,
    bloomScale: 1.0, maxDof: 1,
  },
  mid: {
    label: 'MID', pixelRatio: 1.5, shadowMap: 1024, shadows: true, bloom: true,
    ao: false, contactShadows: true, fxaa: true, dof: false, pointLights: 6,
    bloomScale: 0.85, maxDof: 0,
  },
  low: {
    label: 'LOW', pixelRatio: 1.2, shadowMap: 512, shadows: true, bloom: false,
    ao: false, contactShadows: false, fxaa: false, dof: false, pointLights: 2,
    bloomScale: 0.7, maxDof: 0,
  },
};

export function isTouchLike() {
  return (navigator.maxTouchPoints || 0) > 0 || matchMedia('(pointer: coarse)').matches;
}

/** 返回 { level, reason, forced } */
export function detectQuality(params = new URLSearchParams(location.search)) {
  const forced = (params.get('q') || '').toLowerCase();
  if (QUALITY_LEVELS[forced]) return { level: forced, reason: 'url', forced: true };

  const dpr = window.devicePixelRatio || 1;
  const cores = navigator.hardwareConcurrency || 8;
  const narrow = Math.min(innerWidth, innerHeight) < 720 || innerWidth < 1024;
  const touch = isTouchLike();


  if (cores <= 4 || dpr > 2) {
    return { level: 'low', reason: cores <= 4 ? 'cpu<=4' : 'dpr>2', forced: false };
  }
  // 触屏 / 窄屏 / 真正低于 1 的 DPR 走 mid；普通桌面 dpr=1 保持 high
  if (touch || narrow || dpr < 0.9) {
    return { level: 'mid', reason: touch ? 'touch' : (narrow ? 'narrow' : 'dpr<0.9'), forced: false };
  }
  return { level: 'high', reason: 'desktop', forced: false };
}

/** 画面外小按钮的循环顺序 */
export const QUALITY_CYCLE = ['high', 'mid', 'low'];
