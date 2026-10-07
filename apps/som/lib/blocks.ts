// A scene's day, in blocks. Each work block is two hours: getting ready
// (30 minutes for the first, a 15-minute change-over after that), the work
// (exactly two chores at home, or errands when out) and two short pieces of
// praise: one of devotion, one for the lead. A long day adds a free hour
// (on call) and a welcome-home hour at the end:
//
//   2 hours  home
//   4 hours  home · out
//   8 hours  home · out · free · home · welcome
//
// Time left over goes to the free hour (or a free stretch at the end).
// Check-ins come at the end of each work block. Pure.

import type { SectionKind } from './menu';
import type { Capacity } from './rules';

export type BlockKind = 'home' | 'out' | 'free' | 'welcome';
export const BLOCK_KINDS: BlockKind[] = ['home', 'out', 'free', 'welcome'];
export const isWork = (k: BlockKind) => k === 'home' || k === 'out';

export type Slot = 'prep' | 'changeover' | 'chores' | 'errands' | 'devotion' | 'wishes' | 'play' | 'welcome';

export interface SlotSpec {
  slot: Slot;
  /** The menu section it picks from. */
  kind: SectionKind;
  /** How many: at least, at most, and how many "Fill it for me" aims for. */
  min: number;
  max: number;
  fill: number;
  minutes: number;
  /** At most this many from each group of its section, instead of `max` overall (getting ready: up to 3 of each kind of thing). */
  perGroup?: number;
}

const S = (slot: Slot, kind: SectionKind, min: number, max: number, fill: number, minutes: number): SlotSpec => ({ slot, kind, min, max, fill, minutes });

export const BLOCK_MINUTES = 120;
export const PREP_PER_GROUP = 3;

/**
 * Whether one more fits a slot: `picked` is how many it has, `inGroup` how
 * many of those come from the group the new one is in (null for something
 * written for this scene, which belongs to no group).
 */
export function slotHasRoom(s: SlotSpec, picked: number, inGroup: number | null): boolean {
  if (!s.perGroup) return picked < s.max;
  return inGroup === null || inGroup < s.perGroup;
}

/**
 * What a block holds. The first work block starts with a full prep, later
 * ones with a change-over (and a little longer for the work), so every work
 * block is two hours.
 */
export function slotsFor(kind: BlockKind, first: boolean): SlotSpec[] {
  // Getting ready: up to 3 from each group (hair, makeup, shoes…); Fill it for me picks one of each, a whole look.
  const ready = first ? { ...S('prep', 'presentation', 1, Infinity, Infinity, 30), perGroup: PREP_PER_GROUP } : S('changeover', 'changeover', 1, 1, 1, 15);
  const work = BLOCK_MINUTES - ready.minutes - 30;
  const praise = [S('devotion', 'tasks', 1, 1, 1, 15), S('wishes', 'wishes', 1, 1, 1, 15)];
  switch (kind) {
    case 'home': return [ready, S('chores', 'domain', 2, 2, 2, work), ...praise];
    case 'out': return [ready, S('errands', 'errands', 1, 2, 2, work), ...praise];
    case 'free': return [S('play', 'play', 0, 1, 1, 60)];
    case 'welcome': return [S('welcome', 'changeover', 0, 1, 1, 60)];
  }
}

export function blockMinutes(kind: BlockKind, first: boolean): number {
  return slotsFor(kind, first).reduce((n, s) => n + s.minutes, 0);
}

/** The blocks for a length of time (hours). Past 16 hours, the rest is free time. */
export function defaultBlocks(hours: number): BlockKind[] {
  const n = Math.max(1, Math.min(8, Math.floor(hours / 2)));
  if (n < 4) return Array.from({ length: n }, (_, i) => (i % 2 ? 'out' : 'home'));
  // A long day: work blocks with a free hour after the second and welcome-home at the end.
  const work = Array.from({ length: n - 1 }, (_, i): BlockKind => (i % 2 ? 'out' : 'home'));
  return [...work.slice(0, 2), 'free', ...work.slice(2), 'welcome'];
}

