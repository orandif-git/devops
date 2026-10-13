/** A small key-value cache in IndexedDB. Every call fails soft (private windows, blocked storage): the planner then simply reads everything again. */
const DB = "resource-planner", STORE = "kv";

function open(): Promise<IDBDatabase | undefined> {
  return new Promise(resolve => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
      req.onblocked = () => resolve(undefined);
    } catch { resolve(undefined); }
  });
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  const db = await open();
  if (!db) return undefined;
  return new Promise(resolve => {
    try { const r = db.transaction(STORE).objectStore(STORE).get(key); r.onsuccess = () => resolve(r.result as T | undefined); r.onerror = () => resolve(undefined); } catch { resolve(undefined); }
  });
}

export async function cacheSet(key: string, value: unknown): Promise<void> {
  const db = await open();
  if (!db) return;
  await new Promise<void>(resolve => {
    try { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).put(value, key); tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); tx.onabort = () => resolve(); } catch { resolve(); }
  });
}
