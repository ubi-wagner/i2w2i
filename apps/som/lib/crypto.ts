// End-to-end encryption for S-O-M, with the browser's built-in Web Crypto
// (also in Node, for tests). The server only ever stores what these
// functions produce; it never sees a key or a plaintext.
//
// Keys
// - Pod key: one random AES-256-GCM key per couple (pod). Everything the pod
//   writes or uploads is encrypted under it, directly (text) or through a
//   per-file key (photos, video, audio).
// - Each phone keeps the pod key in IndexedDB as a non-extractable key, so
//   day to day nothing has to be typed.
// - Vault passphrase: each member's pod key is also stored on the server
//   wrapped with a key derived from their passphrase (PBKDF2-SHA256), so a
//   new or replacement phone can get it back.
// - Invite secret: a partner joins with a link whose #fragment (never sent
//   to the server) holds 16 random bytes; the pod key is wrapped with a key
//   derived from them (HKDF-SHA256).
//
// Formats are versioned strings so they can change later without guessing.

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const PBKDF2_ITERATIONS = 600_000;
/** Plaintext bytes per encrypted chunk; each chunk is one upload part (S3 parts must be ≥ 5 MiB). */
export const CHUNK_BYTES = 8 * 1024 * 1024;
const TAG_BYTES = 16;

// ── bytes ────────────────────────────────────────────────────────────────────

export function b64u(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64u(s: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('bad base64url');
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(new ArrayBuffer(n)));
}

const aad = (s: string) => enc.encode(s);

// ── keys ─────────────────────────────────────────────────────────────────────

/** A new pod key, as raw bytes (kept only long enough to wrap it). */
export function newPodKeyBytes(): Uint8Array<ArrayBuffer> {
  return randomBytes(32);
}

/** Imports raw key bytes for use. Non-extractable unless asked. */
export function importAesKey(raw: Uint8Array<ArrayBuffer>, extractable = false): Promise<CryptoKey> {
  return subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, extractable, ['encrypt', 'decrypt']);
}

export interface Wrapped {
  v: 1;
  iv: string;
  ct: string;
}

export interface PassphraseWrapped extends Wrapped {
  salt: string;
  iterations: number;
}

async function seal(key: CryptoKey, data: Uint8Array<ArrayBuffer>, context: string): Promise<Wrapped> {
  const iv = randomBytes(12);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(context) }, key, data);
  return { v: 1, iv: b64u(iv), ct: b64u(ct) };
}

async function open(key: CryptoKey, w: Wrapped, context: string): Promise<Uint8Array<ArrayBuffer>> {
  if (w?.v !== 1) throw new Error('unknown format');
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64u(w.iv), additionalData: aad(context) }, key, fromB64u(w.ct));
  return new Uint8Array(pt);
}

async function passphraseKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await subtle.importKey('raw', enc.encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** The pod key, wrapped with a vault passphrase (stored on the server for recovery). */
export async function wrapWithPassphrase(podKey: Uint8Array<ArrayBuffer>, passphrase: string, podId: string, iterations = PBKDF2_ITERATIONS): Promise<PassphraseWrapped> {
  const salt = randomBytes(16);
  const w = await seal(await passphraseKey(passphrase, salt, iterations), podKey, `podkey:${podId}`);
  return { ...w, salt: b64u(salt), iterations };
}

/** Raw pod key from a passphrase backup; throws if the passphrase is wrong. */
export async function unwrapWithPassphrase(w: PassphraseWrapped, passphrase: string, podId: string): Promise<Uint8Array<ArrayBuffer>> {
  if (!Number.isInteger(w?.iterations) || w.iterations < 100_000 || w.iterations > 10_000_000) throw new Error('unknown format');
  return open(await passphraseKey(passphrase, fromB64u(w.salt), w.iterations), w, `podkey:${podId}`);
}

async function inviteKey(secret: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const base = await subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(new ArrayBuffer(0)), info: enc.encode('som-invite-v1') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** A one-time invite: the secret goes in the link's #fragment, the wrapped key on the server. */
export async function makeInvite(podKey: Uint8Array<ArrayBuffer>, podId: string): Promise<{ secret: string; wrapped: Wrapped }> {
  const secret = randomBytes(16);
  return { secret: b64u(secret), wrapped: await seal(await inviteKey(secret), podKey, `invite:${podId}`) };
}

export async function openInvite(w: Wrapped, secret: string, podId: string): Promise<Uint8Array<ArrayBuffer>> {
  return open(await inviteKey(fromB64u(secret)), w, `invite:${podId}`);
}

// ── text and small records ───────────────────────────────────────────────────

/**
 * Encrypts a JSON value under the pod key. `context` names the record it
 * belongs to (e.g. "entry:<id>") and must match on decryption, so a server
 * can't move ciphertext from one record to another.
 */
export async function encryptJson(key: CryptoKey, value: unknown, context: string): Promise<string> {
  const iv = randomBytes(12);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(context) }, key, enc.encode(JSON.stringify(value)));
  return `j1.${b64u(iv)}.${b64u(ct)}`;
}

