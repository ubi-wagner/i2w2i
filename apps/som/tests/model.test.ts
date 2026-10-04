import { describe, expect, it } from 'vitest';
import { cleanMenu, itemsById, proofText, section, SECTION_KINDS, starterMenu, type Menu } from '@/lib/menu';
import { arrivalChecklist, autoFill, cleanPlan, emptyPlan, noProof, picked, pacingForHours, planCheckins, planToTasks, proofComplete, proofProgress, recentlyUsed, roleplayHistory, tidyPlan, withParam, type Plan } from '@/lib/plan';
import { allAgreed, canDelete, overlaps, sceneRole, sceneTransition, startState, taskTransition, windowProblem } from '@/lib/rules';

const find = (menu: Menu, label: string) => [...itemsById(menu).values()].find((x) => x.item.label === label)!.item;

describe('menu', () => {
  it('the starter menu is already clean, with every section in the sheet’s order', () => {
    const m = starterMenu();
    const clean = cleanMenu(JSON.parse(JSON.stringify(m)));
    expect(clean).toEqual(m);
    expect(clean.sections.map((s) => s.kind)).toEqual(SECTION_KINDS.map((s) => s.kind));
  });

  it('cleans imports: unknown fields dropped, text trimmed, bad needs ignored, missing sections added', () => {
    const m = cleanMenu({
      titles: { lead: '  Captain Kay ', follow: 'Sunny' },
      sections: [{ kind: 'play', title: 'Play', groups: [{ title: 'Moves', items: [{ label: '  Dance video ', needs: ['video', 'telepathy', { kind: 'photo', count: 500, label: '  each  angle ' }, { kind: 'smell' }], minutes: 15, evil: 1 }, { label: '' }] }] }],
      rooms: ['Kitchen', 'Kitchen', ' Office '],
      hack: true,
    } as never);
    expect(m.titles).toEqual({ lead: 'Captain Kay', follow: 'Sunny' });
    expect(m.sections).toHaveLength(12);
    const play = section(m, 'play');
    expect(play.groups[0]!.items).toHaveLength(1);
    expect(play.groups[0]!.items[0]).toMatchObject({ label: 'Dance video', needs: [{ kind: 'video', count: 1 }, { kind: 'photo', count: 50, label: 'each angle' }], minutes: 15 });
    expect(play.groups[0]!.items[0]).not.toHaveProperty('evil');
    expect(m.rooms).toEqual(['Kitchen', 'Office']);
    expect(m).not.toHaveProperty('hack');
    expect(m.pacing.length).toBeGreaterThan(0);
  });

  it('keeps ids, so a plan’s picks survive edits', () => {
    const m = starterMenu();
    const ids = [...itemsById(m).keys()];
    expect([...itemsById(cleanMenu(m)).keys()]).toEqual(ids);
  });
});

