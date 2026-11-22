/* 镜头巡游 / 缓动（D1 从 animation.js 拆出）：机位应用、flyTo 补间 */
import { V, lerp, easeInOutCubic } from './util.js';

/**
 * @param {object} o
 * @param {object} o.camera 透视相机
 * @param {object} o.controls 轨道控制器
 * @param {object} o.state 动画状态机（复用 state.tween）
 */
export function createTourCam({ camera, controls, state }) {
  function camApply(cam) {
    camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
    controls.target.set(cam.target[0], cam.target[1], cam.target[2]);
    camera.fov = cam.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(controls.target);
    controls.update();
  }

  function flyTo(cam, { immediate = false, dur = 2.0 } = {}) {
    if (immediate || dur <= 0) {
      state.tween = null;
      controls.enabled = true;
      camApply(cam);
      return;
    }
    state.tween = {
      t: 0,
      dur,
      from: { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov },
      to: { pos: V(...cam.pos), target: V(...cam.target), fov: cam.fov },
    };
    controls.enabled = false;
  }

  function updateTween(dt) {
    const tw = state.tween;
    if (!tw) return;
    tw.t = Math.min(1, tw.t + dt / tw.dur);
    const e = easeInOutCubic(tw.t);
    camera.position.lerpVectors(tw.from.pos, tw.to.pos, e);
    controls.target.lerpVectors(tw.from.target, tw.to.target, e);
    camera.fov = lerp(tw.from.fov, tw.to.fov, e);
    camera.updateProjectionMatrix();
    camera.lookAt(controls.target);
    if (tw.t >= 1) {
      state.tween = null;
      controls.enabled = true;
    }
  }

  return { camApply, flyTo, updateTween };
}