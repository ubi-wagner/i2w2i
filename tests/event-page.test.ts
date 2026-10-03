import { describe, expect, it } from 'vitest';
import { cleanPage, EMPTY_PAGE, mapLinks } from '../lib/events/page';

describe('cleanPage', () => {
  it('turns junk into an empty page', () => {
    expect(cleanPage(null)).toEqual(EMPTY_PAGE);
    expect(cleanPage('nope')).toEqual(EMPTY_PAGE);
    expect(cleanPage({ schedule: 'x', info: [1, null] })).toEqual(EMPTY_PAGE);
  });
  it('trims, squashes spaces and caps lengths', () => {
    const p = cleanPage({ kicker: '  With   great joy ', inviteLine: 'x'.repeat(500) });
    expect(p.kicker).toBe('With great joy');
    expect(p.inviteLine).toHaveLength(120);
  });
  it('keeps schedule rows with a title, drops empty ones, caps at 20', () => {
    const p = cleanPage({ schedule: [{ time: '4:00 PM', title: 'Ceremony', place: 'The meadow' }, { time: '5:00', title: '' }, ...Array(30).fill({ title: 'x' })] });
    expect(p.schedule[0]).toEqual({ time: '4:00 PM', title: 'Ceremony', place: 'The meadow' });
    expect(p.schedule).toHaveLength(20);
  });
  it('keeps info text line breaks but not stray fields', () => {
    const p = cleanPage({ info: [{ title: 'Parking', text: 'Lot A\r\nor street', evil: '<script>' }] });
    expect(p.info).toEqual([{ title: 'Parking', text: 'Lot A\nor street' }]);
  });
});

describe('mapLinks', () => {
  it('encodes the address for each app', () => {
    const l = mapLinks('2505 SE 11th Ave, Portland & Co');
    expect(l.google).toBe('https://www.google.com/maps/dir/?api=1&destination=2505%20SE%2011th%20Ave%2C%20Portland%20%26%20Co');
    expect(l.apple).toContain('daddr=2505%20SE');
    expect(l.waze).toContain('navigate=yes');
  });
});