describe('plan → tasks', () => {
  const menu = starterMenu();
  function plan(p: Partial<Plan>): Plan {
    return cleanPlan({ ...emptyPlan(menu), ...p });
  }

  it('turns each block into tasks: getting ready as one checklist, then each thing picked', () => {
    const shower = find(menu, 'Shower');
    const hair = find(menu, 'Hair done');
    const deep = find(menu, 'Deep-clean the ___');
    const fridge = find(menu, 'Clean the refrigerator, inside and out');
    const note = find(menu, 'Write a love note');
    const sonnet = find(menu, 'Write me a sonnet about our marriage');
    const p = plan({
      picks: { [shower.id]: {}, [hair.id]: {}, [deep.id]: { param: 'Kitchen' }, [fridge.id]: {}, [note.id]: {}, [sonnet.id]: {} },
      blocks: [{ kind: 'home', items: [sonnet.id, fridge.id, shower.id, note.id, deep.id, hair.id] }],
    });
    const tasks = planToTasks(menu, p);
    expect(tasks.map((t) => t.title)).toEqual(['Getting ready', 'Clean the refrigerator, inside and out', 'Deep-clean the Kitchen', 'Write a love note', 'Write me a sonnet about our marriage']);
    expect(tasks.map((t) => t.kind)).toEqual(['presentation', 'domain', 'domain', 'tasks', 'wishes']);
    expect(tasks.every((t) => t.block === 0)).toBe(true);
    expect(tasks[0]).toMatchObject({ checklist: ['Shower', 'Hair done'], needs: [{ kind: 'photo', count: 1 }] });
    expect(tasks[1]).toMatchObject({ needs: [{ kind: 'photo', count: 2, label: 'before & after' }] });
    expect(tasks[3]).toMatchObject({ needs: [{ kind: 'text', count: 1 }], writing: true });
  });

  it('later blocks start with a change-over; own items carry their own proof', () => {
    const change = find(menu, 'Out of the cleaning clothes, into ___ for going out');
    const flowers = find(menu, 'Pick up flowers');
    const p = plan({
      picks: { [change.id]: { param: 'a sundress' }, [flowers.id]: {} },
      customs: [{ id: 'own1', kind: 'errands', label: 'Buy the wine', details: 'Something red', needs: [{ kind: 'photo', count: 5 }, 'video', { kind: 'nope' }] as never }],
      blocks: [{ kind: 'home', items: [] }, { kind: 'out', items: [flowers.id, 'own1', change.id] }],
    });
    const tasks = planToTasks(menu, p);
    expect(tasks.map((t) => [t.block, t.title])).toEqual([[1, 'Out of the cleaning clothes, into a sundress for going out'], [1, 'Pick up flowers'], [1, 'Buy the wine']]);
    expect(tasks[2]).toMatchObject({ details: 'Something red', needs: [{ kind: 'photo', count: 5 }, { kind: 'video', count: 1 }] });
  });

  it('fills blanks in labels', () => {
    expect(withParam('Clamps for ___ mins', '10')).toBe('Clamps for 10 mins');
    expect(withParam('Massage', '30', 'mins')).toBe('Massage (30 mins)');
    expect(withParam('Massage', '30 mins', 'mins')).toBe('Massage (30 mins)');
  });

  it('ignores items no longer on the menu', () => {
    expect(planToTasks(menu, plan({ picks: { gone12345: {} }, blocks: [{ kind: 'home', items: ['gone12345'] }] }))).toEqual([]);
  });

  it('lists the arrival routine picked', () => {
    const door = find(menu, 'Meet at the door with a drink');
    expect(arrivalChecklist(menu, plan({ picks: { [door.id]: {} } }))).toEqual(['Meet at the door with a drink']);
  });

  it('cleans plans: bad ids dropped, each thing in one block, check-ins only from the choices', () => {
    const p = cleanPlan({ picks: { 'ok-1': { param: ' 10 ' }, 'bad id!': {} }, checkinMinutes: 7, blocks: [{ kind: 'home', items: ['a', 'b'] }, { kind: 'out', items: ['b', 'c'] }, { kind: 'pool', items: [] }] });
    expect(p.picks).toEqual({ 'ok-1': { param: '10' } });
    expect(p.blocks).toEqual([{ kind: 'home', items: ['a', 'b'] }, { kind: 'out', items: ['c'] }]);
    expect(p.checkinMinutes).toBeNull();
    expect(cleanPlan({ checkinMinutes: 30 }).checkinMinutes).toBe(30);
    expect(cleanPlan({ checkinMinutes: 0 }).checkinMinutes).toBe(0);
  });

  it('tidies away picks no longer in the day (the arrival routine stays)', () => {
    const door = find(menu, 'Meet at the door with a drink');
    const fridge = find(menu, 'Clean the refrigerator, inside and out');
    const p = tidyPlan(menu, plan({ picks: { [door.id]: {}, [fridge.id]: {}, x: {} }, customs: [{ id: 'own', kind: 'domain', label: 'Mow', details: '', needs: [] }], blocks: [{ kind: 'home', items: [] }] }));
    expect(Object.keys(p.picks)).toEqual([door.id]);
    expect(p.customs).toEqual([]);
  });

  it('check-ins: at the end of each block with something in it, every so often, or none', () => {
    const fridge = find(menu, 'Clean the refrigerator, inside and out');
    const flowers = find(menu, 'Pick up flowers');
    const day = plan({ blocks: [{ kind: 'home', items: [fridge.id] }, { kind: 'out', items: [flowers.id] }, { kind: 'free', items: [] }, { kind: 'home', items: [] }, { kind: 'welcome', items: [] }] });
    expect(planCheckins(day, 480)).toEqual({ every: null, at: [120, 240] });
    expect(planCheckins({ ...day, checkinMinutes: 45 })).toEqual({ every: 45, at: [] });
    expect(planCheckins({ ...day, checkinMinutes: 0 })).toEqual({ every: null, at: [] });
  });
});

