/* IndexedDB 快照缓存（E1）：把 baked.bin.gz 解压后的 ArrayBuffer 存在本地
 * - key = `gz 路径|v=版本`（版本取 BAKED_META.bytes，重建快照即自动失效）
 * - 任何一步失败（隐私模式 / 配额 / 无 IndexedDB）都静默回退到网络
 * - 命中时跳过全部网络请求，冷启动只需读本地库
 */
const DB_NAME = 'refinery3d';
const DB_VERSION = 1;
const STORE = 'snapshots';

export const idbSupported = typeof indexedDB !== 'undefined' && !!indexedDB;

let dbPromise = null;
function openDb() {
  if (!idbSupported) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

export async function idbGet(key) {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function idbSet(key, value) {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function idbDel(key) {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/** 只保留当前版本的快照，清掉旧版本（避免配额越占越大） */
export async function idbPrune(prefix, keepKey) {
  const db = await openDb();
  if (!db) return 0;
  return new Promise((resolve) => {
    let removed = 0;
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const r = store.openKeyCursor();
      r.onsuccess = () => {
        const cur = r.result;
        if (!cur) return;
        if (String(cur.key).startsWith(prefix) && cur.key !== keepKey) {
          store.delete(cur.key);
          removed++;
        }
        cur.continue();
      };
      tx.oncomplete = () => resolve(removed);
      tx.onerror = () => resolve(removed);
    } catch {
      resolve(0);
    }
  });
}