import 'server-only';
import exifr from 'exifr';
import { readHead } from '../storage';

// Camera metadata from a photo original: who-took-what evidence for owners.
// Galleries never show it (they use the stripped preview).

export interface PhotoMeta {
  make?: string;
  model?: string;
  software?: string;
  lens?: string;
  takenAt?: string;
  offset?: string;
  width?: number;
  height?: number;
  gps?: { lat: number; lon: number; altitude?: number };
}

const HEAD_BYTES = 256 * 1024;

export async function readPhotoMeta(key: string): Promise<PhotoMeta | null> {
  const head = await readHead(key, HEAD_BYTES);
  if (!head?.length) return null;
  try {
    const t = await exifr.parse(head, { tiff: true, exif: true, gps: true, ifd1: false, xmp: false, icc: false, iptc: false });
    if (!t) return null;
    const meta: PhotoMeta = {
      make: t.Make,
      model: t.Model,
      software: t.Software,
      lens: t.LensModel,
      takenAt: t.DateTimeOriginal instanceof Date ? t.DateTimeOriginal.toISOString() : undefined,
      offset: t.OffsetTimeOriginal,
      width: t.ExifImageWidth ?? t.ImageWidth,
      height: t.ExifImageHeight ?? t.ImageHeight,
      gps: typeof t.latitude === 'number' && typeof t.longitude === 'number'
        ? { lat: t.latitude, lon: t.longitude, altitude: t.GPSAltitude }
        : undefined,
    };
    return Object.values(meta).some((v) => v !== undefined) ? meta : null;
  } catch {
    return null;
  }
}
