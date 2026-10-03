import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ensureLocalDir, localPartPath, localPath, objectSize, storageDriver, verifyLocal } from '@/lib/storage';
import { MAX_UPLOAD_BYTES } from '@/lib/events/limits';

// Stand-in for the bucket in dev and CI. Same contract as a presigned URL:
// the signature in the query is the only authority.
export const dynamic = 'force-dynamic';

function disabled() {
  return storageDriver !== 'local' ? new Response('Not found', { status: 404 }) : null;
}

export async function PUT(req: Request) {
  const off = disabled();
  if (off) return off;
  const q = new URL(req.url).searchParams;
  const isPart = q.get('op') === 'part';
  const key = verifyLocal(isPart ? 'part' : 'put', q);
  if (!key || !req.body) return new Response('Forbidden', { status: 403 });
  if (q.get('ct') && req.headers.get('content-type') !== q.get('ct')) return new Response('Content-Type mismatch', { status: 403 });
  let path: string;
  if (isPart) {
    path = localPartPath(key, q.get('uid')!, Number(q.get('n')));
    await mkdir(dirname(path), { recursive: true });
  } else {
    path = await ensureLocalDir(key);
  }
  let bytes = 0;
  const counted = Readable.fromWeb(req.body as never).on('data', (chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > MAX_UPLOAD_BYTES) counted.destroy(new Error('too large'));
  });
  // Write aside and rename on success, so an interrupted transfer never
  // leaves a half-written object or part that looks complete.
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    await pipeline(counted, createWriteStream(tmp));
    await rename(tmp, path);
  } catch {
    await rm(tmp, { force: true });
    return new Response('Upload failed', { status: 400 });
  }
  if (!isPart) await writeFile(`${path}.type`, req.headers.get('content-type') ?? 'application/octet-stream');
  return new Response(null, { status: 200, headers: { ETag: `"${bytes}"` } });
}

export async function GET(req: Request) {
  const off = disabled();
  if (off) return off;
  const key = verifyLocal('get', new URL(req.url).searchParams);
  if (!key) return new Response('Forbidden', { status: 403 });
  const size = await objectSize(key);
  if (size === null) return new Response('Not found', { status: 404 });
  const type = await readFile(`${localPath(key)}.type`, 'utf8').catch(() => 'application/octet-stream');
  return new Response(Readable.toWeb(createReadStream(localPath(key))) as ReadableStream, {
    headers: { 'Content-Type': type, 'Content-Length': String(size), 'Cache-Control': 'private, max-age=3600, immutable' },
  });
}
