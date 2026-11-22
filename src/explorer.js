/**
 * C1：设备列表面板（分组 / 中英位号搜索）+ 右下角 2D 小地图。
 *
 * - 数据直接复用 interaction 的 35 台设备（同一份坐标），点击走 focusById，
 *   与 3D 拾取共用同一套选中/机位逻辑，因此不会出现「面板选中 ≠ 场景选中」。
 * - 小地图只做俯视示意：厂区轮廓 + 设备footprint + 相机位置/朝向 + 选中高亮；
 *   12Hz 重绘，避免影响帧率。
 * - `?clean=1` 下整块隐藏（截图模式）；≤900px 默认折叠成一个小按钮。
 */

const GROUPS = [
  ['原油储运', '罐区', 'TANK FARM'],
  ['常减压蒸馏', '常减压', 'CDU / VDU'],
  ['催化裂化', '催化裂化', 'FCC'],
  ['连续重整', '连续重整', 'CCR'],
  ['公用工程', '公用工程', 'UTILITIES'],
  ['产品调和', '产品调和', 'BLENDING'],
  ['产品装卸', '装卸出厂', 'LOADING'],
  ['总图', '总图', 'SITE'],
];

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

const hex = (n) => `#${(n >>> 0).toString(16).padStart(6, '0')}`;
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');

