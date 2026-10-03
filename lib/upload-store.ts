// Browser-only: the upload queue, persisted in IndexedDB so uploads survive
// switching apps, a reload, or the phone discarding the tab. The File itself
// is stored when the browser allows it; if it can't be (quota, private
// mode), the record is kept without it and the person is asked to pick the
// same file again, which resumes from the parts already uploaded.

export interface StoredUpload {
  key: string;
  slug: string;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  createdAt: number;
  serverId?: string;
  mode?: 'single' | 'multipart';
  partCount?: number;
  file?: File;
}

const DB = 'i2w2i-uploads';
const STORE = 'uploads';

let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('no IndexedDB'));
  return (dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'key' });
      store.createIndex('slug', 'slug');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbp = null;
      reject(req.error);
    };
  }));
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(req.result);
        t.onerror = () => reject(t.error ?? req.error);
        t.onabort = () => reject(t.error ?? req.error);
      }),
  );
}

/** Saves a record, with its file if possible. Returns whether the file was kept. */
export async function saveUpload(rec: StoredUpload): Promise<boolean> {
  try {
    await tx('readwrite', (s) => s.put(rec));
    return Boolean(rec.file);
  } catch {
    try {
      const { file: _drop, ...rest } = rec;
      await tx('readwrite', (s) => s.put(rest));
    } catch {
      /* storage unavailable: uploads still work, just without resume after reload */
    }
    return false;
  }
}

export async function patchUpload(key: string, patch: Partial<StoredUpload>): Promise<void> {
  try {
    const cur = await tx<StoredUpload | undefined>('readonly', (s) => s.get(key) as IDBRequest<StoredUpload | undefined>);
    if (cur) await tx('readwrite', (s) => s.put({ ...cur, ...patch }));
  } catch {
    /* best effort */
  }
}

export async function removeUpload(key: string): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(key));
  } catch {
    /* best effort */
  }
}

export async function listUploads(slug: string): Promise<StoredUpload[]> {
  try {
    const all = await tx<StoredUpload[]>('readonly', (s) => s.index('slug').getAll(slug) as IDBRequest<StoredUpload[]>);
    return all.sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}
