import 'server-only';
import type { ClientInfo } from '../client-info';
import { describeDevice } from '../device';
import type { Tx } from './db';
import type { PhotoMeta } from './exif';

// Turns events.activity rows into what an owner needs when something goes
// wrong: who, from which device and network, and what else that device did.

export interface ActivityRow {
  id: number;
  action: string;
  user_id: string | null;
  guest_id: string | null;
  upload_id: string | null;
  actor_name: string | null;
  device_id: string | null;
  ip: string | null;
  user_agent: string | null;
  client: ClientInfo | null;
  request: Record<string, string> | null;
  detail: Record<string, unknown>;
  created_at: Date;
}

export interface Detail {
  label: string;
  value: string;
  href?: string;
}

export function shortDevice(id: string | null): string {
  return id ? id.slice(0, 8) : 'unknown';
}

export async function eventActivity(tx: Tx, eventId: string, limit = 2000): Promise<ActivityRow[]> {
  return tx<ActivityRow[]>`SELECT * FROM events.activity WHERE event_id = ${eventId} ORDER BY id DESC LIMIT ${limit}`;
}

/** Names each device has used on this event, for spotting one phone behind several names. */
export function namesByDevice(rows: ActivityRow[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.device_id || !r.actor_name) continue;
    if (!m.has(r.device_id)) m.set(r.device_id, new Set());
    m.get(r.device_id)!.add(r.actor_name);
  }
  return m;
}

function clientSummary(c: ClientInfo | null): string | null {
  if (!c) return null;
  const parts = [
    c.screen && `screen ${c.screen.w}×${c.screen.h}@${c.screen.dpr}x`,
    c.tz,
    c.lang,
    c.connection?.effectiveType && `network ${c.connection.type ?? ''} ${c.connection.effectiveType}`.replace('  ', ' '),
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** Details shown to managers in the lightbox for one upload. */
export function uploadDetails(rows: ActivityRow[], uploadId: string, names: Map<string, Set<string>>): Detail[] {
  const start = rows.find((r) => r.upload_id === uploadId && r.action === 'upload.start');
  const done = rows.find((r) => r.upload_id === uploadId && r.action === 'upload.complete');
  const r = start ?? done;
  if (!r) return [];
  const out: Detail[] = [];
  out.push({ label: 'Device', value: describeDevice(r.user_agent, r.client) });
  out.push({ label: 'Device id', value: shortDevice(r.device_id) });
  const others = r.device_id ? [...(names.get(r.device_id) ?? [])].filter((n) => n !== r.actor_name) : [];
  if (others.length) out.push({ label: 'Same device also used', value: others.join(', ') });
  if (r.ip) out.push({ label: 'IP address', value: r.ip });
  const cs = clientSummary(r.client);
  if (cs) out.push({ label: 'Browser reported', value: cs });
  const d = start?.detail as { filename?: string; lastModified?: string | null } | undefined;
  if (d?.filename) out.push({ label: 'File name', value: d.filename });
  if (d?.lastModified) out.push({ label: 'File date (phone)', value: new Date(d.lastModified).toLocaleString() });
  const photo = (done?.detail as { photo?: PhotoMeta | null } | undefined)?.photo;
  if (photo) {
    const camera = [photo.make, photo.model].filter(Boolean).join(' ');
    if (camera) out.push({ label: 'Camera', value: camera + (photo.software ? ` (${photo.software})` : '') });
    if (photo.takenAt) out.push({ label: 'Taken', value: `${new Date(photo.takenAt).toLocaleString()}${photo.offset ? ` (${photo.offset})` : ''}` });
    if (photo.gps) {
      out.push({
        label: 'Location in photo',
        value: `${photo.gps.lat.toFixed(5)}, ${photo.gps.lon.toFixed(5)}`,
        href: `https://www.openstreetmap.org/?mlat=${photo.gps.lat}&mlon=${photo.gps.lon}#map=17/${photo.gps.lat}/${photo.gps.lon}`,
      });
    }
  }
  out.push({ label: 'Uploaded', value: r.created_at.toLocaleString() });
  return out;
}

const ACTION_LABEL: Record<string, string> = {
  'guest.join': 'joined',
  'guest.code_failed': 'tried a wrong code',
  'guest.qr_failed': 'used an inactive QR',
  'guest.removed': 'removed a guest',
  'album.view': 'opened the album',
  'album.qr_scan': 'scanned a QR',
  'upload.start': 'started an upload',
  'upload.complete': 'uploaded',
  'upload.hide': 'hid an upload',
  'upload.show': 'unhid an upload',
  'upload.feature': 'starred an upload',
  'upload.unfeature': 'unstarred an upload',
  'upload.delete': 'deleted an upload',
  'chat.post': 'posted in chat',
};

export function describeAction(r: ActivityRow): string {
  const base = ACTION_LABEL[r.action] ?? r.action.replace(/[._]/g, ' ');
  if (r.action === 'guest.code_failed' && typeof r.detail.tried === 'string') return `${base} (“${r.detail.tried}”)`;
  if (r.action === 'upload.start' && typeof r.detail.filename === 'string') return `${base}: ${r.detail.filename}`;
  return base;
}
