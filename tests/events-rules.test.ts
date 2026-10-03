import { describe, expect, it } from 'vitest';
import { cleanName, fileExtension, formatBytes, isValidSlug, slugify, uploadKind, uploadProblem, zipEntryNames } from '@/lib/events/rules';
import { codeHmac, decryptCode, encryptCode, normalizeCode, qrHash, qrToken } from '@/lib/events/codes';

describe('slugify', () => {
  it('makes readable URL slugs', () => {
    expect(slugify("Cassie's Bridal Shower!")).toBe('cassie-s-bridal-shower');
    expect(slugify('  Café   Reunión 2026 ')).toBe('cafe-reunion-2026');
    expect(isValidSlug(slugify("Cassie's Bridal Shower!"))).toBe(true);
  });
  it('rejects bad slugs', () => {
    for (const s of ['', 'a', '-x', 'Has Caps', 'x'.repeat(70)]) expect(isValidSlug(s)).toBe(false);
  });
});

describe('uploads', () => {
  it('classifies by content type', () => {
    expect(uploadKind('image/heic')).toBe('photo');
    expect(uploadKind('video/quicktime')).toBe('video');
    expect(uploadKind('application/pdf')).toBeNull();
  });
  it('picks a safe extension', () => {
    expect(fileExtension('IMG_0001.HEIC', 'image/heic')).toBe('heic');
    expect(fileExtension('clip', 'video/quicktime')).toBe('mov');
    expect(fileExtension('x', 'image/jpeg')).toBe('jpg');
    expect(fileExtension('../../etc/passwd', 'image/png')).toBe('png');
  });
  it('enforces type and the 2 GB cap', () => {
    expect(uploadProblem({ type: 'image/jpeg', size: 10 })).toBeNull();
    expect(uploadProblem({ type: 'text/html', size: 10 })).not.toBeNull();
    expect(uploadProblem({ type: 'video/mp4', size: 3 * 1024 ** 3 })).not.toBeNull();
    expect(uploadProblem({ type: 'video/mp4', size: 0 })).not.toBeNull();
  });
  it('cleans names and formats sizes', () => {
    expect(cleanName('  Aunt   May ')).toBe('Aunt May');
    expect(cleanName('   ')).toBeNull();
    expect(formatBytes(900_000_000)).toBe('858 MB');
  });
});

describe('zip names', () => {
  it('numbers files per person and keeps the stored extension', () => {
    expect(
      zipEntryNames([
        { uploader: 'Gina', filename: 'IMG_1.HEIC', key: 'e/1/preview.jpg', original: false },
        { uploader: 'Gina', filename: 'clip.mov', key: 'e/2/original.mov', original: true },
        { uploader: 'Bea / "B"', filename: 'x', key: 'e/3/original.jpg', original: true },
      ]),
    ).toEqual(['Gina 01.jpg', 'Gina 02.mov', 'Bea  B 01.jpg']);
  });
});

describe('access codes', () => {
  const secret = 's'.repeat(32);
  it('normalizes what people type', () => {
    expect(normalizeCode(' cb-1106 ')).toBe('CB1106');
    expect(normalizeCode('cb')).toBeNull();
  });
  it('hashes codes with the secret, so the same code differs per secret', () => {
    expect(codeHmac('CB1106', secret).equals(codeHmac('CB1106', secret))).toBe(true);
    expect(codeHmac('CB1106', secret).equals(codeHmac('CB1106', 't'.repeat(32)))).toBe(false);
  });
  it('encrypts codes so only the secret can read them back', () => {
    const blob = encryptCode('CB1106', secret);
    expect(blob.includes(Buffer.from('CB1106'))).toBe(false);
    expect(decryptCode(blob, secret)).toBe('CB1106');
    expect(decryptCode(blob, 't'.repeat(32))).toBeNull();
  });
  it('derives stable QR tokens that change with the version', () => {
    const a = qrToken('id-1', 1, secret);
    expect(qrToken('id-1', 1, secret)).toBe(a);
    expect(qrToken('id-1', 2, secret)).not.toBe(a);
    expect(qrHash(a)).toHaveLength(32);
  });
});
