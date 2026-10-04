import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
process.env.STORAGE_DRIVER = 'local';
process.env.LOCAL_STORAGE_DIR = mkdtempSync(join(tmpdir(), 'storage-test-'));
const storage = await import('@/lib/server/storage');

describe('local storage: finishing a multipart upload', () => {
  it('two completions of the same upload at once give one whole file, and a late one is fine too', async () => {
    const key = 's/scene1/media1';
    const id = await storage.startMultipart(key, 'application/octet-stream');
    const chunks = [Buffer.alloc(300_000, 1), Buffer.alloc(300_000, 2), Buffer.alloc(1234, 3)];
    for (const [i, c] of chunks.entries()) {
      const p = storage.localPartPath(key, id, i + 1);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, c);
    }
    const parts = await storage.listParts(key, id);
    expect(parts.map((p) => p.n)).toEqual([1, 2, 3]);
    await Promise.all([storage.completeMultipart(key, id, parts), storage.completeMultipart(key, id, parts)]);
    expect(readFileSync(storage.localPath(key)).equals(Buffer.concat(chunks))).toBe(true);
    expect(existsSync(`${storage.localPath(key)}.mp-${id}`)).toBe(false);
    await expect(storage.completeMultipart(key, id, parts)).resolves.toBeUndefined();
    expect(readFileSync(storage.localPath(key)).equals(Buffer.concat(chunks))).toBe(true);
  });

  it('a missing part with no finished file is still an error', async () => {
    const key = 's/scene1/media2';
    const id = await storage.startMultipart(key, 'application/octet-stream');
    await expect(storage.completeMultipart(key, id, [{ n: 1, size: 10, etag: '1' }])).rejects.toThrow(/ENOENT/);
    expect(await storage.objectSize(key)).toBeNull();
  });
});
