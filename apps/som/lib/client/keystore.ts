'use client';

// Pod keys live on this device only, in IndexedDB, as non-extractable keys:
// usable for encrypting and decrypting, never readable as bytes.

const DB = 'som';
const STORE = 'keys';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const saveKey = (podId: string, key: CryptoKey) => run('readwrite', (s) => s.put(key, podId)).then(() => undefined);
export const loadKey = (podId: string) => run<CryptoKey | undefined>('readonly', (s) => s.get(podId) as IDBRequest<CryptoKey | undefined>).catch(() => undefined);
export const forgetKeys = () => run('readwrite', (s) => s.clear()).then(() => undefined);