export function createExplorer({ interact, camera, controls, isClean = false }) {
  const items = (interact.items || []).map((it) => ({
    raw: it,
    id: it.id,
    cn: it.cn,
    en: it.en,
    unit: it.unit,
    kind: it.kind,
    color: it.color != null ? it.color : (UNIT_COLORS[it.unit] ?? 0x9fd8f0),
    x: it.x, z: it.z, w: it.w, d: it.d,
    key: norm([it.cn, it.en, it.id, it.unit, it.kind].join(' ')),
  }));

  /* ---------------- DOM ---------------- */
  const root = document.getElementById('explorer');
  const listEl = document.getElementById('xp-list');
  const searchEl = document.getElementById('xp-search');
  const countEl = document.getElementById('xp-count');
  const toggleEl = document.getElementById('xp-toggle');
  const mmWrap = document.getElementById('minimap-wrap');
  const canvas = document.getElementById('minimap');
  if (!root || !listEl || !canvas) return null;

  const groups = [];
  const byId = new Map();
  let selectedId = null;
  let query = '';
  let openKeys = new Set(GROUPS.map((g) => g[0]));

  const rowOf = new Map();

  for (const [unit, cnLabel, enLabel] of GROUPS) {
    const list = items.filter((it) => it.unit === unit);
    if (!list.length) continue;
    const g = document.createElement('section');
    g.className = 'xp-group';
    g.dataset.unit = unit;
    const head = document.createElement('button');
    head.className = 'xp-ghead';
    head.type = 'button';
    head.innerHTML = `<span class="xp-gn">${cnLabel}</span><span class="xp-ge">${enLabel}</span><b>${list.length}</b>`;
    head.onclick = () => {
      if (openKeys.has(unit)) openKeys.delete(unit); else openKeys.add(unit);
      g.classList.toggle('closed', !openKeys.has(unit));
    };
    const body = document.createElement('div');
    body.className = 'xp-gbody';
    for (const it of list) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'xp-row';
      row.dataset.id = it.id;
      row.style.setProperty('--uc', hex(it.color));
      row.innerHTML = `<i></i><span class="xp-cn">${it.cn}</span>`
        + `<span class="xp-meta">${it.id.replace(/^tank-/, 'T-')} · ${it.en}</span>`;
      row.onclick = () => {
        const id = it.id;
        if (window.__focusEquip) window.__focusEquip(id, false);
        else interact.focusById(id);
        setSelected(id);
        if (window.innerWidth <= 900) root.classList.remove('open');
      };
      body.appendChild(row);
      rowOf.set(it.id, row);
      byId.set(it.id, it);
    }
    g.append(head, body);
    listEl.appendChild(g);
    groups.push({ unit, el: g, count: list.length });
    if (!openKeys.has(unit)) g.classList.add('closed');
  }

  function setSelected(id) {
    selectedId = id || null;
    for (const [rid, row] of rowOf) row.classList.toggle('on', rid === selectedId);
    const row = selectedId && rowOf.get(selectedId);
    if (row) {
      const g = row.closest('.xp-group');
      if (g) { g.classList.remove('closed'); openKeys.add(g.dataset.unit); }
    }
  }

  function applyFilter() {
    const q = norm(query);
    let shown = 0;
    for (const g of groups) {
      let hit = 0;
      for (const row of g.el.querySelectorAll('.xp-row')) {
        const it = byId.get(row.dataset.id);
        const ok = !q || (it && it.key.includes(q));
        row.hidden = !ok;
        if (ok) hit++;
      }
      g.el.hidden = hit === 0;
      g.el.classList.toggle('closed', q ? false : !openKeys.has(g.unit));
      if (q && hit) { g.el.classList.remove('closed'); openKeys.add(g.unit); }
      shown += hit;
    }
    if (countEl) countEl.textContent = q ? `${shown}/${items.length}` : String(items.length);
    listEl.classList.toggle('empty', shown === 0);
  }

  searchEl?.addEventListener('input', () => { query = searchEl.value; applyFilter(); });
  searchEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = [...listEl.querySelectorAll('.xp-row')].find((r) => !r.hidden);
      first?.click();
    }
    if (e.key === 'Escape') { searchEl.value = ''; query = ''; applyFilter(); searchEl.blur(); }
  });

  const setOpen = (open) => {
    root.classList.toggle('closed', !open);
    root.classList.toggle('open', open);
  };
  const isNarrow = () => window.innerWidth <= 900;
  toggleEl?.addEventListener('click', () => setOpen(root.classList.contains('closed')));
  setOpen(!isNarrow());
  window.addEventListener('resize', () => {
    if (root.dataset.userToggled === '1') return;
    setOpen(!isNarrow());
  });
  toggleEl?.addEventListener('click', () => { root.dataset.userToggled = '1'; });
  applyFilter();

  /* ---------------- 小地图 ---------------- */
  const ctx = canvas.getContext('2d');
  const BOUNDS = (() => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const it of items) {
      x0 = Math.min(x0, it.x - it.w / 2); x1 = Math.max(x1, it.x + it.w / 2);
      z0 = Math.min(z0, it.z - it.d / 2); z1 = Math.max(z1, it.z + it.d / 2);
    }
    const pad = 34;
    return { x0: x0 - pad, x1: x1 + pad, z0: z0 - pad, z1: z1 + pad };
  })();

  let lastDraw = 0;
  let drawCount = 0;
  let sizeCache = { w: 0, h: 0, at: 0 };
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  function fit() {
    const now = performance.now();
    if (!sizeCache.w || now - sizeCache.at > 500) {
      const rect = canvas.getBoundingClientRect();
      sizeCache = { w: rect.width || 0, h: rect.height || 0, at: now };
    }
    // 面板被隐藏（clean / anim / flow 或外部 display:none）时不绘制，也避免每帧强制 layout
    if (!sizeCache.w || !sizeCache.h) return null;
    const w = Math.max(1, Math.round(sizeCache.w * dpr));
    const h = Math.max(1, Math.round(sizeCache.h * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return { w, h };
  }

  function project(x, z, w, h) {
    const s = Math.min(w / (BOUNDS.x1 - BOUNDS.x0), h / (BOUNDS.z1 - BOUNDS.z0));
    const ox = (w - (BOUNDS.x1 - BOUNDS.x0) * s) / 2;
    const oz = (h - (BOUNDS.z1 - BOUNDS.z0) * s) / 2;
    return [ox + (x - BOUNDS.x0) * s, oz + (z - BOUNDS.z0) * s, s];
  }

  function draw(now) {
    if (!mmWrap || mmWrap.hidden) return;
    const sz = fit();
    if (!sz) return;
    const { w, h } = sz;
    const [cx, cz, s] = project(0, 0, w, h);
    ctx.clearRect(0, 0, w, h);

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, 'rgba(8,18,28,0.86)');
    bg.addColorStop(1, 'rgba(4,10,16,0.9)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // 网格
    ctx.strokeStyle = 'rgba(120,190,225,0.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      ctx.beginPath(); ctx.moveTo((w * i) / 6, 0); ctx.lineTo((w * i) / 6, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, (h * i) / 6); ctx.lineTo(w, (h * i) / 6); ctx.stroke();
    }

    // 厂区边界
    const [bx0, bz0] = project(BOUNDS.x0 + 20, BOUNDS.z0 + 20, w, h);
    const [bx1, bz1] = project(BOUNDS.x1 - 20, BOUNDS.z1 - 20, w, h);
    ctx.strokeStyle = 'rgba(120,190,225,0.28)';
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.strokeRect(bx0, bz0, bx1 - bx0, bz1 - bz0);
    ctx.setLineDash([]);

    // 设备 footprint
    for (const it of items) {
      const [px, pz] = project(it.x - it.w / 2, it.z - it.d / 2, w, h);
      const rw = Math.max(1.5, it.w * s);
      const rh = Math.max(1.5, it.d * s);
      const on = it.id === selectedId;
      ctx.fillStyle = on ? hex(it.color) : `rgba(${(it.color >> 16) & 255},${(it.color >> 8) & 255},${it.color & 255},0.34)`;
      ctx.fillRect(px, pz, rw, rh);
      if (on) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.4 * dpr;
        ctx.strokeRect(px - 1, pz - 1, rw + 2, rh + 2);
      }
    }

    // 相机位置与朝向
    const dir = camera.getWorldDirection(new (camera.position.constructor)());
    const [cxp, czp] = project(camera.position.x, camera.position.z, w, h);
    const ang = Math.atan2(dir.x, dir.z);
    const r = 13 * dpr;
    ctx.save();
    ctx.translate(cxp, czp);
    ctx.rotate(-ang);
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.52, r * 0.62);
    ctx.lineTo(0, r * 0.26);
    ctx.lineTo(-r * 0.52, r * 0.62);
    ctx.closePath();
    ctx.fillStyle = 'rgba(95,208,255,0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(220,245,255,0.9)';
    ctx.lineWidth = 1 * dpr;
    ctx.stroke();
    ctx.restore();

    // 相机注视点
    if (controls?.target) {
      const [tx, tz] = project(controls.target.x, controls.target.z, w, h);
      ctx.beginPath();
      ctx.arc(tx, tz, 2.4 * dpr, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1 * dpr;
      ctx.stroke();
    }

    // 指北
    ctx.fillStyle = 'rgba(160,196,216,0.75)';
    ctx.font = `${9 * dpr}px "SF Mono", Menlo, monospace`;
    ctx.fillText('N', w - 14 * dpr, 13 * dpr);
    drawCount++;
  }

  function hiddenByMode() {
    const c = document.body.classList;
    return isClean || c.contains('tour') || c.contains('anim') || c.contains('flow');
  }

  function update(dt) {
    if (hiddenByMode()) return;
    const now = performance.now();
    if (now - lastDraw < 50) return; // 20Hz → 端到端延迟 < 100ms
    lastDraw = now;
    const st = interact.state ? interact.state() : null;
    if (st && st.selected !== selectedId) setSelected(st.selected);
    draw(now);
  }

  // 首帧先画一次，避免空窗
  requestAnimationFrame(() => { setSelected((interact.state?.() || {}).selected || null); draw(performance.now()); });

  function search(q) {
    query = String(q ?? '');
    if (searchEl) searchEl.value = query;
    applyFilter();
    return listEl.querySelectorAll('.xp-row:not([hidden])').length;
  }

  return {
    update,
    refresh: applyFilter,
    search,
    setSelected,
    state: () => ({
      items: items.length,
      groups: groups.map((g) => [g.unit, g.count, g.el.hidden]),
      query,
      visible: !isClean && !root.classList.contains('closed'),
      selected: selectedId,
      visibleRows: listEl.querySelectorAll('.xp-row:not([hidden])').length,
      minimap: { w: canvas.width, h: canvas.height, draws: drawCount },
    }),
  };
}