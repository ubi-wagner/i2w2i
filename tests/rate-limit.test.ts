import { describe, expect, it } from 'vitest';
import { rateLimit, recordFailure, tooManyFailures } from '@/lib/rate-limit';

describe('rate limits', () => {
  it('counts every call for rateLimit', () => {
    const k = `t-${Math.random()}`;
    expect([1, 2, 3].map(() => rateLimit(k, 2, 60_000))).toEqual([true, true, false]);
  });
  it('only counts failures for guessing protection', () => {
    const k = `f-${Math.random()}`;
    for (let i = 0; i < 100; i++) expect(tooManyFailures(k, 3, 60_000)).toBe(false); // successes don't count
    recordFailure(k, 60_000);
    recordFailure(k, 60_000);
    expect(tooManyFailures(k, 3, 60_000)).toBe(false);
    recordFailure(k, 60_000);
    expect(tooManyFailures(k, 3, 60_000)).toBe(true);
  });
});
