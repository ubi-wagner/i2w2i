import 'server-only';
import { sql } from './db';
import { abortMultipart, deleteObject } from './storage';

// Removes uploads that were started but never finished, after a grace
// period long enough for a phone to come back and resume (48 hours).
const STALE_AFTER = '48 hours';
const BATCH = 200;

export async function cleanStaleUploads(): Promise<number> {
  const rows = await sql<{ id: string; original_key: string; preview_key: string | null; multipart_id: string | null }[]>`
    SELECT * FROM events.claim_stale_uploads(${STALE_AFTER}::interval, ${BATCH})`;
  for (const r of rows) {
    if (r.multipart_id) await abortMultipart(r.original_key, r.multipart_id).catch(() => {});
    await deleteObject(r.original_key).catch(() => {});
    if (r.preview_key) await deleteObject(r.preview_key).catch(() => {});
  }
  if (rows.length) console.log(`[housekeeping] removed ${rows.length} unfinished uploads`);
  return rows.length;
}

let started = false;

/** Hourly, starting a couple of minutes after boot. Never throws. */
export function startHousekeeping(): void {
  if (started || process.env.HOUSEKEEPING === 'off') return;
  started = true;
  const run = () => cleanStaleUploads().catch((err) => console.error('[housekeeping]', (err as Error).message));
  setTimeout(run, 2 * 60_000).unref?.();
  setInterval(run, 60 * 60_000).unref?.();
}
