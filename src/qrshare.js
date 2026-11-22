/* E5：分享二维码弹层（vendor/qrcode-generator.js，MIT，本地加载不走 CDN）
 * - 打开时按当前分享链接生成二维码（含 ?st= 状态），矩阵尺寸随链接长度自适应
 * - 弹层里带「复制链接」按钮与链接文本；clean 截图模式不创建
 */
export function createQrShare({ getUrl, onCopy, isClean }) {
  const modal = document.getElementById('qr-modal');
  if (!modal || isClean) return { open: () => {}, close: () => {}, state: () => ({ enabled: false }) };

  const canvas = modal.querySelector('#qr-canvas');
  const urlEl = modal.querySelector('#qr-url');
  const copyBtn = modal.querySelector('#qr-copy');
  const closeBtn = modal.querySelector('#qr-close');
  const infoEl = modal.querySelector('#qr-info');
  let state = { enabled: true, open: false, url: '', modules: 0, bytes: 0 };

  function render(url) {
    const lib = typeof window !== 'undefined' ? window.qrcode : null;
    if (!lib || !canvas) return null;
    // typeNumber 0 = 自动选版本；M 级纠错（约 15%）兼顾容量与可扫性
    const qr = lib(0, 'M');
    qr.addData(url);
    qr.make();
    const n = qr.getModuleCount();
    const quiet = 2;
    const cell = Math.max(2, Math.floor(320 / (n + quiet * 2)));
    const px = (n + quiet * 2) * cell;
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = '#0b141c';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
      }
    }
    return { modules: n, px, cell };
  }

  function open() {
    const url = getUrl();
    const r = render(url);
    if (urlEl) urlEl.textContent = url;
    if (infoEl) infoEl.textContent = r ? `版本 ${((r.modules - 17) / 4) | 0} · ${r.modules}×${r.modules} 模块 · ${url.length} 字符` : '二维码库不可用';
    modal.classList.add('show');
    state = { enabled: true, open: true, url, modules: r ? r.modules : 0, bytes: url.length };
    return state;
  }

  function close() {
    modal.classList.remove('show');
    state.open = false;
  }

  closeBtn?.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  copyBtn?.addEventListener('click', () => { onCopy?.(); });
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && state.open) close(); });

  return { open, close, state: () => state, render };
}