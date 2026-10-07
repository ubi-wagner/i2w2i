import { describe, expect, it } from 'vitest';
import { cleanMenu, itemsById, proofText, section, SECTION_KINDS, starterMenu, type Menu } from '@/lib/menu';
import { arrivalChecklist, autoFill, cleanPlan, emptyPlan, noProof, picked, pacingForHours, placeLoose, planCheckins, upgradePlan, planToTasks, proofComplete, proofProgress, recentlyUsed, roleplayHistory, tidyPlan, withParam, type Plan } from '@/lib/plan';
import { allAgreed, canDelete, overlaps, ownsDraft, sceneRole, sceneTransition, startState, taskTransition, windowProblem } from '@/lib/rules';

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

  it('lists the arrival routine picked; once kept with a started scene, menu changes don’t touch it', () => {
    const door = find(menu, 'Meet at the door with a drink');
    expect(arrivalChecklist(menu, plan({ picks: { [door.id]: {} } }))).toEqual(['Meet at the door with a drink']);
    const kept = plan({ picks: { [door.id]: {} }, arrival: ['Meet at the door with a drink'] });
    const changed = cleanMenu({ ...menu, sections: menu.sections.map((s) => (s.kind === 'arrival' ? { ...s, groups: [] } : s)) });
    expect(arrivalChecklist(changed, kept)).toEqual(['Meet at the door with a drink']);
    expect(cleanPlan(kept).arrival).toEqual(['Meet at the door with a drink']);
  });

  it('cleans plans: bad ids dropped, each thing in one block, check-ins only from the choices', () => {
    const p = cleanPlan({ picks: { 'ok-1': { param: ' 10 ' }, 'bad id!': {} }, checkinMinutes: 7, blocks: [{ kind: 'home', items: ['a', 'b'] }, { kind: 'out', items: ['b', 'c'] }, { kind: 'pool', items: [] }] });
    expect(p.picks).toEqual({ 'ok-1': { param: '10' } });
    expect(p.blocks).toEqual([{ kind: 'home', items: ['a', 'b'] }, { kind: 'out', items: ['c'] }]);
    expect(p.checkinMinutes).toBeNull();
    expect(cleanPlan({ checkinMinutes: 30 }).checkinMinutes).toBe(30);
    expect(cleanPlan({ checkinMinutes: 0 }).checkinMinutes).toBe(0);
  });

  it('keeps words as they’re typed (the space or new line before the next word), and trims them after', () => {
    const typing = { title: 'Friday ', note: 'Wear the blue one.\n', picks: { 'ok-1': { param: 'the kitchen ' } } };
    const p = cleanPlan(typing, { typing: true });
    expect([p.title, p.note, p.picks['ok-1']?.param]).toEqual(['Friday ', 'Wear the blue one.\n', 'the kitchen ']);
    const done = cleanPlan(p);
    expect([done.title, done.note, done.picks['ok-1']?.param]).toEqual(['Friday', 'Wear the blue one.', 'the kitchen']);
    expect(cleanPlan({ title: 'x'.repeat(90) }, { typing: true }).title).toHaveLength(80);
  });

  it('tidies away picks no longer in the day (the arrival routine stays)', () => {
    const door = find(menu, 'Meet at the door with a drink');
    const fridge = find(menu, 'Clean the refrigerator, inside and out');
    const p = tidyPlan(menu, plan({ picks: { [door.id]: {}, [fridge.id]: {}, x: {} }, customs: [{ id: 'own', kind: 'domain', label: 'Mow', details: '', needs: [] }], blocks: [{ kind: 'home', items: [] }] }));
    expect(Object.keys(p.picks)).toEqual([door.id]);
    expect(p.customs).toEqual([]);
  });

  it('picks from before blocks go into the blocks (a plan made before they existed)', () => {
    const shower = find(menu, 'Shower');
    const note = find(menu, 'Write a love note');
    const fridge = find(menu, 'Clean the refrigerator, inside and out');
    const door = find(menu, 'Meet at the door with a drink');
    const old = cleanPlan({ picks: { [shower.id]: {}, [note.id]: {}, [fridge.id]: {}, [door.id]: {} } });
    expect(old.blocks).toEqual([]);
    const p = placeLoose(menu, { ...old, blocks: [{ kind: 'home', items: [] }] });
    expect(p.blocks[0]!.items.sort()).toEqual([shower.id, note.id, fridge.id].sort());
    expect(Object.keys(p.picks)).toContain(door.id);
    expect(planToTasks(menu, p).map((t) => t.title)).toEqual(['Getting ready', 'Clean the refrigerator, inside and out', 'Write a love note']);
  });

  it('a plan from before blocks comes over whole: rooms (with their evidence), story, prompt, own task; nothing dropped', () => {
    const m = cleanMenu({ ...menu, sections: menu.sections.map((s) => (s.kind === 'domain'
      ? { ...s, groups: [{ id: 'ev', title: 'Evidence', items: [{ id: 'ba', label: 'Before & after photos of each room', needs: [{ kind: 'photo', count: 2, label: 'before & after' }] }] }] } : s)) });
    const shower = find(m, 'Shower');
    const note = find(m, 'Write a love note');
    const door = find(m, 'Meet at the door with a drink');
    const old = {
      v: 1, title: 'Friday', pacing: 'p2', checkinMinutes: null,
      picks: { [shower.id]: {}, ba: {}, [note.id]: {}, [door.id]: {} },
      rooms: [{ room: 'Kitchen', note: 'Baseboards too' }, { room: '', note: '' }, { room: 'Office', note: '' }],
      roomNotes: 'Lemon spray',
      story: { on: true, players: 'R & B', setting: 'Cabin', arc: 'slow burn', note: '' },
      customPrompt: 'Why I love Sundays',
      customTask: { title: 'Iron the shirts', details: 'All five', needs: [{ kind: 'photo', count: 5 }] },
    };
    const up = upgradePlan(m, old);
    expect(up.checkinMinutes).toBe(0);
    expect(up.picks.ba).toBeUndefined();
    expect(up.customs.map((c) => c.label)).toEqual(['Clean: Kitchen', 'Clean: Office', 'Short story assignment', 'Writing prompt', 'Iron the shirts']);
    expect(up.customs[0]).toMatchObject({ kind: 'domain', details: 'Baseboards too\n\nLemon spray\n\nEvidence: Before & after photos of each room', needs: [{ kind: 'photo', count: 2, label: 'before & after' }] });
    // Into one 2-hour block: nothing is dropped, even past a part's count.
    const placed = tidyPlan(m, placeLoose(m, { ...up, blocks: [{ kind: 'home', items: [] }] }));
    const titles = planToTasks(m, placed).map((t) => t.title);
    expect(titles).toEqual(expect.arrayContaining(['Getting ready', 'Clean: Kitchen', 'Clean: Office', 'Write a love note', 'Short story assignment', 'Writing prompt', 'Iron the shirts']));
    expect(arrivalChecklist(m, placed)).toEqual(['Meet at the door with a drink']);
    // A plan made with blocks passes straight through.
    expect(upgradePlan(m, placed)).toEqual(cleanPlan(placed));
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

  it('a draft is its author’s: the other can watch it being built, not change, send or start it', () => {
    expect(ownsDraft('draft', 'sunny', 'sunny')).toBe(true);
    expect(ownsDraft('draft', 'sunny', 'kay')).toBe(false);
    expect(ownsDraft('proposed', 'sunny', 'kay')).toBe(true); // sent: it's the lead's to look at now
    expect(ownsDraft('accepted', 'sunny', 'kay')).toBe(true);
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

  it('nobody is stuck: once agreed or sent either of you can change the time or call it off; a proposal can be given a time or a “not now”', () => {
    for (const role of ['lead', 'follow'] as const) {
      expect(sceneTransition('accepted', 'offer', role)).toBe('offered');
      expect(sceneTransition('accepted', 'cancel', role)).toBe('draft');
      expect(sceneTransition('ready', 'cancel', role)).toBe('draft');
      expect(sceneTransition('proposed', 'withdraw', role)).toBe('draft');
    }
    expect(sceneTransition('offered', 'cancel', 'follow')).toBeNull();
    expect(sceneTransition('proposed', 'offer', 'lead')).toBe('offered');
    expect(sceneTransition('proposed', 'offer', 'follow')).toBeNull();
    expect(sceneTransition('active', 'cancel', 'lead')).toBeNull();
  });

  it('a roleplay asked for is on as soon as the other says yes, whoever leads it', () => {
    expect(sceneTransition('offered', 'accept_send', 'lead')).toBe('ready');
    expect(sceneTransition('offered', 'accept_send', 'follow')).toBe('ready');
    expect(sceneTransition('offered', 'accept_send', 'lead', true)).toBeNull();
    expect(sceneTransition('offered', 'accept_send', 'follow', true)).toBeNull();
  });

  it('aftercare comes after the inspection, never straight from the scene (rewards are earned there)', () => {
    expect(sceneTransition('active', 'aftercare', 'lead')).toBeNull();
    expect(sceneTransition('inspection', 'aftercare', 'lead')).toBe('aftercare');
    expect(sceneTransition('inspection', 'aftercare', 'follow')).toBeNull();
  });

  it('a roleplay has no inspection, scores or rewards: the lead ends it straight into aftercare', () => {
    expect(sceneTransition('active', 'inspect', 'lead', false, true)).toBeNull();
    expect(sceneTransition('active', 'aftercare', 'lead', false, true)).toBe('aftercare');
    expect(sceneTransition('active', 'aftercare', 'follow', false, true)).toBeNull();
    expect(sceneTransition('inspection', 'aftercare', 'lead', false, true)).toBeNull();
    expect(sceneTransition('aftercare', 'close', 'follow', false, true)).toBe('closed');
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
    // Getting ready: one from each group that has nothing yet (Shower was picked; Shoes gets one).
    const shoes = new Set(section(menu, 'presentation').groups.find((g) => g.title === 'Shoes')!.items.map((i) => i.id));
    expect(count(0, 'presentation')).toBe(2);
    expect(p.blocks[0]!.items.filter((id) => shoes.has(id))).toHaveLength(1);
    expect([count(0, 'domain'), count(0, 'tasks'), count(0, 'wishes')]).toEqual([2, 1, 1]);
    expect([count(1, 'changeover'), count(1, 'errands'), count(1, 'tasks'), count(1, 'wishes')]).toEqual([1, 2, 1, 1]);
    // The free hour fills with as many play activities as fit it (both of these: 2 min + about 20).
    expect(kinds(p, 2)).toEqual(['play', 'play']);
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
      expect(picked(menu, p, 'play').map((x) => x.item.id)[0]).toBe(play[0]!.id); // the new one first
      expect(picked(menu, p, 'tasks').map((x) => x.item.id)[0]).toBe(devotion[0]!.id);
      // The one room not cleaned lately goes first (later room chores that day reuse others).
      const rooms = Object.values(p.picks).map((x) => x.param).filter((r): r is string => !!r && menu.rooms.includes(r));
      if (rooms.length) expect(rooms).toContain(keep);
    }
    // Nothing new left: it repeats rather than leaving a gap.
    const all = recentlyUsed([cleanPlan({ ...emptyPlan(menu), picks: Object.fromEntries(play.map((i) => [i.id, {}])) })]);
    expect(picked(menu, autoFill(menu, cleanPlan({ ...emptyPlan(menu, 8) }), rand, undefined, all), 'play').length).toBeGreaterThan(0);
  });

  // A menu with several groups in each part, to see how Fill spreads its picks.
  const groups = (kind: string, spec: Record<string, { label: string; minutes?: number }[]>) => ({ kind, groups: Object.entries(spec).map(([title, items]) => ({ id: title, title, items: items.map((it, n) => ({ id: `${title}-${n}`.replace(/\W+/g, '-').toLowerCase(), ...it })) })) });
  const many = (title: string, n: number) => Array.from({ length: n }, (_, i) => ({ label: `${title} ${i + 1}` }));
  const wide = cleanMenu({
    ...menu,
    sections: menu.sections.map((sec) => {
      if (sec.kind === 'domain') return { ...sec, ...groups('domain', { Kitchen: many('Kitchen', 8), Bathrooms: many('Bath', 8), Laundry: many('Laundry', 8), 'With a twist': many('Twist', 8) }) };
      if (sec.kind === 'tasks') return { ...sec, ...groups('tasks', { Praise: many('Praise', 6), Writing: many('Writing', 6), Voice: many('Voice', 6) }) };
      if (sec.kind === 'play') return { ...sec, ...groups('play', { Tribute: [{ label: 'Tribute A' }, { label: 'Tribute B' }], Edging: [{ label: 'Edge 15', minutes: 15 }, { label: 'Edge 10', minutes: 10 }], Positions: [{ label: 'Kneel', minutes: 5 }, { label: 'Corner', minutes: 15 }] }) };
      return sec;
    }),
  });
  const groupOfIn = (m: typeof wide, kind: string) => new Map(section(m, kind as never).groups.flatMap((g) => g.items.map((i) => [i.id, g.title] as const)));

  it('two chores come from two different groups, so a twist turns up now and then', () => {
    const g = groupOfIn(wide, 'domain');
    let twists = 0;
    let blocks = 0;
    for (let n = 0; n < 200; n++) {
      const p = autoFill(wide, cleanPlan({ ...emptyPlan(wide, 2) }), Math.random);
      const chores = p.blocks[0]!.items.filter((id) => g.has(id)).map((id) => g.get(id));
      expect(chores).toHaveLength(2);
      expect(new Set(chores).size).toBe(2);
      blocks++;
      if (chores.includes('With a twist')) twists++;
    }
    // Two groups out of four: a twist in about half the blocks.
    expect(twists / blocks).toBeGreaterThan(0.3);
    expect(twists / blocks).toBeLessThan(0.7);
  });

  it('across the day, each devotion comes from a group the day hasn’t had yet', () => {
    const g = groupOfIn(wide, 'tasks');
    for (let n = 0; n < 20; n++) {
      const p = autoFill(wide, cleanPlan({ ...emptyPlan(wide, 6) }), Math.random, 6);
      const devotions = p.blocks.flatMap((b) => b.items).filter((id) => g.has(id)).map((id) => g.get(id));
      expect(devotions).toHaveLength(3);
      expect(new Set(devotions).size).toBe(3);
    }
  });

  it('the play break holds as many as fit the free time (countdowns, or about 20 minutes each)', () => {
    const g = groupOfIn(wide, 'play');
    const mins = (id: string) => ({ 'Edge 15': 15, 'Edge 10': 10, Kneel: 5, Corner: 15 } as Record<string, number>)[section(wide, 'play').groups.flatMap((x) => x.items).find((i) => i.id === id)!.label] ?? 20;
    for (const [hours, free] of [[8, 60], [9, 120]] as const) {
      for (let n = 0; n < 20; n++) {
        const p = autoFill(wide, cleanPlan({ ...emptyPlan(wide, 8) }), Math.random, hours);
        const play = p.blocks.find((b) => b.kind === 'free')!.items.filter((id) => g.has(id));
        const total = play.reduce((t, id) => t + mins(id), 0);
        expect(total).toBeLessThanOrEqual(free);
        // Nothing else would have fit.
        const left = section(wide, 'play').groups.flatMap((x) => x.items).filter((i) => !play.includes(i.id));
        expect(left.every((i) => total + mins(i.id) > free)).toBe(true);
        expect(new Set(play.slice(0, 3).map((id) => g.get(id))).size).toBe(Math.min(3, play.length)); // spread over the groups
      }
    }
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
