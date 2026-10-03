import { PART_SIZE, partCount } from './limits';

// Which multipart parts of a file are safely stored. A part only counts if
// it has exactly the size it should, so a truncated part is uploaded again.
export function expectedPartSize(fileSize: number, n: number): number {
  const count = partCount(fileSize);
  return n < count ? PART_SIZE : fileSize - PART_SIZE * (count - 1);
}

export function completeParts<T extends { n: number; size: number }>(fileSize: number, stored: T[]): T[] {
  const count = partCount(fileSize);
  return stored.filter((p) => p.n >= 1 && p.n <= count && p.size === expectedPartSize(fileSize, p.n));
}

export function missingParts(fileSize: number, stored: { n: number; size: number }[]): number[] {
  const have = new Set(completeParts(fileSize, stored).map((p) => p.n));
  return Array.from({ length: partCount(fileSize) }, (_, i) => i + 1).filter((n) => !have.has(n));
}
