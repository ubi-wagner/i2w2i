import { describe, expect, it } from 'vitest';
import { cleanMenu } from '@/lib/menu';
import { builtInInventory } from '@/lib/inventory-data';
import { cleanProfile, lovedByAll, matches, ratedCount, rateSections, rateSectionsToText, textToRateSections } from '@/lib/profile';
import { roleplaysToText, textToRoleplays } from '@/lib/roleplay-text';

describe('roleplays as text', () => {
  const words = { lead: ['captain kay', 'kay'], follow: ['sunny'] };
  const text = `# Our roleplays

## Indoor
- The night shift
  Leads: Sunny
  Location: Kitchen | Intensity: Playful | Attire: Apron (Kay); a clipboard (Sunny)
  THE SETUP: Kay arrives late for her shift.
  She owes an hour.
  Action: Sunny gives the orders.
  Aftercare: Tea on the couch, feet up.

- Breakfast service
  Leads: {lead}
  Setup: Warm plates, low music.

## Outdoor
- A drive
  Leads: nobody
  Action: Windows down.`;

  it('reads groups, fields on one line or many, and who leads', () => {
    const { roleplays, warnings } = textToRoleplays(text, words);
    expect(roleplays.map((r) => [r.title, r.group, r.leads])).toEqual([
      ['The night shift', 'Indoor', 'follow'],
      ['Breakfast service', 'Indoor', 'lead'],
      ['A drive', 'Outdoor', 'lead'],
    ]);
    const [a] = roleplays;
    expect(a!.location).toBe('Kitchen');
    expect(a!.intensity).toBe('Playful');
    expect(a!.attire).toBe('Apron (Kay); a clipboard (Sunny)');
    expect(a!.setup).toBe('Kay arrives late for her shift. She owes an hour.');
    expect(a!.aftercare).toBe('Tea on the couch, feet up.');
    expect(warnings).toEqual(['Line 18: “Leads: nobody” isn’t {lead} or {follow}; it’s set to {lead}.']);
  });

  it('writes what it reads', () => {
    const { roleplays } = textToRoleplays(text, words);
    const again = textToRoleplays(roleplaysToText(roleplays));
    expect(again.warnings).toEqual([]);
    expect(again.roleplays.map(({ id: _, ...r }) => r)).toEqual(roleplays.map(({ id: _, ...r }) => r));
  });

  it('says which lines it couldn’t place', () => {
    expect(textToRoleplays('Just a line\n- A\n  stray words').warnings).toEqual([
      'Line 1: “Just a line” isn’t under a roleplay (start one with “- ”).',
      'Line 3: “stray words” isn’t a field (like “Setup: …”).',
    ]);
  });

  it('roleplays survive the menu being cleaned', () => {
    const { roleplays } = textToRoleplays(text, words);
    const m = cleanMenu({ roleplays, switchTitles: { lead: 'Sir' } });
    expect(m.roleplays).toEqual(roleplays);
    expect(m.switchTitles).toEqual({ lead: 'Sir', follow: '' });
    expect(m.builtInInventory).toBe(true);
  });
});

describe('profiles', () => {
  const sections = builtInInventory();

  it('built-in ids are unique and fixed in shape', () => {
    const ids = sections.flatMap((s) => s.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^bi-[a-z]+-\d{2}$/.test(id))).toBe(true);
  });

  it('keeps only real scores and notes', () => {
    const p = cleanProfile({ ratings: { 'bi-touch-01': { give: 5, recv: 9 }, 'bad id!': { give: 3 }, 'bi-touch-02': {} }, about: { hard: ' Nothing in public. ', nope: 'x' } });
    expect(p.ratings).toEqual({ 'bi-touch-01': { give: 5 } });
    expect(p.about.hard).toBe('Nothing in public.');
    expect('nope' in p.about).toBe(false);
  });

  it('finds where you meet: a yes, something to talk about, and a no', () => {
    const own = [{ id: 'o', title: 'Ours', items: [{ id: 'x1', label: 'Spanking' }, { id: 'x2', label: 'Rope' }, { id: 'x3', label: 'Wax' }] }];
    const all = rateSections(sections, own, false);
    const me = cleanProfile({ ratings: { x1: { give: 5, recv: 1 }, x2: { recv: 4 }, x3: { give: 3 } } });
    const you = cleanProfile({ ratings: { x1: { recv: 4, give: 0 }, x2: { give: 2 }, x3: { recv: 0 } } });
    const m = matches(all, me, you);
    expect(m.yes.map((x) => [x.label, x.way, x.mine, x.theirs])).toEqual([['Spanking', 'give', 5, 4]]);
    expect(m.talk.map((x) => [x.label, x.way])).toEqual([['Rope', 'recv']]);
    expect(m.no.map((x) => [x.label, x.way])).toEqual([['Spanking', 'recv'], ['Wax', 'give']]);
    expect(ratedCount(all, me)).toBe(3);
    expect(rateSections(sections, own, true)).toHaveLength(sections.length + 1);
  });

  it('quick loves and dislikes for roleplays, and the ones you both love', () => {
    const me = cleanProfile({ roleplays: { r1: { feel: 'love', loved: ' The pace. ' }, r2: { feel: 'meh' }, 'bad id!': { feel: 'love' }, r3: { feel: 'no', disliked: 'Too long' } } });
    expect(me.roleplays).toEqual({ r1: { feel: 'love', loved: 'The pace.' }, r3: { feel: 'no', disliked: 'Too long' } });
    const you = cleanProfile({ roleplays: { r1: { feel: 'love' }, r3: { feel: 'love' } } });
    const rps = [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }];
    expect(lovedByAll(rps, [me, you]).map((r) => r.id)).toEqual(['r1']);
    expect(lovedByAll(rps, [])).toEqual([]);
  });

  it('a list as text keeps ids for things already there', () => {
    const { sections: first } = textToRateSections('## Ours\n- Rope\n- Wax\n1. Ice');
    expect(first[0]!.items.map((i) => i.label)).toEqual(['Rope', 'Wax', 'Ice']);
    const { sections: again, warnings } = textToRateSections(`${rateSectionsToText(first)}- Feathers\nnot a line`, first);
    expect(again[0]!.items.slice(0, 3)).toEqual(first[0]!.items);
    expect(again[0]!.items[3]!.label).toBe('Feathers');
    expect(warnings).toHaveLength(1);
  });
});