describe('rules', () => {
  it('the follow drafts and proposes; only the lead starts, inspects and moves to aftercare', () => {
    expect(sceneTransition('draft', 'propose', 'follow')).toBe('proposed');
    expect(sceneTransition('draft', 'propose', 'lead')).toBeNull();
    expect(sceneTransition('proposed', 'withdraw', 'follow')).toBe('draft');
    expect(sceneTransition('proposed', 'start', 'lead')).toBe('active');
    expect(sceneTransition('draft', 'start', 'lead')).toBe('active');
    expect(sceneTransition('proposed', 'start', 'follow')).toBeNull();
    expect(sceneTransition('active', 'inspect', 'lead')).toBe('inspection');
    expect(sceneTransition('active', 'inspect', 'follow')).toBeNull();
    expect(sceneTransition('inspection', 'aftercare', 'lead')).toBe('aftercare');
    expect(sceneTransition('aftercare', 'close', 'follow')).toBe('closed');
    expect(sceneTransition('active', 'close', 'lead')).toBeNull();
  });

  it('plans are editable while drafting; once proposed only the lead edits; then never', () => {
    expect(sceneTransition('draft', 'edit', 'follow')).toBe('draft');
    expect(sceneTransition('proposed', 'edit', 'follow')).toBeNull();
    expect(sceneTransition('proposed', 'edit', 'lead')).toBe('proposed');
    expect(sceneTransition('active', 'edit', 'lead')).toBeNull();
  });

  it('the follow starts and submits tasks; the lead approves, returns, skips or reopens', () => {
    expect(taskTransition('todo', 'start', 'follow')).toBe('started');
    expect(taskTransition('started', 'submit', 'follow')).toBe('submitted');
    expect(taskTransition('returned', 'submit', 'follow')).toBe('submitted');
    expect(taskTransition('submitted', 'approve', 'follow')).toBeNull();
    expect(taskTransition('submitted', 'approve', 'lead')).toBe('approved');
    expect(taskTransition('submitted', 'return', 'lead')).toBe('returned');
    expect(taskTransition('approved', 'submit', 'follow')).toBeNull();
    expect(taskTransition('todo', 'skip', 'lead')).toBe('skipped');
    expect(taskTransition('approved', 'reopen', 'lead')).toBe('todo');
    expect(taskTransition('todo', 'submit', 'lead')).toBeNull();
  });

  it('you delete only your own content; a whole scene needs everyone', () => {
    expect(canDelete('a', 'a')).toBe(true);
    expect(canDelete('a', 'b')).toBe(false);
    expect(allAgreed(['a'], ['a', 'b'])).toBe(false);
    expect(allAgreed(['b', 'a'], ['a', 'b'])).toBe(true);
    expect(allAgreed([], [])).toBe(false);
  });
});

