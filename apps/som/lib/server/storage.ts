import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { appendFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetBucketCorsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Object storage: S-O-M's own bucket (its own credentials, never the family
// site's). Dev and CI use a local folder behind /api/storage/local with the
// same signed-URL contract.
//
// Phones upload straight to the bucket with presigned PUTs, and everything
// they upload is already encrypted (lib/crypto.ts), so the bucket only ever
// holds ciphertext. Objects are private; the app hands out short-lived URLs.

const env = process.env;
const BUCKET = env.AWS_S3_BUCKET_NAME || env.AWS_S3_BUCKET || env.BUCKET;

export const storageDriver: 'bucket' | 'local' = env.STORAGE_DRIVER === 'local' || !BUCKET ? 'local' : 'bucket';

// Phones fetch fresh links when one runs out.
export const UPLOAD_URL_TTL = 30 * 60; // seconds
// View URLs are signed as of the start of the current hour and last two, so
// the same photo gets the same URL for an hour and phones can cache it
// instead of re-downloading every thumbnail on each visit.
const VIEW_WINDOW = 60 * 60;
const VIEW_URL_TTL = 2 * VIEW_WINDOW;
function viewWindowStart(): Date {
  const now = Math.floor(Date.now() / 1000);
  return new Date((now - (now % VIEW_WINDOW)) * 1000);
}

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
const LOCAL_DIR = resolve(/*turbopackIgnore: true*/ env.LOCAL_STORAGE_DIR || '/tmp/som-storage');
const localSecret = env.APP_SECRET || 'dev-only-local-storage-secret';

type LocalOp = 'put' | 'get' | 'part';

function localSig(op: LocalOp, key: string, exp: number, extra = ''): string {
  return createHmac('sha256', localSecret).update(`${op}\n${key}\n${exp}\n${extra}`).digest('base64url');
}

function localUrl(op: LocalOp, key: string, ttl: number, contentType?: string, part?: { uploadId: string; n: number }, from?: Date, version?: string): string {
  const exp = Math.floor((from?.getTime() ?? Date.now()) / 1000) + ttl;
  const extra = part ? `${part.uploadId}:${part.n}` : version ? `v:${version}` : '';
  const q = new URLSearchParams({ op, key, exp: String(exp), sig: localSig(op, key, exp, extra) });
  if (version) q.set('v', version);
  if (contentType) q.set('ct', contentType);
  if (part) {
    q.set('uid', part.uploadId);
    q.set('n', String(part.n));
  }
  return `/api/storage/local?${q}`;
}

/** Validates a local signed URL's query. Returns the key (and part), or null. */
export function verifyLocal(op: LocalOp, q: URLSearchParams): string | null {
  const key = q.get('key') ?? '';
  const exp = Number(q.get('exp'));
  const extra = op === 'part' ? `${q.get('uid')}:${q.get('n')}` : q.get('v') ? `v:${q.get('v')}` : '';
  const sig = Buffer.from(q.get('sig') ?? '');
  const want = Buffer.from(localSig(op, key, exp, extra));
  if (q.get('op') !== op || !Number.isFinite(exp) || exp < Date.now() / 1000) return null;
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) return null;
  if (op === 'part' && (!/^[a-f0-9-]{36}$/.test(q.get('uid') ?? '') || !/^\d{1,5}$/.test(q.get('n') ?? ''))) return null;
  return isSafeKey(key) ? key : null;
}

export function localPartPath(key: string, uploadId: string, n: number): string {
  return join(/*turbopackIgnore: true*/ `${localPath(key)}.mp-${uploadId}`, String(n));
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

/** A short-lived URL to fetch an object (ciphertext; the phone decrypts it). */
export async function viewUrl(key: string): Promise<string> {
  const from = viewWindowStart();
  if (storageDriver === 'local') return localUrl('get', key, VIEW_URL_TTL, undefined, undefined, from);
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: VIEW_URL_TTL, signingDate: from });
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

