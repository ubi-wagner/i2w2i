import { describe, expect, it } from 'vitest';
import { passwordProblem } from '@/lib/auth/password';
import { suggestPassword, WORDS } from '@/lib/auth/suggest';

describe('suggestPassword', () => {
  it('uses exactly 256 different words, so one random byte picks one without bias', () => {
    expect(WORDS.length).toBe(256);
    expect(new Set(WORDS).size).toBe(256);
    for (const w of WORDS) expect(w).toMatch(/^[a-z]{3,8}$/);
  });
  it('makes three different words joined by dashes, always long enough', () => {
    for (let i = 0; i < 500; i++) {
      const pw = suggestPassword();
      const parts = pw.split('-');
      expect(parts).toHaveLength(3);
      expect(new Set(parts).size).toBe(3);
      for (const p of parts) expect(WORDS).toContain(p);
      expect(passwordProblem(pw)).toBeNull();
    }
  });
  it('skips repeated words', () => {
    const bytes = [[7, 7, 7], [7, 9, 9], [12, 0, 0]];
    expect(suggestPassword(() => new Uint8Array(bytes.shift()!))).toBe(`${WORDS[7]}-${WORDS[9]}-${WORDS[12]}`);
  });
  it('varies', () => {
    expect(new Set(Array.from({ length: 50 }, () => suggestPassword())).size).toBeGreaterThan(45);
  });
});
