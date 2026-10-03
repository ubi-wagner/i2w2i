import { ALLOWED_TYPES, MAX_UPLOAD_BYTES } from './limits';

// Pure helpers for the Events app; no I/O.

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['‘’`]/g, '') // Cassie's → cassies, not cassie-s
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,60}$/.test(slug);
}

export function uploadKind(contentType: string): 'photo' | 'video' | null {
  if (contentType.startsWith('image/')) return 'photo';
  if (contentType.startsWith('video/')) return 'video';
  return null;
}

/** Extension for the stored key, from the filename or content type. Never trusted for anything else. */
export function fileExtension(filename: string, contentType: string): string {
  const fromName = /\.([a-z0-9]{1,5})$/i.exec(filename)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  const fromType = /^[a-z]+\/([a-z0-9.+-]+)$/i.exec(contentType)?.[1]?.toLowerCase() ?? 'bin';
  return ({ jpeg: 'jpg', quicktime: 'mov', 'svg+xml': 'svg' } as Record<string, string>)[fromType] ?? fromType.replace(/[^a-z0-9]/g, '').slice(0, 5);
}

export function uploadProblem(file: { type: string; size: number }): string | null {
  if (!ALLOWED_TYPES.test(file.type)) return 'Only photos and videos can be added.';
  if (!(file.size > 0)) return 'That file is empty.';
  if (file.size > MAX_UPLOAD_BYTES) return 'That file is larger than 2 GB.';
  return null;
}

export function cleanName(raw: string): string | null {
  const n = raw.replace(/\s+/g, ' ').trim().slice(0, 60);
  return n.length ? n : null;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** Readable, unique file names for a zip: "Gina 01.jpg", "Gina 02.mov", ... */
export function zipEntryNames(items: { uploader: string; filename: string; key: string; original: boolean }[]): string[] {
  const counts = new Map<string, number>();
  return items.map((it) => {
    const who = it.uploader.replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 40) || 'Guest';
    const n = (counts.get(who) ?? 0) + 1;
    counts.set(who, n);
    const ext = /\.([a-z0-9]{1,5})$/i.exec(it.key)?.[1]?.toLowerCase() ?? 'bin';
    return `${who} ${String(n).padStart(2, '0')}.${ext}`;
  });
}