export async function decryptJson<T = unknown>(key: CryptoKey, payload: string, context: string): Promise<T> {
  const [tag, iv, ct] = payload.split('.');
  if (tag !== 'j1' || !iv || !ct) throw new Error('unknown format');
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64u(iv), additionalData: aad(context) }, key, fromB64u(ct));
  return JSON.parse(dec.decode(pt)) as T;
}

// ── files ────────────────────────────────────────────────────────────────────
//
// Each file gets its own random key, wrapped with the pod key. The file is
// cut into CHUNK_BYTES pieces; chunk i is AES-GCM with IV = 8-byte random
// prefix ‖ i (big-endian), and its additional data says the index and
// whether it's the last chunk, so chunks can't be reordered, dropped or
// truncated without decryption failing.

export interface FileKey {
  key: CryptoKey;
  raw: Uint8Array<ArrayBuffer>;
}

export async function newFileKey(): Promise<FileKey> {
  const raw = randomBytes(32);
  return { raw, key: await importAesKey(raw) };
}

export async function wrapFileKey(podKey: CryptoKey, fk: FileKey, mediaId: string): Promise<string> {
  const w = await seal(podKey, fk.raw, `file:${mediaId}`);
  return `k1.${w.iv}.${w.ct}`;
}

export async function unwrapFileKey(podKey: CryptoKey, wrapped: string, mediaId: string): Promise<CryptoKey> {
  const [tag, iv, ct] = wrapped.split('.');
  if (tag !== 'k1' || !iv || !ct) throw new Error('unknown format');
  return importAesKey(await open(podKey, { v: 1, iv, ct }, `file:${mediaId}`));
}

export function chunkCount(plainBytes: number, chunk = CHUNK_BYTES): number {
  return Math.max(1, Math.ceil(plainBytes / chunk));
}

export function encryptedSize(plainBytes: number, chunk = CHUNK_BYTES): number {
  return plainBytes + chunkCount(plainBytes, chunk) * TAG_BYTES;
}

/** Plaintext size from the stored (encrypted) size. */
export function plainSize(encBytes: number, chunk = CHUNK_BYTES): number {
  const full = chunk + TAG_BYTES;
  const n = Math.max(1, Math.ceil(encBytes / full));
  return encBytes - n * TAG_BYTES;
}

function chunkIv(prefix: Uint8Array, index: number): Uint8Array<ArrayBuffer> {
  const iv = new Uint8Array(new ArrayBuffer(12));
  iv.set(prefix.subarray(0, 8), 0);
  new DataView(iv.buffer).setUint32(8, index);
  return iv;
}

export function newNonce(): string {
  return b64u(randomBytes(8));
}

export async function encryptChunk(key: CryptoKey, nonce: string, index: number, last: boolean, plain: BufferSource): Promise<ArrayBuffer> {
  return subtle.encrypt({ name: 'AES-GCM', iv: chunkIv(fromB64u(nonce), index), additionalData: aad(`chunk:${index}:${last ? 1 : 0}`) }, key, plain);
}

export async function decryptChunk(key: CryptoKey, nonce: string, index: number, last: boolean, cipher: BufferSource): Promise<ArrayBuffer> {
  return subtle.decrypt({ name: 'AES-GCM', iv: chunkIv(fromB64u(nonce), index), additionalData: aad(`chunk:${index}:${last ? 1 : 0}`) }, key, cipher);
}

/** The byte range of encrypted chunk `index` within the stored object. */
export function chunkRange(encBytes: number, index: number, chunk = CHUNK_BYTES): { start: number; end: number } {
  const full = chunk + TAG_BYTES;
  const start = index * full;
  return { start, end: Math.min(start + full, encBytes) - 1 };
}

/** Decrypts a whole stored object (all chunks, in order). */
export async function decryptAll(key: CryptoKey, nonce: string, cipher: ArrayBuffer, chunk = CHUNK_BYTES): Promise<Uint8Array<ArrayBuffer>[]> {
  const n = Math.max(1, Math.ceil(cipher.byteLength / (chunk + TAG_BYTES)));
  const out: Uint8Array<ArrayBuffer>[] = [];
  for (let i = 0; i < n; i++) {
    const { start, end } = chunkRange(cipher.byteLength, i, chunk);
    out.push(new Uint8Array(await decryptChunk(key, nonce, i, i === n - 1, cipher.slice(start, end + 1))));
  }
  return out;
}
