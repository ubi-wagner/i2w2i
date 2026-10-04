import { describe, expect, it } from 'vitest';
import { cleanMenu, section, starterMenu } from '@/lib/menu';
import { describeParsed, keepIds, menuToText, mergeMenus, parseProof, readMenuFile, sectionText, textToMenu } from '@/lib/menu-text';

describe('menu as text', () => {
  it('round-trips: text out and back in gives the same menu, ids and all', () => {
    const m = starterMenu();
    const back = mergeMenus(m, textToMenu(menuToText(m)));
    expect(back).toEqual(m);
  });

  it('keeps details, blanks, countdowns and every kind of proof', () => {
    const m = cleanMenu({
      name: 'Ours', tagline: 'Just us', titles: { lead: 'Captain Kay', follow: 'Sunny' },
      sections: [{ kind: 'play', title: 'Breaks', note: 'Proof must be recorded.', groups: [{ title: 'Moves', items: [
        { label: 'Clamps for ___ mins', param: 'mins', minutes: 10, needs: [{ kind: 'photo', count: 3, label: 'each side' }, { kind: 'video', count: 1 }], detail: 'Line one\nLine two' },
        { label: 'Clean shave (face only)' },
      ] }] }],
    });
    const text = menuToText(m);
    expect(text).toContain('## Play: Breaks\nNote: Proof must be recorded.\n\n### Moves\n- Clamps for ___ mins {mins} [3 photos (each side) + 1 video] (10 min)\n  Line one\n  Line two\n- Clean shave (face only)');
    expect(mergeMenus(m, textToMenu(text))).toEqual(m);
  });

  it('reads proof written the natural way', () => {
    expect(parseProof('2 photos (before & after) + 1 video')).toEqual([{ kind: 'photo', count: 2, label: 'before & after' }, { kind: 'video', count: 1 }]);
    expect(parseProof('photo')).toEqual([{ kind: 'photo', count: 1 }]);
    expect(parseProof('10 notes: affirmations; voice note')).toEqual([{ kind: 'text', count: 10, label: 'affirmations' }, { kind: 'audio', count: 1 }]);
    expect(parseProof('3 pics, 1 clip')).toEqual([{ kind: 'photo', count: 3 }, { kind: 'video', count: 1 }]);
    expect(parseProof('a smell')).toBeNull();
  });

  it('is forgiving about headings and says what it couldn’t read', () => {
    const p = textToMenu([
      '## Sunny’s Presentation (The Canvas)',
      '- Heels',
      '## Post-Inspection Service Continuation',
      '### Service',
      '- Cook dinner',
      '## Shutdown & Couple Affirmation (Aftercare)',
      '- Cuddle',
      'random words',
      '- Smell it [1 smell]',
      '- Proof [1 photo] in the middle',
      '## Something else',
      '- ignored',
    ].join('\n'));
    expect(p.sections.map((s) => s.kind)).toEqual(['presentation', 'service', 'aftercare']);
    expect(p.warnings.join('\n')).toMatch(/Line 10: put the proof in \[ \] at the end/);
    expect(section(cleanMenu({ sections: p.sections }), 'presentation').groups[0]!.items[0]!.label).toBe('Heels');
    expect(p.warnings).toHaveLength(4);
    expect(p.warnings.join('\n')).toMatch(/Line 8: “random words” isn’t an item/);
    expect(p.warnings.join('\n')).toMatch(/Line 9: couldn’t read the proof/);
    expect(p.warnings.join('\n')).toMatch(/Line 11: “Something else” isn’t a section/);
  });

  it('a file with some sections replaces only those, and keeps ids by name', () => {
    const m = starterMenu();
    const shower = section(m, 'presentation').groups[0]!.items[0]!;
    const play = section(m, 'play');
    const p = textToMenu('## Presentation\n### Getting ready\n- Shower [2 photos]\n- Brand new thing\n');
    const next = mergeMenus(m, p);
    expect(describeParsed(p)).toBe('Presentation');
    expect(section(next, 'play')).toEqual(play);
    expect(next.pacing).toEqual(m.pacing);
    expect(next.name).toBe(m.name);
    const items = section(next, 'presentation').groups[0]!.items;
    expect(items.map((i) => i.label)).toEqual(['Shower', 'Brand new thing']);
    expect(items[0]).toEqual({ id: shower.id, label: 'Shower', needs: [{ kind: 'photo', count: 2 }] });
    expect(items[1]!.id).not.toBe(shower.id);
  });

  it('pacing and rooms read back', () => {
    const p = textToMenu('## Pacing\n- 8 hours: 4 rooms, 3 play breaks, 3 praise tasks, errands — 4+ rooms and errands\n- 2 hours: 1 room — short\n## Rooms\n- Kitchen\n- Office, Laundry\n');
    expect(p.pacing!.map(({ id: _id, ...x }) => x)).toEqual([
      { label: '8 hours', hours: 8, rooms: 4, playBreaks: 3, praise: 3, errands: true, note: '4+ rooms and errands' },
      { label: '2 hours', hours: 2, rooms: 1, playBreaks: 0, praise: 0, errands: false, note: 'short' },
    ]);
    expect(p.rooms).toEqual(['Kitchen', 'Office', 'Laundry']);
  });

  it('one section on its own reads back into that section', () => {
    const m = starterMenu();
    const s = section(m, 'aftercare');
    const p = textToMenu(sectionText(s));
    expect(keepIds(cleanMenu({ ...m, sections: m.sections.map((x) => (x.kind === 'aftercare' ? p.sections[0]! : x)) }), m)).toEqual(m);
  });

  it('JSON files still work, and replace only the sections they list', () => {
    const m = starterMenu();
    const p = readMenuFile(JSON.stringify({ sections: [{ kind: 'errands', groups: [{ title: 'Out', items: [{ label: 'Post office', needs: ['photo'] }] }] }] }));
    const next = mergeMenus(m, p);
    expect(section(next, 'errands').groups[0]!.items[0]).toMatchObject({ label: 'Post office', needs: [{ kind: 'photo', count: 1 }] });
    expect(section(next, 'play')).toEqual(section(m, 'play'));
    expect(next.titles).toEqual(m.titles);
    expect(readMenuFile('{ nope').warnings[0]).toMatch(/isn’t valid JSON/);
  });
});
