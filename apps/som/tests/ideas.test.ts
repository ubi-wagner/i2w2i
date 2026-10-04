import { describe, expect, it } from 'vitest';
import { cleanMenu, newId, section, SECTION_KINDS, starterMenu } from '@/lib/menu';
import { addIdeas, ideasFor, inMenu, keepRemoved, ownIdeaCount, removeIdea, toggleIdea, withTitles } from '@/lib/ideas';
import { builtInIdeas } from '@/lib/ideas-data';

const B = withTitles(builtInIdeas(), { lead: 'Captain Kay', follow: 'Sunny' });
import { menuToText, mergeMenus, textToMenu } from '@/lib/menu-text';

describe('ideas', () => {
  it('there are plenty built in, for every section, all clean and none repeated', () => {
    const b = builtInIdeas();
    expect(b.map((s) => s.kind)).toEqual(SECTION_KINDS.map((k) => k.kind));
    const total = b.reduce((n, s) => n + s.groups.reduce((k, g) => k + g.items.length, 0), 0);
    expect(total).toBeGreaterThan(300);
    for (const s of b) {
      expect(s.groups.length, s.kind).toBeGreaterThan(0);
      const labels = s.groups.flatMap((g) => g.items.map((i) => i.label.toLowerCase()));
      expect(new Set(labels).size, s.kind).toBe(labels.length);
    }
    expect(cleanMenu({ sections: b }).sections).toEqual(b);
  });

  it('tapping an idea adds it to the menu in a group of the same name; tapping again takes it out', () => {
    const m = starterMenu();
    const groups = ideasFor(m, 'errands', B);
    const fuel = groups.flatMap((g) => g.items).find((i) => i.label === 'Fill the car with fuel')!;
    expect(inMenu(m, 'errands', fuel.label)).toBe(false);
    const added = toggleIdea(m, 'errands', 'Out and about', fuel, newId);
    expect(inMenu(added, 'errands', fuel.label)).toBe(true);
    const g = section(added, 'errands').groups.find((x) => x.title === 'Out and about')!;
    expect(g.items.at(-1)).toMatchObject({ label: 'Fill the car with fuel', needs: [{ kind: 'photo', count: 1, label: 'the pump' }] });
    expect(g.items.at(-1)).not.toHaveProperty('ours');
    expect(section(added, 'play')).toEqual(section(m, 'play'));
    const removed = toggleIdea(added, 'errands', 'Out and about', fuel, newId);
    expect(inMenu(removed, 'errands', fuel.label)).toBe(false);
  });

  it('built-in ideas say {lead} and {follow}, and show the pod’s own titles', () => {
    const raw = JSON.stringify(builtInIdeas());
    expect(raw).toContain('{lead}');
    const titled = JSON.stringify(B);
    expect(titled).not.toMatch(/\{lead\}|\{follow\}/);
    expect(B.find((s) => s.kind === 'arrival')!.groups.flatMap((g) => g.items).map((i) => i.label)).toContain('Kneel and kiss Captain Kay’s feet');
  });

  it('common kink and BDSM activities are in the pool, and solo ties carry safety notes', () => {
    const play = B.find((s) => s.kind === 'play')!;
    expect(play.groups.map((g) => g.title)).toEqual(expect.arrayContaining(['Self-impact', 'Self-bondage, done safely', 'Sensation', 'Edging & denial', 'Toys', 'Positions & endurance']));
    const ties = play.groups.find((g) => g.title === 'Self-bondage, done safely')!.items;
    expect(ties.every((i) => i.detail && /neck|circulation|shears/i.test(i.detail))).toBe(true);
    const impact = play.groups.find((g) => g.title === 'Self-impact')!.items[0]!;
    expect(impact.detail).toMatch(/never the lower back, spine, kidneys or joints/);
  });

  it('the starter menu is a pick from the built-in ideas', () => {
    const pool = new Set(builtInIdeas().flatMap((s) => s.groups.flatMap((g) => g.items.map((i) => `${s.kind}|${i.label.toLowerCase()}`))));
    const missing = starterMenu().sections.flatMap((s) => s.groups.flatMap((g) => g.items.filter((i) => !pool.has(`${s.kind}|${i.label.toLowerCase()}`)).map((i) => i.label)));
    expect(missing).toEqual([]);
  });

  it('things already in the menu show as added (by their wording)', () => {
    const m = starterMenu();
    expect(inMenu(m, 'presentation', 'shower')).toBe(true);
  });

  it('an ideas pack adds to the couple’s own ideas, shown first, without repeats', () => {
    const m = starterMenu();
    const pack = textToMenu('## Play\n### Ours\n- A private idea [2 videos]\n- A dance, on video\n## Errands\n### Out and about\n- Our errand [1 photo]\n');
    const once = addIdeas(m, pack.sections, newId);
    const twice = addIdeas(once, pack.sections, newId);
    expect(ownIdeaCount(once)).toBe(3);
    expect(ownIdeaCount(twice)).toBe(3);
    const play = ideasFor(once, 'play', B);
    expect(play[0]).toMatchObject({ title: 'Ours', items: [{ label: 'A private idea', ours: true }, { label: 'A dance, on video', ours: true }] });
    expect(play.flatMap((g) => g.items).filter((i) => i.label === 'A dance, on video')).toHaveLength(1);
    expect(once.sections).toEqual(m.sections);
  });

  it('the couple’s ideas survive saving, editing the menu as text, and importing sections', () => {
    const m = addIdeas(starterMenu(), textToMenu('## Tasks\n### Ours\n- Secret task [1 note]\n').sections, newId);
    const round = mergeMenus(m, textToMenu(menuToText(m)));
    expect(round.library).toEqual(m.library);
    expect(cleanMenu(JSON.parse(JSON.stringify(m)))).toEqual(m);
  });

  it('nothing written is lost: an entry taken out of the menu goes to your ideas', () => {
    const m = starterMenu();
    const withOwn = structuredClone(m);
    section(withOwn, 'errands').groups[0]!.items.push({ id: 'own1', label: 'Sunny’s own errand', needs: [{ kind: 'photo', count: 2 }] });
    const removed = structuredClone(withOwn);
    section(removed, 'errands').groups[0]!.items = section(removed, 'errands').groups[0]!.items.filter((i) => i.id !== 'own1' && i.label !== 'Grocery run');
    const kept = keepRemoved(withOwn, removed, newId, B);
    const ours = ideasFor(kept, 'errands', B).flatMap((g) => g.items).filter((i) => i.ours);
    // Sunny’s own entry is kept; “Grocery run” is already in the pool, so it isn’t copied.
    expect(ours.map((i) => i.label)).toEqual(['Sunny’s own errand']);
    expect(ours.find((i) => i.label === 'Sunny’s own errand')).toMatchObject({ needs: [{ kind: 'photo', count: 2 }] });
    // Renaming keeps the id, so it isn't “removed”.
    const renamed = structuredClone(withOwn);
    section(renamed, 'errands').groups[0]!.items.find((i) => i.id === 'own1')!.label = 'Renamed';
    expect(ownIdeaCount(keepRemoved(withOwn, renamed, newId, B))).toBe(0);
    // Ideas already in the pool aren't copied.
    const fuel = ideasFor(m, 'errands', B).flatMap((g) => g.items).find((i) => i.label === 'Fill the car with fuel')!;
    const on = toggleIdea(m, 'errands', 'Out and about', fuel, newId);
    expect(ownIdeaCount(keepRemoved(on, toggleIdea(on, 'errands', 'Out and about', fuel, newId), newId, B))).toBe(0);
  });

  it('your own ideas can be taken out of the pool', () => {
    const m = addIdeas(starterMenu(), textToMenu('## Play\n### Ours\n- One [1 photo]\n- Two\n').sections, newId);
    const less = removeIdea(m, 'play', 'one');
    expect(ownIdeaCount(less)).toBe(1);
    expect(ownIdeaCount(removeIdea(less, 'play', 'Two'))).toBe(0);
  });
});
