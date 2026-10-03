import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

// Event access credentials. A typed code ("CB1106") and a QR token both
// resolve to one events.access_codes row; neither is stored in the clear.
//
// - Typed codes are short, so they're keyed with APP_SECRET (HMAC): a copy
//   of the database alone can't be used to guess them. Attempts are rate
//   limited where they're checked.
// - QR tokens are derived from APP_SECRET + row id + version, so a card can
//   be re-rendered any time; bumping the version reissues it.

export function appSecret(env: Record<string, string | undefined> = process.env): string {
  const s = env.APP_SECRET;
  if (s && s.length >= 32) return s;
  if (env.NODE_ENV === 'production') throw new Error('APP_SECRET must be set (32+ characters)');
  return 'dev-only-app-secret-not-for-production';
}

/** Uppercase letters and digits only, so "cb-1106" and "CB1106" match. */
export function normalizeCode(raw: string): string | null {
  const c = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length >= 4 && c.length <= 20 ? c : null;
}

export function codeHmac(normalized: string, secret = appSecret()): Buffer {
  return createHmac('sha256', secret).update(`event-code:${normalized}`).digest();
}

export function qrToken(accessCodeId: string, version: number, secret = appSecret()): string {
  return createHmac('sha256', secret).update(`event-qr:${accessCodeId}:${version}`).digest('base64url');
}

export function qrHash(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

function encKey(secret: string): Buffer {
  return createHash('sha256').update(`event-code-enc:${secret}`).digest();
}

/** AES-256-GCM: 12-byte nonce + 16-byte tag + ciphertext. */
export function encryptCode(normalized: string, secret = appSecret()): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', encKey(secret), iv);
  const body = Buffer.concat([c.update(normalized, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]);
}

export function decryptCode(blob: Buffer | null, secret = appSecret()): string | null {
  if (!blob || blob.length < 29) return null;
  try {
    const d = createDecipheriv('aes-256-gcm', encKey(secret), blob.subarray(0, 12));
    d.setAuthTag(blob.subarray(12, 28));
    return Buffer.concat([d.update(blob.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}