// ── Multipart (resumable) uploads ───────────────────────────────────────────

export interface StoredPart {
  n: number;
  size: number;
  etag: string;
}

export async function startMultipart(key: string, contentType: string): Promise<string> {
  if (storageDriver === 'local') {
    const id = randomUUID();
    await mkdir(/*turbopackIgnore: true*/ `${localPath(key)}.mp-${id}`, { recursive: true });
    await writeFile(/*turbopackIgnore: true*/ `${localPath(key)}.mp-${id}/type`, contentType);
    return id;
  }
  const res = await s3().send(new CreateMultipartUploadCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }));
  if (!res.UploadId) throw new Error('bucket did not start a multipart upload');
  return res.UploadId;
}

/** Presigned PUT URLs for the given 1-based part numbers. */
export async function partUploadUrls(key: string, uploadId: string, parts: number[]): Promise<Record<number, string>> {
  const out: Record<number, string> = {};
  for (const n of parts) {
    out[n] =
      storageDriver === 'local'
        ? localUrl('part', key, UPLOAD_URL_TTL, undefined, { uploadId, n })
        : await getSignedUrl(s3(), new UploadPartCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId, PartNumber: n }), {
            expiresIn: UPLOAD_URL_TTL,
          });
  }
  return out;
}

/** Parts already stored, so an interrupted upload resumes where it stopped. */
export async function listParts(key: string, uploadId: string): Promise<StoredPart[]> {
  if (storageDriver === 'local') {
    const dir = `${localPath(key)}.mp-${uploadId}`;
    const names = await readdir(/*turbopackIgnore: true*/ dir).catch(() => [] as string[]);
    const parts = await Promise.all(
      names.filter((n) => /^\d+$/.test(n)).map(async (n) => ({ n: Number(n), size: (await stat(/*turbopackIgnore: true*/ join(dir, n))).size, etag: n })),
    );
    return parts.sort((a, b) => a.n - b.n);
  }
  const parts: StoredPart[] = [];
  let marker: string | undefined;
  for (;;) {
    const res = await s3().send(new ListPartsCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId, PartNumberMarker: marker }));
    for (const p of res.Parts ?? []) parts.push({ n: p.PartNumber!, size: p.Size ?? 0, etag: p.ETag! });
    if (!res.IsTruncated) break;
    marker = res.NextPartNumberMarker;
  }
  return parts;
}

export async function completeMultipart(key: string, uploadId: string, parts: StoredPart[]): Promise<void> {
  if (storageDriver === 'local') {
    const dir = `${localPath(key)}.mp-${uploadId}`;
    const out = await ensureLocalDir(key);
    await writeFile(/*turbopackIgnore: true*/ out, Buffer.alloc(0));
    for (const p of parts) await appendFile(/*turbopackIgnore: true*/ out, await readFile(/*turbopackIgnore: true*/ join(dir, String(p.n))));
    const type = await readFile(/*turbopackIgnore: true*/ join(dir, 'type'), 'utf8').catch(() => 'application/octet-stream');
    await writeFile(/*turbopackIgnore: true*/ `${out}.type`, type);
    await rm(/*turbopackIgnore: true*/ dir, { recursive: true, force: true });
    return;
  }
  await s3().send(
    new CompleteMultipartUploadCommand({
      Bucket: BUCKET,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts.map((p) => ({ PartNumber: p.n, ETag: p.etag })) },
    }),
  );
}

export async function abortMultipart(key: string, uploadId: string): Promise<void> {
  if (storageDriver === 'local') {
    await rm(/*turbopackIgnore: true*/ `${localPath(key)}.mp-${uploadId}`, { recursive: true, force: true });
    return;
  }
  await s3().send(new AbortMultipartUploadCommand({ Bucket: BUCKET, Key: key, UploadId: uploadId })).catch(() => {});
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