/**
 * The blocks for an agreed window and how much the follow can take on: a
 * light day has one work block fewer (the time goes to free time).
 */
export function blocksForWindow(hours: number, capacity: Capacity | null = 'normal'): BlockKind[] {
  const blocks = defaultBlocks(hours);
  if (capacity !== 'light' || blocks.filter(isWork).length < 2) return blocks;
  const last = blocks.map(isWork).lastIndexOf(true);
  return blocks.filter((_, i) => i !== last);
}

export interface Timed { kind: BlockKind; first: boolean; start: number; end: number; extra?: boolean }

/**
 * When each block happens, in minutes from the start. With `total`, time
 * left over goes to the free hour, or becomes a free stretch at the end
 * (`extra`) if there's no free hour and it's 15 minutes or more.
 */
export function schedule(blocks: BlockKind[], total?: number): Timed[] {
  let firstSeen = false;
  const lens = blocks.map((kind) => {
    const first = isWork(kind) && !firstSeen;
    if (first) firstSeen = true;
    return { kind, first, len: blockMinutes(kind, first) };
  });
  const used = lens.reduce((n, b) => n + b.len, 0);
  // A window shorter than the blocks: each block shrinks to fit (a 1-hour scene is a 1-hour block).
  if (total && total < used) {
    let t = 0;
    return lens.map((b, i) => {
      const end = i === lens.length - 1 ? total : Math.round(t + (b.len * total) / used);
      const out = { kind: b.kind, first: b.first, start: t, end };
      t = end;
      return out;
    });
  }
  const spare = total && total > used ? total - used : 0;
  const freeAt = lens.findIndex((b) => b.kind === 'free');
  if (freeAt >= 0) lens[freeAt]!.len += spare;
  const out: Timed[] = [];
  let t = 0;
  for (const b of lens) {
    out.push({ kind: b.kind, first: b.first, start: t, end: t + b.len });
    t += b.len;
  }
  if (freeAt < 0 && spare >= 15) out.push({ kind: 'free', first: false, start: t, end: t + spare, extra: true });
  return out;
}

/** Check-ins: the end of each work block (minutes from the start). */
export function checkinOffsets(timed: Timed[]): number[] {
  return timed.filter((b) => isWork(b.kind)).map((b) => b.end);
}

/**
 * The next block-end check-in after `now`: `base` is when the scene started
 * (moved on by any pause). Just after a check-in, one due within `skip`
 * minutes counts as done.
 */
export function nextBlockCheckin(base: Date, offsets: number[], now: Date, minuteMs: number, skip = 0): Date | null {
  const after = now.getTime() + skip * minuteMs;
  const next = [...offsets].sort((a, b) => a - b).map((o) => base.getTime() + o * minuteMs).find((t) => t > after);
  return next === undefined ? null : new Date(next);
}

/** Which block is on at a moment (minutes from the start), or -1 before and after. */
export function blockAt(timed: Timed[], minutes: number): number {
  return timed.findIndex((b) => minutes >= b.start && minutes < b.end);
}

/** Change-over groups meant for the welcome home ("Welcome home", "Ready for {lead}"). */
export const WELCOME_GROUP = /welcome|ready for|home/i;

export const BLOCK_NAME: Record<BlockKind, string> = { home: 'Home', out: 'Out', free: 'Free time', welcome: 'Welcome home' };

/** "Getting ready (30 min)", "Chores: 2", "Devotion (15 min)", "For Captain Kay (15 min)"… */
export function slotLabel(s: SlotSpec, lead: string): string {
  switch (s.slot) {
    case 'prep': return 'Getting ready (30 min)';
    case 'changeover': return 'Change-over (15 min)';
    case 'chores': return 'Two chores';
    case 'errands': return 'Errands (one or two)';
    case 'devotion': return 'Devotion (15 min)';
    case 'wishes': return `For ${lead} (15 min)`;
    case 'play': return 'A play break (optional)';
    case 'welcome': return `Ready for ${lead} (optional)`;
  }
}
