import { describe, expect, it } from 'vitest';
import {
  b64u, chunkCount, chunkRange, decryptAll, decryptChunk, decryptJson, encryptChunk, encryptJson, encryptedSize, fromB64u,
  importAesKey, makeInvite, newFileKey, newNonce, newPodKeyBytes, openInvite, plainSize, unwrapFileKey, unwrapWithPassphrase,
  wrapFileKey, wrapWithPassphrase,
} from '@/lib/crypto';

const POD = '00000000-0000-4000-8000-000000000001';

describe('base64url', () => {
  it('round-trips bytes, including big ones', () => {
    const bytes = new Uint8Array(100_000).map((_, i) => i % 251);
    expect(fromB64u(b64u(bytes))).toEqual(bytes);
    expect(b64u(new Uint8Array([251, 255]))).toBe('-_8');
  });
});

describe('pod key backup with a vault passphrase', () => {
  it('opens with the right passphrase only', async () => {
    const key = newPodKeyBytes();
    const w = await wrapWithPassphrase(key, 'fireflies in october', POD, 100_000);
    expect(JSON.stringify(w)).not.toContain(b64u(key));
    expect(await unwrapWithPassphrase(w, 'fireflies in october', POD)).toEqual(key);
    await expect(unwrapWithPassphrase(w, 'fireflies in october!', POD)).rejects.toThrow();
  });
  it('is tied to its pod', async () => {
    const w = await wrapWithPassphrase(newPodKeyBytes(), 'pass phrase here', POD, 100_000);
    await expect(unwrapWithPassphrase(w, 'pass phrase here', '00000000-0000-4000-8000-000000000002')).rejects.toThrow();
  });
  it('refuses silly iteration counts from a tampered record', async () => {
    const w = await wrapWithPassphrase(newPodKeyBytes(), 'pass phrase here', POD, 100_000);
    await expect(unwrapWithPassphrase({ ...w, iterations: 1 }, 'pass phrase here', POD)).rejects.toThrow('unknown format');
  });
});

describe('invites', () => {
  it('the secret from the link opens the pod key; nothing else does', async () => {
    const key = newPodKeyBytes();
    const { secret, wrapped } = await makeInvite(key, POD);
    expect(fromB64u(secret)).toHaveLength(16);
    expect(await openInvite(wrapped, secret, POD)).toEqual(key);
    const other = await makeInvite(key, POD);
    await expect(openInvite(wrapped, other.secret, POD)).rejects.toThrow();
  });
});

describe('records', () => {
  it('round-trip JSON, bound to their record', async () => {
    const key = await importAesKey(newPodKeyBytes());
    const value = { title: 'Kitchen', notes: 'Baseboards ✓', n: 3 };
    const ct = await encryptJson(key, value, 'task:1');
    expect(ct).toMatch(/^j1\./);
    expect(ct).not.toContain('Kitchen');
    expect(await decryptJson(key, ct, 'task:1')).toEqual(value);
    await expect(decryptJson(key, ct, 'task:2')).rejects.toThrow();
  });
  it('the same value encrypts differently every time', async () => {
    const key = await importAesKey(newPodKeyBytes());
    expect(await encryptJson(key, 'x', 'c')).not.toBe(await encryptJson(key, 'x', 'c'));
  });
  it('fail with another pod key', async () => {
    const a = await importAesKey(newPodKeyBytes());
    const b = await importAesKey(newPodKeyBytes());
    await expect(decryptJson(b, await encryptJson(a, 1, 'c'), 'c')).rejects.toThrow();
  });
});

describe('files', () => {
  const CHUNK = 1000; // small chunks so tests exercise several

  async function encryptFile(plain: Uint8Array) {
    const fk = await newFileKey();
    const nonce = newNonce();
    const n = chunkCount(plain.length, CHUNK);
    const parts: Uint8Array[] = [];
    for (let i = 0; i < n; i++) {
      parts.push(new Uint8Array(await encryptChunk(fk.key, nonce, i, i === n - 1, plain.slice(i * CHUNK, (i + 1) * CHUNK))));
    }
    const all = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
    let o = 0;
    for (const p of parts) { all.set(p, o); o += p.length; }
    return { fk, nonce, all, n };
  }

  it('encrypt in chunks and decrypt back, with predictable sizes', async () => {
    const plain = new Uint8Array(3500).map((_, i) => (i * 7) % 256);
    const { fk, nonce, all, n } = await encryptFile(plain);
    expect(n).toBe(4);
    expect(all.length).toBe(encryptedSize(plain.length, CHUNK));
    expect(plainSize(all.length, CHUNK)).toBe(plain.length);
    const back = await decryptAll(fk.key, nonce, all.buffer, CHUNK);
    expect(new Uint8Array(await new Blob(back).arrayBuffer())).toEqual(plain);
  });

  it('decrypt any single chunk from its byte range (for streaming)', async () => {
    const plain = new Uint8Array(2500).map((_, i) => i % 256);
    const { fk, nonce, all } = await encryptFile(plain);
    const { start, end } = chunkRange(all.length, 1, CHUNK);
    const one = new Uint8Array(await decryptChunk(fk.key, nonce, 1, false, all.slice(start, end + 1)));
    expect(one).toEqual(plain.slice(1000, 2000));
  });

  it('notice a cut-off file, swapped chunks and flipped bits', async () => {
    const plain = new Uint8Array(2500).map((_, i) => i % 256);
    const { fk, nonce, all } = await encryptFile(plain);
    // Truncated after two whole chunks: the "last" chunk isn't marked last.
    await expect(decryptAll(fk.key, nonce, all.slice(0, 2 * (CHUNK + 16)).buffer, CHUNK)).rejects.toThrow();
    // Chunk 1 decrypted as chunk 0.
    const r1 = chunkRange(all.length, 1, CHUNK);
    await expect(decryptChunk(fk.key, nonce, 0, false, all.slice(r1.start, r1.end + 1))).rejects.toThrow();
    const bad = all.slice();
    bad[10] ^= 1;
    await expect(decryptAll(fk.key, nonce, bad.buffer, CHUNK)).rejects.toThrow();
  });

  it('wrap each file key with the pod key, bound to its media id', async () => {
    const pod = await importAesKey(newPodKeyBytes());
    const fk = await newFileKey();
    const wrapped = await wrapFileKey(pod, fk, 'm1');
    const back = await unwrapFileKey(pod, wrapped, 'm1');
    const nonce = newNonce();
    const ct = await encryptChunk(fk.key, nonce, 0, true, new TextEncoder().encode('hello'));
    expect(new TextDecoder().decode(await decryptChunk(back, nonce, 0, true, ct))).toBe('hello');
    await expect(unwrapFileKey(pod, wrapped, 'm2')).rejects.toThrow();
  });
});