describe('proof: any number of each kind', () => {
  const menu = starterMenu();

  it('a task can ask for many notes and a voice note', () => {
    const aff = find(menu, 'Daily affirmations');
    const p = cleanPlan({ ...emptyPlan(menu), picks: { [aff.id]: {} }, blocks: [{ kind: 'home', items: [aff.id] }] });
    expect(planToTasks(menu, p)[0]).toMatchObject({ needs: [{ kind: 'text', count: 10, label: 'affirmations' }, { kind: 'audio', count: 1, label: 'read aloud' }], writing: false });
  });

  it('counts what has come in against what is needed', () => {
    const needs = [{ kind: 'photo' as const, count: 2, label: 'before & after' }, { kind: 'photo' as const, count: 1, label: 'finished' }, { kind: 'text' as const, count: 10 }];
    const sent = { ...noProof(), photo: 1, text: 12, video: 3 };
    expect(proofProgress(needs, sent)).toEqual([
      { kind: 'photo', have: 1, want: 3, labels: ['before & after', 'finished'] },
      { kind: 'text', have: 10, want: 10, labels: [] },
    ]);
    expect(proofComplete(needs, sent)).toBe(false);
    expect(proofComplete(needs, { ...sent, photo: 3 })).toBe(true);
    expect(proofComplete([], noProof())).toBe(true);
  });

  it('describes proof plainly', () => {
    expect(proofText({ kind: 'photo', count: 2, label: 'before & after' })).toBe('2 photos (before & after)');
    expect(proofText({ kind: 'audio', count: 1 })).toBe('1 voice note');
    expect(proofText({ kind: 'text', count: 10, label: 'affirmations' })).toBe('10 notes (affirmations)');
  });

  it('presentation proof comes from the picks, or one photo', () => {
    const m = cleanMenu({ sections: [{ kind: 'presentation', groups: [{ title: 'Look', items: [{ id: 'face', label: 'Full face', needs: [{ kind: 'photo', count: 2, label: 'close-up' }] }, { id: 'heels', label: 'Heels' }] }] }] });
    const day = (items: string[]) => cleanPlan({ ...emptyPlan(m), picks: Object.fromEntries(items.map((i) => [i, {}])), blocks: [{ kind: 'home', items }] });
    expect(planToTasks(m, day(['heels']))[0]!.needs).toEqual([{ kind: 'photo', count: 1 }]);
    expect(planToTasks(m, day(['heels', 'face']))[0]!.needs).toEqual([{ kind: 'photo', count: 2, label: 'close-up' }]);
  });
});

describe('offering a scene', () => {
  it('the lead offers; the follow accepts or asks for a change; the lead agrees, builds, sends; either starts', () => {
    expect(sceneTransition('draft', 'offer', 'lead')).toBe('offered');
    expect(sceneTransition('offered', 'accept', 'follow')).toBe('accepted');
    expect(sceneTransition('offered', 'accept', 'lead', true)).toBeNull();
    expect(sceneTransition('offered', 'request_change', 'follow')).toBe('offered');
    expect(sceneTransition('offered', 'request_change', 'lead', true)).toBeNull();
    expect(sceneTransition('offered', 'agree_change', 'lead', true)).toBe('accepted');
    expect(sceneTransition('offered', 'agree_change', 'follow')).toBeNull();
    expect(sceneTransition('offered', 'offer', 'lead', true)).toBe('offered');
    expect(sceneTransition('offered', 'offer', 'follow')).toBeNull();
    expect(sceneTransition('accepted', 'offer', 'lead', true)).toBe('offered');
    expect(sceneTransition('accepted', 'edit', 'lead')).toBe('accepted');
    expect(sceneTransition('accepted', 'edit', 'follow')).toBeNull();
    expect(sceneTransition('accepted', 'send', 'lead')).toBe('ready');
    expect(sceneTransition('accepted', 'send', 'follow')).toBeNull();
    expect(sceneTransition('ready', 'unsend', 'lead')).toBe('accepted');
    expect(sceneTransition('ready', 'start', 'follow')).toBe('active');
    expect(sceneTransition('ready', 'start', 'lead')).toBe('active');
    expect(sceneTransition('ready', 'edit', 'lead')).toBeNull();
    expect(sceneTransition('offered', 'cancel', 'lead', true)).toBe('draft');
    expect(sceneTransition('offered', 'cancel', 'follow')).toBeNull();
    expect(sceneTransition('ready', 'cancel', 'lead', true)).toBeNull();
    expect(sceneTransition('accepted', 'start', 'follow')).toBeNull();
  });

  it('either of you can offer; the other answers, and can say not this time', () => {
    expect(sceneTransition('draft', 'offer', 'follow')).toBe('offered');
    expect(sceneTransition('offered', 'accept', 'lead')).toBe('accepted');
    expect(sceneTransition('offered', 'accept', 'follow', true)).toBeNull();
    expect(sceneTransition('offered', 'decline', 'lead')).toBe('draft');
    expect(sceneTransition('offered', 'decline', 'follow')).toBe('draft');
    expect(sceneTransition('offered', 'decline', 'follow', true)).toBeNull();
    expect(sceneTransition('offered', 'agree_change', 'follow', true)).toBe('accepted');
  });

  it('a lead accepting a scene that needs no building sends it as they accept', () => {
    expect(sceneTransition('offered', 'accept_send', 'lead')).toBe('ready');
    expect(sceneTransition('offered', 'accept_send', 'follow')).toBeNull();
    expect(sceneTransition('offered', 'accept_send', 'lead', true)).toBeNull();
  });

  it('aftercare comes after the inspection, never straight from the scene (rewards are earned there)', () => {
    expect(sceneTransition('active', 'aftercare', 'lead')).toBeNull();
    expect(sceneTransition('inspection', 'aftercare', 'lead')).toBe('aftercare');
    expect(sceneTransition('inspection', 'aftercare', 'follow')).toBeNull();
  });

  it('switching swaps who leads in that scene', () => {
    expect(sceneRole('lead', false)).toBe('lead');
    expect(sceneRole('lead', true)).toBe('follow');
    expect(sceneRole('follow', true)).toBe('lead');
  });
});

