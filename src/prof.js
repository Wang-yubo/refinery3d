/**
 * 冷启动计时 / shader 程序诊断（默认零成本，只在 ?profile=1 时挂 GL 钩子）。
 *
 * - mark(name)：记录相对模块开始（T0）与相邻标记的毫秒耗时；结果可用 window.__timing() 取回
 * - instrumentGL(gl)：包装 linkProgram / compileShader，按 program 统计编译耗时
 *   （需要 renderer.info.programs 才能把 GL program 映射回 three 的 program 名称）
 */
const T0 = (typeof window !== "undefined" && window.__t0) || performance.now();
const marks = [];
let last = T0;

export function mark(name, extra) {
  const now = performance.now();
  const entry = { name, t: +(now - T0).toFixed(1), dt: +(now - last).toFixed(1) };
  if (extra) entry.extra = extra;
  marks.push(entry);
  last = now;
  try { performance.mark(name); } catch { /* ignore */ }
  return entry;
}

export function marksList() { return marks.slice(); }
export function elapsed() { return +(performance.now() - T0).toFixed(1); }

/* ------------------------------------------------------------------ */
/* GL 编译钩子（仅 ?profile=1）：定位最贵的 program                      */
/* ------------------------------------------------------------------ */
let glStats = null;

export function instrumentGL(gl) {
  if (glStats) return glStats;
  const linkCost = new Map();      // glProgram -> ms
  const linkOrder = [];
  const shaderCost = new Map();
  let linkTotal = 0;
  let compileTotal = 0;
  let compileCount = 0;

  const origLink = gl.linkProgram.bind(gl);
  gl.linkProgram = (program) => {
    const t = performance.now();
    origLink(program);
    const dt = performance.now() - t;
    linkTotal += dt;
    linkCost.set(program, dt);
    linkOrder.push(program);
  };
  /* 缓冲上传 / draw 调用统计（定位首帧是上传慢还是 draw 慢） */
  const bufStat = { count: 0, bytes: 0, ms: 0 };
  for (const fn of ['bufferData', 'bufferSubData']) {
    const orig = gl[fn].bind(gl);
    gl[fn] = (...args) => {
      const t = performance.now();
      const r = orig(...args);
      bufStat.ms += performance.now() - t;
      bufStat.count++;
      const d = args[1];
      if (d && typeof d.byteLength === 'number') bufStat.bytes += d.byteLength;
      return r;
    };
  }
  const drawStat = { calls: 0, ms: 0 };
  for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced']) {
    const orig = gl[fn].bind(gl);
    gl[fn] = (...args) => {
      const t = performance.now();
      const r = orig(...args);
      drawStat.ms += performance.now() - t;
      drawStat.calls++;
      return r;
    };
  }
  const origCompile = gl.compileShader.bind(gl);
  gl.compileShader = (shader) => {
    const t = performance.now();
    origCompile(shader);
    const dt = performance.now() - t;
    compileTotal += dt;
    compileCount++;
    shaderCost.set(shader, dt);
  };

  glStats = {
    linkTotal: () => +linkTotal.toFixed(1),
    compileTotal: () => +compileTotal.toFixed(1),
    compileCount: () => compileCount,
    linkCount: () => linkOrder.length,
    bufStat,
    drawStat,
    linkCost,
    linkOrder,
  };
  return glStats;
}

export function glSummary() {
  if (!glStats) return null;
  return {
    bufferUploads: glStats.bufStat.count,
    bufferMB: +(glStats.bufStat.bytes / 1048576).toFixed(1),
    bufferMs: +glStats.bufStat.ms.toFixed(1),
    drawCalls: glStats.drawStat.calls,
    drawMs: +glStats.drawStat.ms.toFixed(1),
    linkCount: glStats.linkCount(),
    linkTotalMs: glStats.linkTotal(),
    compileCount: glStats.compileCount(),
    compileTotalMs: glStats.compileTotal(),
  };
}

/** 把 three 的 program 与 GL 编译耗时对齐 */
export function programTimings(renderer) {
  if (!glStats) return null;
  const list = (renderer.info.programs || []).map((p) => {
    const glp = p.program;
    const dt = glStats.linkCost.get(glp);
    return {
      name: p.name,
      id: p.id,
      usedTimes: p.usedTimes,
      ms: dt === undefined ? null : +dt.toFixed(1),
      cacheKey: String(p.cacheKey || '').slice(0, 160),
    };
  });
  return list;
}