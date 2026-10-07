import { describe, expect, it } from 'vitest';
import { SLIDE_DEFAULTS, advance, cleanSettings, mergeOrder, playOrder, toSlides } from '../lib/events/slideshow';

// A fixed "random" sequence, so shuffles are repeatable.
const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]!; };

describe('slideshow settings', () => {
  it('keeps known values and falls back for the rest', () => {
    expect(cleanSettings({ every: 3, order: 'shuffle', transition: 'none', border: 'wide' })).toEqual({ every: 3, order: 'shuffle', transition: 'none', border: 'wide' });
    expect(cleanSettings({ every: 4, order: 'random', border: 'thin' })).toEqual({ ...SLIDE_DEFAULTS, border: 'thin' });
    expect(cleanSettings(null)).toEqual(SLIDE_DEFAULTS);
    expect(cleanSettings('junk')).toEqual(SLIDE_DEFAULTS);
  });
});

describe('slideshow order', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('plays the album in order and goes round again', () => {
    expect(playOrder(ids, 'order')).toEqual(ids);
    expect(advance(ids, 'b', 'order').next).toBe('c');
    expect(advance(ids, 'd', 'order')).toEqual({ list: ids, next: 'a' });
    expect(advance(ids, 'a', 'order', -1).next).toBe('d');
    expect(advance(ids, null, 'order').next).toBe('a');
    expect(advance([], 'a', 'order').next).toBeNull();
  });

  it('shuffles every photo once per round, and never repeats across rounds', () => {
    const dealt = playOrder(ids, 'shuffle', seq(0.1, 0.7, 0.4));
    expect([...dealt].sort()).toEqual(ids);
    for (let r = 0; r < 50; r++) {
      const last = dealt[dealt.length - 1]!;
      const { list, next } = advance(dealt, last, 'shuffle');
      expect([...list].sort()).toEqual(ids);
      expect(next).not.toBe(last);
    }
  });

  it('a photo that went away is skipped; the next one plays', () => {
    expect(advance(['a', 'c'], 'b', 'order').next).toBe('a');
  });

  it('follows the album in order, and puts new photos next when shuffled', () => {
    expect(mergeOrder(['a', 'b'], ['a', 'x', 'b'], 'order', 'a')).toEqual(['a', 'x', 'b']);
    expect(mergeOrder(['c', 'a', 'b'], ['a', 'b', 'c', 'x'], 'shuffle', 'a')).toEqual(['c', 'a', 'x', 'b']);
    expect(mergeOrder(['c', 'a', 'b'], ['a', 'c'], 'shuffle', 'a')).toEqual(['c', 'a']);
  });
});

describe('what the slideshow shows', () => {
  it('only approved, visible photos, whoever starts it', () => {
    const item = (id: string, over: Partial<{ kind: 'photo' | 'video'; pending: boolean; hidden: boolean }> = {}) =>
      ({ id, src: `/v/${id}`, kind: 'photo' as const, pending: false, hidden: false, ...over });
    expect(toSlides([item('a'), item('b', { pending: true }), item('c', { hidden: true }), item('d', { kind: 'video' }), item('e')]))
      .toEqual([{ id: 'a', src: '/v/a' }, { id: 'e', src: '/v/e' }]);
  });
});
