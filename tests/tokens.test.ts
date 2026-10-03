import { describe, expect, it } from 'vitest';
import { hashToken, newToken } from '@/lib/auth/tokens';
import { passwordProblem } from '@/lib/auth/password';

describe('tokens', () => {
  it('are URL-safe, long and unique', () => {
    const a = newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken()).not.toBe(a);
  });
  it('hash deterministically to 32 bytes', () => {
    expect(hashToken('x').equals(hashToken('x'))).toBe(true);
    expect(hashToken('x')).toHaveLength(32);
  });
});

describe('passwordProblem', () => {
  it('requires 10+ characters', () => {
    expect(passwordProblem('short')).not.toBeNull();
    expect(passwordProblem('long enough!')).toBeNull();
  });
});
