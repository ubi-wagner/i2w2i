import { describe, expect, it } from 'vitest';
import { PART_SIZE, partCount } from '@/lib/events/limits';
import { completeParts, expectedPartSize, missingParts } from '@/lib/events/parts';

describe('multipart planning', () => {
  const size = PART_SIZE * 3 + 123;
  it('splits a file into full parts plus a remainder', () => {
    expect(partCount(size)).toBe(4);
    expect(expectedPartSize(size, 1)).toBe(PART_SIZE);
    expect(expectedPartSize(size, 4)).toBe(123);
    expect(partCount(PART_SIZE * 2)).toBe(2);
    expect(expectedPartSize(PART_SIZE * 2, 2)).toBe(PART_SIZE);
  });
  it('only trusts parts with exactly the right size', () => {
    const stored = [
      { n: 1, size: PART_SIZE },
      { n: 2, size: PART_SIZE - 1 }, // truncated
      { n: 4, size: 123 },
      { n: 9, size: PART_SIZE }, // out of range
    ];
    expect(completeParts(size, stored).map((p) => p.n)).toEqual([1, 4]);
    expect(missingParts(size, stored)).toEqual([2, 3]);
    expect(missingParts(size, [])).toEqual([1, 2, 3, 4]);
  });
});
