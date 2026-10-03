import { describe, expect, it } from 'vitest';
import { applyFilter, cleanOverlay, filterCss, FRAMES, frameSvg, isPlain, type FrameId } from '@/lib/events/overlay';

describe('overlay manifest', () => {
  it('accepts known frames and filters, trims captions', () => {
    expect(cleanOverlay({ frame: 'polaroid', filter: 'warm', caption: '  So   happy! ' })).toEqual({ v: 1, frame: 'polaroid', filter: 'warm', caption: 'So happy!' });
    expect(cleanOverlay({ frame: 'hearts' })).toEqual({ v: 1, frame: 'hearts', filter: 'none' });
  });
  it('rejects anything unknown', () => {
    expect(cleanOverlay({ frame: '<script>', filter: 'none' })).toBeNull();
    expect(cleanOverlay({ frame: 'none', filter: 'url(evil)' })).toBeNull();
    expect(cleanOverlay('frame')).toBeNull();
  });
  it('knows a plain manifest when it sees one', () => {
    expect(isPlain({ v: 1, frame: 'none', filter: 'none' })).toBe(true);
    expect(isPlain({ v: 1, frame: 'none', filter: 'none', caption: 'x' })).toBe(false);
  });
});

describe('filters', () => {
  it('renders CSS from the same definition', () => {
    expect(filterCss('bw')).toBe('grayscale(1) contrast(1.12)');
    expect(filterCss('none')).toBe('none');
  });
  it('applies the CSS matrices to pixels', () => {
    const red = new Uint8ClampedArray([255, 0, 0, 255]);
    applyFilter(red, 'bw');
    // grayscale(1): 0.2126 * 255 = 54.2, then contrast 1.12 around 127.5 -> 46
    expect(red[0]).toBe(red[1]);
    expect(red[1]).toBe(red[2]);
    expect(Math.abs(red[0]! - 46)).toBeLessThanOrEqual(1);
    expect(red[3]).toBe(255);
    const same = new Uint8ClampedArray([10, 200, 30, 255]);
    applyFilter(same, 'none');
    expect([...same]).toEqual([10, 200, 30, 255]);
  });
});

describe('frames', () => {
  it('draws every frame for portrait and landscape, and nothing for none', () => {
    for (const id of Object.keys(FRAMES) as FrameId[]) {
      for (const [w, h] of [[2048, 1536], [1536, 2048]]) {
        const svg = frameSvg(id, w, h);
        if (id === 'none') expect(svg).toBeNull();
        else expect(svg).toMatch(new RegExp(`^<svg[^>]+viewBox="0 0 ${w} ${h}"`));
      }
    }
  });
});
