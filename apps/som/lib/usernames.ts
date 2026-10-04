// Usernames: 2–32 of a–z, 0–9, . _ -, starting with a letter or digit. Case doesn't matter. Pure.
export const USERNAME_PATTERN = '[a-z0-9][a-z0-9._\\-]{1,31}';

export function normalizeUsername(raw: string): string | null {
  const u = raw.trim().toLowerCase();
  return new RegExp(`^${USERNAME_PATTERN}$`).test(u) ? u : null;
}

/** A username to suggest from a name: "Captain Kay" → "captain.kay". */
export function usernameFromName(name: string): string {
  const u = name
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 32)
    .replace(/\.+$/, '');
  return u.length >= 2 ? u : '';
}

/** Only allow redirects back into this site. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  return next;
}
