import { describe, expect, it } from 'vitest';
import { dottedDate, isTheme, splitNames } from '../lib/events/themes';

describe('themes', () => {
  it('knows its themes', () => {
    expect(isTheme('woodland')).toBe(true);
    expect(isTheme('neon')).toBe(false);
    expect(isTheme(undefined)).toBe(false);
  });
  it('splits couple names around & or and', () => {
    expect(splitNames('Cassie & Jordan’s Wedding')).toEqual({ before: 'Cassie', joiner: '&', after: 'Jordan’s Wedding' });
    expect(splitNames('Cassie and Jordan')).toEqual({ before: 'Cassie', joiner: 'and', after: 'Jordan' });
    expect(splitNames('Cassie’s Bridal Shower')).toBeNull();
    expect(splitNames('& Jordan')).toBeNull();
  });
  it('writes dates the invitation way', () => {
    expect(dottedDate(new Date('2026-10-17T00:00:00Z'))).toBe('10 · 17 · 26');
  });
});
