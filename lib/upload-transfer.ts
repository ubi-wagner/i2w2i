// Browser-only: one HTTP PUT with progress, stall detection and retries.
//
// Phones are hostile to uploads: switching apps suspends the page, networks
// drop, a request can hang forever without erroring. So:
// - a transfer with no progress for STALL_MS is aborted and retried;
// - coming back to the page "nudges" active transfers: one that hasn't moved
//   in NUDGE_STALL_MS is restarted at once instead of waiting out the timer;
// - while offline we wait for the connection rather than burning retries.

const STALL_MS = 30_000;
const NUDGE_STALL_MS = 5_000;
const BACKOFF = [1000, 2000, 4000, 8000, 15000, 30000];
export const NUDGE_EVENT = 'i2w2i-upload-nudge';

export class StallError extends Error {
  constructor() {
    super('Upload stalled');
  }
}

export class PausedError extends Error {
  constructor(message = 'Paused') {
    super(message);
  }
}

export function put(url: string, body: Blob, type: string | null, onProgress?: (loaded: number) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let last = Date.now();
    let stalled = false;
    const check = (limit: number) => {
      if (Date.now() - last > limit) {
        stalled = true;
        xhr.abort();
      }
    };
    const timer = setInterval(() => check(STALL_MS), 5000);
    const onNudge = () => check(NUDGE_STALL_MS);
    const onAbort = () => xhr.abort();
    window.addEventListener(NUDGE_EVENT, onNudge);
    signal?.addEventListener('abort', onAbort);
    const done = () => {
      clearInterval(timer);
      window.removeEventListener(NUDGE_EVENT, onNudge);
      signal?.removeEventListener('abort', onAbort);
    };
    xhr.open('PUT', url);
    if (type) xhr.setRequestHeader('Content-Type', type);
    xhr.upload.onprogress = (e) => {
      last = Date.now();
      onProgress?.(e.loaded);
    };
    xhr.onload = () => {
      done();
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => {
      done();
      reject(new Error('Connection lost'));
    };
    xhr.onabort = () => {
      done();
      reject(signal?.aborted ? new PausedError('Cancelled') : stalled ? new StallError() : new Error('Interrupted'));
    };
    xhr.send(body);
  });
}

function waitForOnline(signal?: AbortSignal): Promise<void> {
  if (navigator.onLine) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const on = () => {
      window.removeEventListener('online', on);
      resolve();
    };
    window.addEventListener('online', on);
    signal?.addEventListener('abort', () => {
      window.removeEventListener('online', on);
      reject(new PausedError('Cancelled'));
    });
  });
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new PausedError('Cancelled'));
    });
  });

/**
 * Runs `attempt` until it succeeds. Each try gets a fresh URL from `getUrl`
 * (presigned URLs expire, and a retry after an hour in the background needs a
 * new one); `getUrl` returns null when a retry finds the bytes already
 * arrived (the reply was lost, not the upload). After the backoff schedule is
 * used up it gives up with a PausedError, shown as "Paused" with Resume.
 */
export async function withRetries(
  getUrl: (attempt: number) => Promise<string | null>,
  attempt: (url: string) => Promise<void>,
  onRetry?: (n: number, err: Error) => void,
  signal?: AbortSignal,
): Promise<void> {
  for (let n = 0; ; n++) {
    await waitForOnline(signal);
    try {
      const url = await getUrl(n);
      if (url === null) return;
      await attempt(url);
      return;
    } catch (err) {
      if (err instanceof PausedError) throw err;
      if (n >= BACKOFF.length) throw new PausedError('Upload paused. It will continue when the connection is back.');
      onRetry?.(n + 1, err as Error);
      // A stall is usually the page waking up: retry straight away.
      await sleep(err instanceof StallError ? 0 : BACKOFF[n]!, signal);
    }
  }
}
