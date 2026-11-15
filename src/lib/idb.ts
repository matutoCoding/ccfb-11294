/** 轻量 IndexedDB 封装：单库多表，Promise 化 */

const DB_NAME = 'neon-studio-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('orders')) db.createObjectStore('orders', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  return tx<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
}

export async function idbGetAll<T>(store: string): Promise<T[]> {
  return tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
}

export async function idbPut<T>(store: string, value: T, key?: string): Promise<void> {
  await tx(store, 'readwrite', (s) => (key ? s.put(value, key) : s.put(value)) as IDBRequest<IDBValidKey>);
}

export async function idbDelete(store: string, key: string): Promise<void> {
  await tx(store, 'readwrite', (s) => s.delete(key) as IDBRequest<undefined>);
}

export async function idbClear(store: string): Promise<void> {
  await tx(store, 'readwrite', (s) => s.clear() as IDBRequest<undefined>);
}
