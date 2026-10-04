import 'server-only';
import { sql } from './db';
import { podRole } from './pods';

export const MAX_MEDIA_BYTES = 4 * 1024 ** 3; // per file, encrypted
export const TAG_BYTES = 16;

export const partCount = (bytes: number, chunk: number) => Math.max(1, Math.ceil(bytes / (chunk + TAG_BYTES)));

export interface MediaRow {
  id: string;
  scene_id: string;
  pod_id: string;
  uploader_id: string;
  object_key: string;
  thumb_key: string | null;
  bytes: string;
  thumb_bytes: number | null;
  chunk_bytes: number;
  upload_id: string | null;
  status: 'uploading' | 'ready';
}

/** The media row if this account is in its pod. */
export async function mediaFor(accountId: string, id: string): Promise<MediaRow | null> {
  const [m] = await sql<MediaRow[]>`
    SELECT m.id, m.scene_id, s.pod_id, m.uploader_id, m.object_key, m.thumb_key, m.bytes, m.thumb_bytes, m.chunk_bytes, m.upload_id, m.status
      FROM som.media m JOIN som.scenes s ON s.id = m.scene_id WHERE m.id = ${id}`;
  if (!m) return null;
  return (await podRole(accountId, m.pod_id)) ? m : null;
}