describe('an offer is a window of time', () => {
  const now = new Date('2026-10-05T12:00:00Z');
  const at = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 6, h, m));

  it('is 15 minutes to 48 hours, and not over already', () => {
    expect(windowProblem(at(8, 30), at(16, 30), now)).toBeNull();
    expect(windowProblem(at(8), at(8, 10), now)).toMatch(/15 minutes/);
    expect(windowProblem(at(8), new Date(at(8).getTime() + 49 * 3_600_000), now)).toMatch(/48 hours/);
    expect(windowProblem(new Date('2026-10-05T08:00:00Z'), new Date('2026-10-05T11:00:00Z'), now)).toMatch(/passed/);
    expect(windowProblem(new Date('2026-10-05T08:00:00Z'), new Date('2026-10-05T16:00:00Z'), now)).toBeNull(); // already open
    expect(windowProblem(new Date('nope'), at(9), now)).toMatch(/Pick/);
  });

  it('two windows clash only if they share time', () => {
    const work = { start: at(8, 30), end: at(16, 30) };
    expect(overlaps(work, { start: at(16), end: at(18) })).toBe(true);
    expect(overlaps(work, { start: at(6), end: at(9) })).toBe(true);
    expect(overlaps(work, { start: at(9), end: at(10) })).toBe(true);
    expect(overlaps(work, { start: at(16, 30), end: at(18) })).toBe(false);
    expect(overlaps(work, { start: at(6), end: at(8, 30) })).toBe(false);
  });

  it('starts from half an hour before it opens until it closes', () => {
    expect(startState(at(8, 30), at(16, 30), at(7, 59))).toBe('early');
    expect(startState(at(8, 30), at(16, 30), at(8))).toBe('ok');
    expect(startState(at(8, 30), at(16, 30), at(12))).toBe('ok');
    expect(startState(at(8, 30), at(16, 30), at(16, 30))).toBe('over');
    expect(startState(null, null, at(3))).toBe('ok');
  });
});

