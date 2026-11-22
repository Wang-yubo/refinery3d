/* E 批 Service Worker：应用壳 + 同源静态资源缓存
 * - 策略：导航（HTML）与 /src 代码走 network-first（在线取新、离线回退缓存），
 *   其余静态资源 cache-first —— 避免「旧 index.html 配新 main.js」这类缓存错配。
 * - 版本号管理：改 VERSION 即换新缓存，activate 时清理旧缓存。
 * - skipWaiting / clients.claim：新版本可立即接管，配合页面的「有新版本」提示。
 * - 只在同源 GET 上生效；/diag/ 与 ?sw=0 相关请求不动。
 */
const VERSION = '2026-11-22-ui3';
const CACHE = `refinery3d-${VERSION}`;
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

const put = (req, res) => {
  if (res && res.ok && res.type === 'basic') {
    caches.open(CACHE).then((c) => c.put(req, res.clone())).catch(() => {});
  }
};

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
  if (e.data === 'VERSION') e.source?.postMessage({ type: 'VERSION', version: VERSION });
});

const networkFirst = async (req) => {
  try {
    const res = await fetch(req);
    put(req, res);
    return res;
  } catch (err) {
    const hit = await caches.match(req);
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const idx = await caches.match('./index.html');
      if (idx) return idx;
    }
    return new Response('', { status: 504, statusText: 'offline' });
  }
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/diag/')) return;

  const isCode =
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.webmanifest') ||
    url.pathname.endsWith('/');

  if (req.mode === 'navigate' || isCode) {
    e.respondWith(networkFirst(req));
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        put(req, res);
        return res;
      });
    })
  );
});