import { describe, expect, it } from 'vitest';
import { cleanMenu, itemsById, proofText, section, SECTION_KINDS, starterMenu, type Menu } from '@/lib/menu';
import { arrivalChecklist, cleanPlan, emptyPlan, noProof, pacingCheck, planToTasks, proofComplete, proofProgress, withParam, type Plan } from '@/lib/plan';
import { allAgreed, canDelete, sceneTransition, taskTransition } from '@/lib/rules';

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
    expect(m.sections).toHaveLength(10);
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

  it('turns the picks into the follow’s tasks, in the order of the sheet', () => {
    const shower = find(menu, 'Shower');
    const photos = find(menu, 'Before & after photos of each room');
    const note = find(menu, 'Write a love note');
    const dance = find(menu, 'A dance, on video');
    const p = plan({
      picks: { [shower.id]: {}, [photos.id]: {}, [note.id]: {}, [dance.id]: {} },
      rooms: [{ room: 'Kitchen', note: 'Baseboards too' }, { room: '', note: '' }],
      roomNotes: 'Use the lemon spray',
      customTask: { title: 'Iron the shirts', details: 'All five', needs: [] },
    });
    const tasks = planToTasks(menu, p);
    expect(tasks.map((t) => t.title)).toEqual(['Presentation', 'Clean: Kitchen', 'Write a love note', 'Iron the shirts', 'A dance, on video']);
    expect(tasks[0]).toMatchObject({ checklist: ['Shower'], needs: [{ kind: 'photo', count: 1 }] });
    expect(tasks[1]).toMatchObject({ details: 'Baseboards too\n\nUse the lemon spray', checklist: ['Before & after photos of each room'], needs: [{ kind: 'photo', count: 2, label: 'before & after' }] });
    expect(tasks[2]).toMatchObject({ needs: [{ kind: 'text', count: 1 }], writing: true });
    expect(tasks[3]).toMatchObject({ needs: [], writing: false });
    expect(tasks[4]).toMatchObject({ needs: [{ kind: 'video', count: 1 }], minutes: 2 });
  });

  it('includes the story assignment and custom prompt as writing tasks', () => {
    const tasks = planToTasks(menu, plan({ story: { on: true, players: 'R & B', setting: 'Cabin', arc: 'slow burn', note: '' }, customPrompt: 'Why I love Sundays' }));
    expect(tasks.map((t) => t.title)).toEqual(['Short story assignment', 'Writing prompt']);
    expect(tasks[0]!.details).toBe('Players: R & B\nSetting: Cabin\nStory arc & tags: slow burn');
    expect(tasks.every((t) => t.writing)).toBe(true);
  });

  it('fills blanks in labels', () => {
    expect(withParam('Clamps for ___ mins', '10')).toBe('Clamps for 10 mins');
    expect(withParam('Massage', '30', 'mins')).toBe('Massage (30 mins)');
    expect(withParam('Massage', '30 mins', 'mins')).toBe('Massage (30 mins)');
  });

  it('ignores picks of items no longer on the menu', () => {
    expect(planToTasks(menu, plan({ picks: { gone12345: {} } }))).toEqual([]);
  });

  it('compares picks with the pacing guide', () => {
    const four = menu.pacing.find((x) => x.hours === 4)!;
    const p = plan({ pacing: four.id, rooms: [{ room: 'Kitchen', note: '' }], picks: { [find(menu, 'A dance, on video').id]: {} } });
    expect(pacingCheck(menu, p)).toEqual({ rooms: [1, 2], play: [1, 2], praise: [0, 2], errands: false });
  });

  it('lists the arrival routine picked', () => {
    const door = find(menu, 'Meet at the door with a drink');
    expect(arrivalChecklist(menu, plan({ picks: { [door.id]: {} } }))).toEqual(['Meet at the door with a drink']);
  });

  it('cleans plans: bad ids dropped, check-in only from the choices', () => {
    const p = cleanPlan({ picks: { 'ok-1': { param: ' 10 ' }, 'bad id!': {} }, checkinMinutes: 7 });
    expect(p.picks).toEqual({ 'ok-1': { param: '10' } });
    expect(p.checkinMinutes).toBeNull();
    expect(cleanPlan({ checkinMinutes: 30 }).checkinMinutes).toBe(30);
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

  it('several pieces of evidence add up per room, and a task can ask for many notes', () => {
    const photos = find(menu, 'Before & after photos of each room');
    const msg = find(menu, 'A message when each room is done');
    const aff = find(menu, 'Daily affirmations');
    const p = cleanPlan({ ...emptyPlan(menu), picks: { [photos.id]: {}, [msg.id]: {}, [aff.id]: {} }, rooms: [{ room: 'Kitchen', note: '' }] });
    const [room, affirm] = planToTasks(menu, p);
    expect(room!.needs).toEqual([{ kind: 'photo', count: 2, label: 'before & after' }, { kind: 'text', count: 1 }]);
    expect(affirm).toMatchObject({ needs: [{ kind: 'text', count: 10, label: 'affirmations' }, { kind: 'audio', count: 1, label: 'read aloud' }], writing: false });
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
    expect(planToTasks(m, cleanPlan({ ...emptyPlan(m), picks: { heels: {} } }))[0]!.needs).toEqual([{ kind: 'photo', count: 1 }]);
    expect(planToTasks(m, cleanPlan({ ...emptyPlan(m), picks: { heels: {}, face: {} } }))[0]!.needs).toEqual([{ kind: 'photo', count: 2, label: 'close-up' }]);
  });

  it('a custom task carries its own proof', () => {
    const p = cleanPlan({ ...emptyPlan(menu), customTask: { title: 'Outfit options', details: '', needs: [{ kind: 'photo', count: 5 }, 'video', { kind: 'nope' }] } });
    expect(planToTasks(menu, p)[0]!.needs).toEqual([{ kind: 'photo', count: 5 }, { kind: 'video', count: 1 }]);
  });
});