describe('fill it for me', () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const menu = starterMenu();
  const kinds = (p: Plan, i: number) => p.blocks[i]!.items.map((id) => itemsById(menu).get(id)?.section.kind);

  it('an offered length picks the closest pacing', () => {
    expect(pacingForHours(menu, 8)?.hours).toBe(8);
    expect(pacingForHours(menu, 5)?.hours).toBe(4);
    expect(pacingForHours(menu, 30)?.hours).toBe(8);
  });

  it('fills every block: getting ready, exactly two chores (or errands), devotion and one for the lead', () => {
    const shower = find(menu, 'Shower');
    const base = cleanPlan({ ...emptyPlan(menu, 8), picks: { [shower.id]: {} }, blocks: [{ kind: 'home', items: [shower.id] }, { kind: 'out', items: [] }, { kind: 'free', items: [] }, { kind: 'home', items: [] }, { kind: 'welcome', items: [] }] });
    const p = autoFill(menu, base, rand);
    const count = (i: number, k: string) => kinds(p, i).filter((x) => x === k).length;
    expect(p.blocks[0]!.items).toContain(shower.id);
    expect(count(0, 'presentation')).toBe(3);
    expect([count(0, 'domain'), count(0, 'tasks'), count(0, 'wishes')]).toEqual([2, 1, 1]);
    expect([count(1, 'changeover'), count(1, 'errands'), count(1, 'tasks'), count(1, 'wishes')]).toEqual([1, 2, 1, 1]);
    expect(kinds(p, 2)).toEqual(['play']);
    expect([count(3, 'changeover'), count(3, 'domain'), count(3, 'tasks'), count(3, 'wishes')]).toEqual([1, 2, 1, 1]);
    // The welcome home gets a look for the lead's return; change-overs don't.
    const welcome = new Set(section(menu, 'changeover').groups.find((g) => g.title === 'Welcome home')!.items.map((i) => i.id));
    expect(p.blocks[4]!.items.every((id) => welcome.has(id)) && p.blocks[4]!.items.length).toBe(1);
    expect([1, 3].flatMap((i) => p.blocks[i]!.items).some((id) => welcome.has(id))).toBe(false);
    expect(arrivalChecklist(menu, p).length).toBeGreaterThan(0);
    // Nothing twice in a day; a room is cleaned once.
    const all = p.blocks.flatMap((b) => b.items);
    expect(new Set(all).size).toBe(all.length);
    const rooms = Object.values(p.picks).map((x) => x.param).filter((x) => x && menu.rooms.includes(x));
    expect(new Set(rooms).size).toBe(rooms.length);
    // Running it again adds nothing new.
    expect(autoFill(menu, p, rand).blocks).toEqual(p.blocks);
  });

  it('with no blocks yet, the day fits the window', () => {
    const p = autoFill(menu, cleanPlan({ ...emptyPlan(menu), blocks: [] }), rand, 4);
    expect(p.blocks.map((b) => b.kind)).toEqual(['home', 'out']);
  });

  it('steers away from what recent scenes used, while there’s something new', () => {
    const play = section(menu, 'play').groups.flatMap((g) => g.items);
    const devotion = section(menu, 'tasks').groups.flatMap((g) => g.items);
    const deep = find(menu, 'Deep-clean the ___');
    const [keep, ...rest] = menu.rooms;
    const last = cleanPlan({ ...emptyPlan(menu), picks: Object.fromEntries([...play.slice(1), ...devotion.slice(1)].map((i) => [i.id, {}])) });
    const roomsUsed = rest.map((room) => cleanPlan({ ...emptyPlan(menu), picks: { [deep.id]: { param: room } } }));
    const avoid = recentlyUsed([last, ...roomsUsed]);
    for (let i = 0; i < 5; i++) {
      const p = autoFill(menu, cleanPlan({ ...emptyPlan(menu, 8) }), rand, undefined, avoid);
      expect(picked(menu, p, 'play').map((x) => x.item.id)).toEqual([play[0]!.id]);
      expect(picked(menu, p, 'tasks').map((x) => x.item.id)[0]).toBe(devotion[0]!.id);
      if (p.picks[deep.id]) expect(p.picks[deep.id]!.param).toBe(keep);
    }
    // Nothing new left: it repeats rather than leaving a gap.
    const all = recentlyUsed([cleanPlan({ ...emptyPlan(menu), picks: Object.fromEntries(play.map((i) => [i.id, {}])) })]);
    expect(picked(menu, autoFill(menu, cleanPlan({ ...emptyPlan(menu, 8) }), rand, undefined, all), 'play')).toHaveLength(1);
  });

  it('knows which roleplays were played, how often and when last', () => {
    const rp = (id: string) => cleanPlan({ ...emptyPlan(menu), roleplay: { id, title: id } });
    const h = roleplayHistory([
      { plan: rp('a'), started_at: '2026-10-01T09:00:00Z' },
      { plan: rp('a'), started_at: '2026-10-03T09:00:00Z' },
      { plan: rp('b'), started_at: null },
      { plan: null, started_at: '2026-10-02T09:00:00Z' },
    ]);
    expect(h).toEqual({ a: { count: 2, last: '2026-10-03T09:00:00Z' } });
  });

  it('fills a blank with a sensible number', () => {
    const m = cleanMenu({ ...menu, sections: menu.sections.map((s) => (s.kind === 'play' ? { ...s, groups: [{ id: 'g', title: 'g', items: [{ id: 'mm', label: 'Massage', param: 'mins' }] }] } : s)) });
    const p = autoFill(m, cleanPlan({ ...emptyPlan(m, 8) }), rand);
    expect(p.picks.mm).toEqual({ param: '10' });
  });
});
