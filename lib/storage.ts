import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, open, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  DeleteObjectCommand,
  GetBucketCorsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Object storage. Production uses the Railway bucket; dev and CI use a local
// folder behind /api/storage/local, with the same signed-URL contract, so the
// upload flow is exercised end to end without a bucket.
//
// Phones upload straight to the bucket with a presigned PUT; bytes never pass
// through this server. Objects are private; pages hand out short-lived GET URLs.

const env = process.env;
const BUCKET = env.AWS_S3_BUCKET_NAME || env.AWS_S3_BUCKET || env.BUCKET;

export const storageDriver: 'bucket' | 'local' = env.STORAGE_DRIVER === 'local' || !BUCKET ? 'local' : 'bucket';

const UPLOAD_URL_TTL = 60 * 60; // seconds
const VIEW_URL_TTL = 60 * 60;

let client: S3Client | undefined;
function s3(): S3Client {
  return (client ??= new S3Client({
    region: env.AWS_REGION || env.AWS_DEFAULT_REGION || env.REGION || 'auto',
    endpoint: env.AWS_ENDPOINT_URL || env.ENDPOINT,
    forcePathStyle: env.STORAGE_FORCE_PATH_STYLE === 'true',
    credentials: {
      accessKeyId: (env.AWS_ACCESS_KEY_ID || env.ACCESS_KEY_ID)!,
      secretAccessKey: (env.AWS_SECRET_ACCESS_KEY || env.SECRET_ACCESS_KEY)!,
    },
    // The SDK otherwise adds x-amz-checksum headers that a browser PUT to a
    // presigned URL can't reproduce.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  }));
}

// ── Local driver ────────────────────────────────────────────────────────────
const LOCAL_DIR = resolve(/*turbopackIgnore: true*/ env.LOCAL_STORAGE_DIR || '/tmp/i2w2i-storage');
const localSecret = env.APP_SECRET || 'dev-only-local-storage-secret';

function localSig(op: 'put' | 'get', key: string, exp: number): string {
  return createHmac('sha256', localSecret).update(`${op}\n${key}\n${exp}`).digest('base64url');
}

function localUrl(op: 'put' | 'get', key: string, ttl: number, contentType?: string): string {
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const q = new URLSearchParams({ op, key, exp: String(exp), sig: localSig(op, key, exp) });
  if (contentType) q.set('ct', contentType);
  return `/api/storage/local?${q}`;
}

/** Validates a local signed URL's query. Returns the key, or null. */
export function verifyLocal(op: 'put' | 'get', q: URLSearchParams): string | null {
  const key = q.get('key') ?? '';
  const exp = Number(q.get('exp'));
  const sig = Buffer.from(q.get('sig') ?? '');
  const want = Buffer.from(localSig(op, key, exp));
  if (q.get('op') !== op || !Number.isFinite(exp) || exp < Date.now() / 1000) return null;
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) return null;
  return isSafeKey(key) ? key : null;
}

export function localPath(key: string): string {
  return join(/*turbopackIgnore: true*/ LOCAL_DIR, key);
}

export async function ensureLocalDir(key: string): Promise<string> {
  const p = localPath(key);
  await mkdir(dirname(p), { recursive: true });
  return p;
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Keys we generate are [a-z0-9/-._]; reject anything else outright. */
export function isSafeKey(key: string): boolean {
  return /^[a-z0-9][a-z0-9/_.-]{0,400}$/i.test(key) && !key.includes('..') && !key.includes('//');
}

/** A URL the browser can PUT the file to. It must send the same Content-Type. */
export async function uploadUrl(key: string, contentType: string): Promise<string> {
  if (storageDriver === 'local') return localUrl('put', key, UPLOAD_URL_TTL, contentType);
  return getSignedUrl(s3(), new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }), {
    expiresIn: UPLOAD_URL_TTL,
  });
}

/** A short-lived URL to view or download an object. */
export async function viewUrl(key: string, downloadName?: string): Promise<string> {
  if (storageDriver === 'local') return localUrl('get', key, VIEW_URL_TTL);
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ResponseContentDisposition: downloadName ? `attachment; filename="${downloadName.replace(/["\\\r\n]/g, '_')}"` : undefined,
    }),
    { expiresIn: VIEW_URL_TTL },
  );
}

/** Size in bytes, or null if the object doesn't exist. */
export async function objectSize(key: string): Promise<number | null> {
  if (storageDriver === 'local') {
    try {
      return (await stat(/*turbopackIgnore: true*/ localPath(key))).size;
    } catch {
      return null;
    }
  }
  try {
    const head = await s3().send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return head.ContentLength ?? 0;
  } catch (err) {
    if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

/** The first `bytes` of an object (for reading photo metadata), or null. */
export async function readHead(key: string, bytes: number): Promise<Buffer | null> {
  try {
    if (storageDriver === 'local') {
      const fh = await open(/*turbopackIgnore: true*/ localPath(key), 'r');
      try {
        const buf = Buffer.alloc(bytes);
        const { bytesRead } = await fh.read(buf, 0, bytes, 0);
        return buf.subarray(0, bytesRead);
      } finally {
        await fh.close();
      }
    }
    const res = await s3().send(new GetObjectCommand({ Bucket: BUCKET, Key: key, Range: `bytes=0-${bytes - 1}` }));
    return Buffer.from(await res.Body!.transformToByteArray());
  } catch {
    return null;
  }
}

export async function deleteObject(key: string): Promise<void> {
  if (storageDriver === 'local') {
    await rm(localPath(key), { force: true });
    await rm(`${localPath(key)}.type`, { force: true });
    return;
  }
  await s3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/**
 * Browsers can only PUT to the bucket if its CORS rules allow our origin.
 * Applied at server start (instrumentation.ts) so it can't drift.
 */
export async function ensureBucketCors(): Promise<void> {
  if (storageDriver === 'local') return;
  const appUrl = env.APP_URL;
  if (!appUrl) return;
  const origin = new URL(appUrl).origin;
  const origins = [origin];
  const host = new URL(appUrl).hostname;
  if (!host.startsWith('www.')) origins.push(origin.replace('://', '://www.'));
  try {
    await s3().send(
      new PutBucketCorsCommand({
        Bucket: BUCKET,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: origins,
              AllowedMethods: ['PUT', 'GET', 'HEAD'],
              AllowedHeaders: ['*'],
              ExposeHeaders: ['ETag'],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      }),
    );
    const got = await s3().send(new GetBucketCorsCommand({ Bucket: BUCKET }));
    const ok = got.CORSRules?.some((r) => r.AllowedMethods?.includes('PUT') && r.AllowedOrigins?.includes(origin));
    console.log(ok ? `[storage] bucket CORS allows uploads from ${origins.join(', ')}` : '[storage] WARNING: bucket CORS did not take; phone uploads will fail');
  } catch (err) {
    console.error('[storage] WARNING: could not set bucket CORS; phone uploads will fail:', (err as Error).message);
  }
}
