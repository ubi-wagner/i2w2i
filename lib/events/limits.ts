// Shared by the server and the upload page.
export const MAX_UPLOAD_BYTES = 2 * 1024 ** 3; // 2 GB, per the wedding plan
export const MAX_PREVIEW_BYTES = 8 * 1024 ** 2;
export const PREVIEW_LONG_EDGE = 2048;
export const ALLOWED_TYPES = /^(image|video)\//;
// Files at least this big go up as resumable multipart uploads in parts.
export const MULTIPART_THRESHOLD = 16 * 1024 ** 2;
export const PART_SIZE = 8 * 1024 ** 2;
export function partCount(size: number): number {
  return Math.max(1, Math.ceil(size / PART_SIZE));
}
