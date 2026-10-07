import { describe, expect, it } from 'vitest';
import { blockAt, blockMinutes, blocksForWindow, changeoverTiers, checkinOffsets, defaultBlocks, nextBlockCheckin, PREP_PER_GROUP, schedule, slotHasRoom, slotLabel, slotsFor } from '@/lib/blocks';

describe('the day in blocks', () => {
  it('getting ready takes up to 3 from each group (any number of groups); other parts have a cap', () => {
    const prep = slotsFor('home', true)[0]!;
    expect([prep.slot, prep.perGroup, PREP_PER_GROUP]).toEqual(['prep', 3, 3]);
    expect(slotHasRoom(prep, 20, 2)).toBe(true); // 20 picked across groups, 2 from this one
    expect(slotHasRoom(prep, 3, 3)).toBe(false); // this group has its 3
    expect(slotHasRoom(prep, 30, null)).toBe(true); // something written for this scene
    const chores = slotsFor('home', true)[1]!;
    expect([slotHasRoom(chores, 1, 1), slotHasRoom(chores, 2, 0), slotHasRoom(chores, 2, null)]).toEqual([true, false, false]);
  });

  it('a change-over suits the block it leads into: going out, or back to the chores', () => {
    const groups = ['Going out', 'Back to the chores', 'Fresh up', 'Ready for Kay (welcome home)'].map((title) => ({ title }));
    const titles = (t: { title: string }[][]) => t.map((x) => x.map((g) => g.title));
    expect(titles(changeoverTiers(groups, 'changeover', 'out'))).toEqual([['Going out'], ['Fresh up'], ['Back to the chores']]);
    expect(titles(changeoverTiers(groups, 'changeover', 'home'))).toEqual([['Back to the chores'], ['Fresh up'], ['Going out']]);
    expect(titles(changeoverTiers(groups, 'welcome', 'welcome'))).toEqual([['Ready for Kay (welcome home)']]);
    // A menu that doesn't sort them: any change-over will do (the welcome home's aside).
    const plain = [{ title: 'Into the next look' }, { title: 'Welcome home' }];
    expect(titles(changeoverTiers(plain, 'changeover', 'out'))).toEqual([['Into the next look']]);
    expect(titles(changeoverTiers([{ title: 'Changes' }], 'welcome', 'welcome'))).toEqual([['Changes']]);
  });

  it('2 hours is a block at home; 4 adds one out; 8 has a free hour and welcome home', () => {
    expect(defaultBlocks(2)).toEqual(['home']);
    expect(defaultBlocks(4)).toEqual(['home', 'out']);
    expect(defaultBlocks(6)).toEqual(['home', 'out', 'home']);
    expect(defaultBlocks(8)).toEqual(['home', 'out', 'free', 'home', 'welcome']);
    expect(defaultBlocks(1)).toEqual(['home']);
    expect(defaultBlocks(24)).toHaveLength(9);
    expect(schedule(defaultBlocks(24), 1440).find((b) => b.kind === 'free')).toMatchObject({ start: 240, end: 780 });
  });

  it('a work block is two hours: 30 minutes to get ready (15 to change after the first), the work, then 15 + 15 of praise', () => {
    expect(slotsFor('home', true).map((s) => [s.slot, s.minutes])).toEqual([['prep', 30], ['chores', 60], ['devotion', 15], ['wishes', 15]]);
    expect(slotsFor('out', false).map((s) => [s.slot, s.minutes])).toEqual([['changeover', 15], ['errands', 75], ['devotion', 15], ['wishes', 15]]);
    expect(blockMinutes('home', true)).toBe(120);
    expect(blockMinutes('home', false)).toBe(120);
    expect(slotsFor('home', true).find((s) => s.slot === 'chores')).toMatchObject({ min: 2, max: 2 });
  });

  it('times each block; spare time goes to the free hour, or a free stretch at the end', () => {
    const day = schedule(defaultBlocks(8), 480);
    expect(day.map((b) => [b.kind, b.start, b.end])).toEqual([['home', 0, 120], ['out', 120, 240], ['free', 240, 300], ['home', 300, 420], ['welcome', 420, 480]]);
    expect(schedule(defaultBlocks(9), 540).find((b) => b.kind === 'free')).toMatchObject({ start: 240, end: 360 });
    expect(schedule(['home'], 180).map((b) => [b.kind, b.start, b.end, b.extra ?? false])).toEqual([['home', 0, 120, false], ['free', 120, 180, true]]);
    expect(schedule(['home'], 130)).toHaveLength(1);
    expect(schedule(['home'], 60).map((b) => [b.start, b.end])).toEqual([[0, 60]]);
    expect(schedule(['home', 'out'], 180).map((b) => [b.start, b.end])).toEqual([[0, 90], [90, 180]]);
    expect(schedule(['home', 'out']).map((b) => b.first)).toEqual([true, false]);
  });

  it('a light day has one work block fewer', () => {
    expect(blocksForWindow(8, 'light')).toEqual(['home', 'out', 'free', 'welcome']);
    expect(blocksForWindow(4, 'light')).toEqual(['home']);
    expect(blocksForWindow(2, 'light')).toEqual(['home']);
    expect(blocksForWindow(8, 'full')).toEqual(defaultBlocks(8));
  });

  it('check-ins come at the end of each work block', () => {
    expect(checkinOffsets(schedule(defaultBlocks(8), 480))).toEqual([120, 240, 420]);
  });

  it('the next block-end check-in; one just before counts as done', () => {
    const base = new Date('2026-10-05T08:00:00Z');
    const at = (min: number) => new Date(base.getTime() + min * 60_000);
    expect(nextBlockCheckin(base, [120, 240], at(10), 60_000)).toEqual(at(120));
    expect(nextBlockCheckin(base, [240, 120], at(120), 60_000)).toEqual(at(240));
    expect(nextBlockCheckin(base, [120, 240], at(110), 60_000, 15)).toEqual(at(240));
    expect(nextBlockCheckin(base, [120, 240], at(250), 60_000)).toBeNull();
  });

  it('knows which block is on', () => {
    const day = schedule(defaultBlocks(8), 480);
    expect(blockAt(day, 0)).toBe(0);
    expect(blockAt(day, 250)).toBe(2);
    expect(blockAt(day, 480)).toBe(-1);
    expect(blockAt(day, -5)).toBe(-1);
  });

  it('says what each part is, with the lead’s title', () => {
    expect(slotsFor('home', false).map((s) => slotLabel(s, 'Captain Kay'))).toEqual(['Change-over (15 min)', 'Two chores', 'Devotion (15 min)', 'For Captain Kay (15 min)']);
  });
});
