// A scene's plan: its blocks (see lib/blocks.ts) and what's picked for each
// from the menu (with blanks filled in), plus anything written for this
// scene alone. The follow usually drafts it, the lead adjusts and starts
// or sends it; that turns it into the follow's tasks (planToTasks). Pure.

import { blocksForWindow, changeoverTiers, checkinOffsets, itemMinutes, schedule, slotsFor, BLOCK_KINDS, type BlockKind, type Slot } from './blocks';
import { cleanProofs, cleanRoleplay, itemsById, NEEDS, section, SECTION_KINDS, type Menu, type MenuItem, type Need, type Pacing, type Proof, type Roleplay, type SectionKind } from './menu';
import type { Capacity } from './rules';

/** A block of the day, and the ids of what's picked for it (menu items or this scene's own). */
export interface PlanBlock { kind: BlockKind; items: string[] }

/** Something written for this scene alone ("Write your own"), in place of a menu item. */
export interface CustomItem { id: string; kind: SectionKind; label: string; details: string; needs: Proof[] }

export interface Plan {
  v: 1;
  title: string;
  pacing: string | null;
  /** Picked menu items, with the blank filled in for items that have one. Blocks say where each goes; arrival picks are for the whole day. */
  picks: Record<string, { param?: string }>;
  blocks: PlanBlock[];
  customs: CustomItem[];
  note: string;
  /** Minutes between check-ins; null for the end of each block, 0 for none. */
  checkinMinutes: number | null;
  /** The roleplay this scene is, copied from the menu when it was picked. */
  roleplay: Roleplay | null;
  /** The arrival routine as it was when the scene was started or sent: later menu changes don't touch it. */
  arrival?: string[];
  /** What the follow needs to get or have ready beforehand (equipment, new clothes…), one thing each. */
  ahead: string[];
}

export const CHECKIN_CHOICES = [15, 30, 45, 60, 90, 120];

/** The most one block holds (a long getting-ready, four chores, devotion, one for the lead…). */
export const BLOCK_ITEMS = 60;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
/** Words as typed: the space or new line just typed at the end stays (it's trimmed when the plan is loaded or sent). */
const typed = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const ID = /^[a-z0-9_-]{1,40}$/i;
const KINDS = new Set(SECTION_KINDS.map((k) => k.kind));

export function blocksFor(hours: number, capacity: Capacity | null = 'normal'): PlanBlock[] {
  return blocksForWindow(hours, capacity).map((kind) => ({ kind, items: [] }));
}

export function emptyPlan(menu: Menu, hours?: number, capacity?: Capacity | null): Plan {
  const pace = (hours ? pacingForHours(menu, hours) : null) ?? menu.pacing[0] ?? null;
  return {
    v: 1,
    title: '',
    pacing: pace?.id ?? null,
    picks: {},
    blocks: blocksFor(hours ?? pace?.hours ?? 2, capacity),
    customs: [],
    note: '',
    checkinMinutes: null,
    roleplay: null,
    ahead: [],
  };
}

/**
 * A plan with nothing out of place. `typing`: while someone types into it,
 * keeps their words exactly as typed (trimming as they type would eat each
 * space and new line before the next word arrives).
 */
export function cleanPlan(raw: unknown, { typing = false }: { typing?: boolean } = {}): Plan {
  const r = (raw ?? {}) as Record<string, unknown>;
  const text = typing ? typed : str;
  const picks: Plan['picks'] = {};
  if (r.picks && typeof r.picks === 'object') {
    for (const [k, v] of Object.entries(r.picks as Record<string, unknown>).slice(0, 300)) {
      if (!ID.test(k)) continue;
      const param = text((v as { param?: unknown })?.param, 60);
      picks[k] = param ? { param } : {};
    }
  }
  const customs: CustomItem[] = (Array.isArray(r.customs) ? r.customs : []).slice(0, 40).flatMap((x) => {
    const c = (x ?? {}) as Record<string, unknown>;
    const label = str(c.label, 160);
    if (!label || typeof c.id !== 'string' || !ID.test(c.id) || !KINDS.has(c.kind as SectionKind)) return [];
    return [{ id: c.id, kind: c.kind as SectionKind, label, details: str(c.details, 1000), needs: cleanProofs(c.needs) }];
  });
  // Each thing in one block only. A block holds plenty: getting ready alone can take three from each of its groups.
  const placed = new Set<string>();
  const blocks: PlanBlock[] = (Array.isArray(r.blocks) ? r.blocks : []).slice(0, 10).flatMap((x) => {
    const b = (x ?? {}) as Record<string, unknown>;
    if (!BLOCK_KINDS.includes(b.kind as BlockKind)) return [];
    const items = (Array.isArray(b.items) ? b.items : []).filter((id): id is string => typeof id === 'string' && ID.test(id) && !placed.has(id)).slice(0, BLOCK_ITEMS);
    items.forEach((id) => placed.add(id));
    return [{ kind: b.kind as BlockKind, items }];
  });
  const arrival = (Array.isArray(r.arrival) ? r.arrival : []).map((x) => str(x, 200)).filter(Boolean).slice(0, 40);
  const every = r.checkinMinutes === 0 ? 0 : typeof r.checkinMinutes === 'number' && CHECKIN_CHOICES.includes(r.checkinMinutes) ? r.checkinMinutes : null;
  return {
    v: 1,
    title: text(r.title, 80),
    pacing: typeof r.pacing === 'string' ? r.pacing.slice(0, 40) : null,
    picks,
    blocks,
    customs,
    note: text(r.note, 2000),
    checkinMinutes: every,
    roleplay: cleanRoleplay(r.roleplay),
    ...(arrival.length ? { arrival } : {}),
    ahead: (Array.isArray(r.ahead) ? r.ahead : []).map((x) => str(x, 200)).filter(Boolean).slice(0, 30),
  };
}

/** A thing in the plan, from the menu or written for this scene. */
export interface PlanItem { id: string; kind: SectionKind; label: string; detail?: string; needs?: Proof[]; minutes?: number; param?: string; custom?: boolean }

export function planItems(menu: Menu, plan: Plan): Map<string, PlanItem> {
  const out = new Map<string, PlanItem>();
  for (const [id, { item, section: s }] of itemsById(menu)) out.set(id, { ...item, kind: s.kind });
  for (const c of plan.customs) out.set(c.id, { id: c.id, kind: c.kind, label: c.label, detail: c.details, needs: c.needs, custom: true });
  return out;
}

/**
 * The room for a job picked into a block: the one another job from the same
 * group (area) already has there, so two jobs in an area are in one room.
 */
export function sharedRoom(menu: Menu, plan: Plan, block: number, id: string): string | undefined {
  const byId = itemsById(menu);
  const g = byId.get(id);
  if (g?.item.param !== 'room') return undefined;
  return plan.blocks[block]?.items.filter((x) => x !== id && byId.get(x)?.group.id === g.group.id && byId.get(x)?.item.param === 'room').map((x) => plan.picks[x]?.param).find(Boolean);
}

/**
 * Picks in the menu's order (its sections, groups and items; anything
 * written for the scene after), however they were picked: each part reads
 * the way the menu runs, the shower before the shoes. The menu's order is
 * the day's.
 */
export function inMenuOrder(items: Map<string, PlanItem>, ids: string[]): PlanItem[] {
  const rank = new Map([...items.keys()].map((id, i) => [id, i]));
  return ids.filter((id) => items.has(id)).sort((a, b) => rank.get(a)! - rank.get(b)!).map((id) => items.get(id)!);
}

/**
 * Drops what's no longer in the day: picks that aren't in a block (the
 * arrival routine aside, which is for the whole day) and own items taken out.
 */
export function tidyPlan(menu: Menu, plan: Plan): Plan {
  const placed = new Set(plan.blocks.flatMap((b) => b.items));
  const arrival = new Set(section(menu, 'arrival').groups.flatMap((g) => g.items.map((i) => i.id)));
  const picks = Object.fromEntries(Object.entries(plan.picks).filter(([id]) => placed.has(id) || arrival.has(id)));
  return { ...plan, picks, customs: plan.customs.filter((c) => placed.has(c.id)) };
}

/**
 * Puts picks that aren't in any block yet (a plan from before blocks) into
 * the first block with room for them in a part of their kind. The arrival
 * routine stays for the whole day; anything with no room is left out.
 */
export function placeLoose(menu: Menu, plan: Plan): Plan {
  const next = cleanPlan(structuredClone(plan));
  if (!next.blocks.length) return next;
  const items = planItems(menu, next);
  const placed = new Set(next.blocks.flatMap((b) => b.items));
  const timed = schedule(next.blocks.map((b) => b.kind));
  const slots = (i: number) => slotsFor(next.blocks[i]!.kind, timed[i]?.first ?? false);
  const loose = [...Object.keys(next.picks), ...next.customs.map((c) => c.id)];
  for (const id of loose) {
    const kind = items.get(id)?.kind;
    if (!kind || kind === 'arrival' || placed.has(id)) continue;
    const count = (i: number) => next.blocks[i]!.items.filter((x) => items.get(x)?.kind === kind).length;
    // A part with room for it; else any part of its kind (over its count, to trim); else the last block. Nothing is dropped.
    let at = next.blocks.findIndex((_, i) => slots(i).some((s) => s.kind === kind && count(i) < s.max));
    if (at < 0) at = next.blocks.findIndex((_, i) => slots(i).some((s) => s.kind === kind));
    if (at < 0) at = next.blocks.length - 1;
    next.blocks[at]!.items.push(id);
    placed.add(id);
  }
  return next;
}

/**
 * A plan saved before blocks existed (rooms, a story assignment, a writing
 * prompt, a task of your own), made into this version: each becomes one of
 * this scene's own items, the evidence picked for rooms goes onto every
 * room as before, and "no check-ins" stays none. Nothing is lost; the
 * builder then puts it all into blocks (placeLoose). Newer plans pass
 * straight through.
 */
export function upgradePlan(menu: Menu, raw: unknown): Plan {
  const plan = cleanPlan(raw);
  const r = (raw ?? {}) as Record<string, unknown>;
  if (Array.isArray(r.blocks)) return plan;
  const items = planItems(menu, plan);
  // In that version, what was picked under Domain was the evidence for every room.
  const evidence = Object.keys(plan.picks).map((id) => items.get(id)).filter((i): i is PlanItem => i?.kind === 'domain');
  const evidenceNeeds = evidence.flatMap((e) => e.needs ?? []).map((n) => ({ ...n }));
  const picks = Object.fromEntries(Object.entries(plan.picks).filter(([id]) => items.get(id)?.kind !== 'domain'));
  const customs: CustomItem[] = [];
  const roomNotes = str(r.roomNotes, 1000);
  (Array.isArray(r.rooms) ? r.rooms : []).slice(0, 20).forEach((x, i) => {
    const room = str((x as { room?: unknown })?.room, 60);
    if (!room) return;
    const details = [str((x as { note?: unknown })?.note, 600), roomNotes, evidence.length ? `Evidence: ${evidence.map((e) => e.label).join('; ')}` : ''];
    customs.push({ id: `old-room-${i}`, kind: 'domain', label: `Clean: ${room}`, details: details.filter(Boolean).join('\n\n'), needs: evidenceNeeds.length ? evidenceNeeds : one('photo') });
  });
  const st = (r.story ?? {}) as Record<string, unknown>;
  if (st.on === true) {
    const lines = [['Players', st.players], ['Setting', st.setting], ['Story arc & tags', st.arc], ['Director’s note', st.note]]
      .map(([k, v]) => (str(v, 1000) ? `${k}: ${str(v, 1000)}` : '')).filter(Boolean);
    customs.push({ id: 'old-story', kind: 'tasks', label: 'Short story assignment', details: lines.join('\n'), needs: one('text') });
  }
  const prompt = str(r.customPrompt, 1000);
  if (prompt) customs.push({ id: 'old-prompt', kind: 'tasks', label: 'Writing prompt', details: prompt, needs: one('text') });
  const ct = (r.customTask ?? {}) as Record<string, unknown>;
  const ctTitle = str(ct.title, 160);
  if (ctTitle) customs.push({ id: 'old-task', kind: 'tasks', label: ctTitle, details: str(ct.details, 1000), needs: cleanProofs(ct.needs) });
  return { ...plan, picks, customs: [...plan.customs, ...customs].slice(0, 40), checkinMinutes: r.checkinMinutes == null ? 0 : plan.checkinMinutes };
}

/**
 * When the follow checks in: every so many minutes, or at the end of each
 * work block that has something in it (minutes from the start), or never.
 */
export function planCheckins(plan: Plan, totalMinutes?: number): { every: number | null; at: number[] } {
  if (plan.checkinMinutes) return { every: plan.checkinMinutes, at: [] };
  if (plan.checkinMinutes === 0) return { every: null, at: [] };
  const timed = schedule(plan.blocks.map((b) => b.kind), totalMinutes);
  return { every: null, at: checkinOffsets(timed.filter((_, i) => plan.blocks[i]?.items.length)) };
}

export function pacingOf(menu: Menu, plan: Plan): Pacing | null {
  return menu.pacing.find((p) => p.id === plan.pacing) ?? null;
}

/** Picked items in one section, in menu order. */
export function picked(menu: Menu, plan: Plan, kind: SectionKind): { item: MenuItem; param?: string }[] {
  return section(menu, kind).groups.flatMap((g) => g.items.filter((i) => plan.picks[i.id]).map((item) => ({ item, param: plan.picks[item.id]?.param })));
}

/** "Clamps for ___ mins" with "10" → "Clamps for 10 mins". */
export function withParam(label: string, param?: string, unit?: string): string {
  if (!param) return label;
  if (label.includes('___')) return label.replace(/_{3,}/, param);
  return `${label} (${param}${unit && !param.includes(unit) ? ` ${unit}` : ''})`;
}

/** Where a task came from: a menu section, or a demand the lead added while it ran. */
export type TaskKind = SectionKind | 'demand';

export interface TaskDraft {
  kind: TaskKind;
  title: string;
  details: string;
  checklist: string[];
  /** Proof to send: any number of photos, videos, voice notes and notes. */
  needs: Proof[];
  minutes?: number;
  /** One long piece of writing (a story, a letter) rather than notes. */
  writing?: boolean;
  /** Which block of the day it's in (plan.blocks), if any. */
  block?: number;
}

const one = (kind: Need): Proof[] => [{ kind, count: 1 }];
const isWriting = (n: Proof[]) => n.length === 1 && n[0]!.kind === 'text' && n[0]!.count === 1;

/**
 * The follow's tasks for this plan, block by block, in the order each block
 * runs: getting ready (one checklist), then each thing picked.
 */
export function planToTasks(menu: Menu, plan: Plan): TaskDraft[] {
  const items = planItems(menu, plan);
  const timed = schedule(plan.blocks.map((b) => b.kind));
  const tasks: TaskDraft[] = [];
  plan.blocks.forEach((b, i) => {
    const here = inMenuOrder(items, b.items);
    const done = new Set<string>();
    const slots = slotsFor(b.kind, timed[i]?.first ?? false);
    const fitted = slots.map((s) => [s, here.filter((it) => it.kind === s.kind)] as const);
    // Anything that no longer fits a slot (the menu changed since) still goes in, at the end.
    const rest = here.filter((it) => !slots.some((s) => s.kind === it.kind));
    for (const [s, its] of [...fitted, [null, rest] as const]) {
      const fresh = its.filter((it) => !done.has(it.id));
      fresh.forEach((it) => done.add(it.id));
      if (!fresh.length) continue;
      if (s?.slot === 'prep') {
        // Getting ready is one checklist; its proof is whatever the picks ask for (a photo if none do).
        const needs = fresh.flatMap((it) => it.needs ?? []);
        tasks.push({ kind: 'presentation', title: 'Getting ready', details: '', checklist: fresh.map((it) => withParam(it.label, plan.picks[it.id]?.param, it.param)), needs: needs.length ? needs.map((n) => ({ ...n })) : one('photo'), block: i });
        continue;
      }
      for (const it of fresh) {
        const wanted = it.needs?.length ? it.needs : one(it.kind === 'tasks' || it.kind === 'wishes' ? 'text' : 'photo');
        tasks.push({
          kind: it.kind,
          title: withParam(it.label, plan.picks[it.id]?.param, it.param),
          details: it.detail ?? '',
          checklist: [],
          needs: wanted.map((n) => ({ ...n })),
          ...(it.minutes ? { minutes: it.minutes } : {}),
          writing: isWriting(wanted),
          block: i,
        });
      }
    }
  });
  return tasks;
}

export type ProofCounts = Record<Need, number>;
export const noProof = (): ProofCounts => ({ photo: 0, video: 0, audio: 0, text: 0 });

/**
 * How much of each kind of proof is in, against what's needed (several
 * proofs of one kind add up: 2 before & after photos + 1 of the finished
 * room = 3 photos). Only kinds the task asks for are listed.
 */
export function proofProgress(needs: Proof[], sent: ProofCounts): { kind: Need; have: number; want: number; labels: string[] }[] {
  return NEEDS.flatMap((kind) => {
    const of = needs.filter((n) => n.kind === kind);
    if (!of.length) return [];
    const want = of.reduce((a, n) => a + n.count, 0);
    return [{ kind, have: Math.min(sent[kind], want), want, labels: of.map((n) => n.label).filter((l): l is string => !!l) }];
  });
}

export function proofComplete(needs: Proof[], sent: ProofCounts): boolean {
  return proofProgress(needs, sent).every((p) => p.have >= p.want);
}

/** The arrival checklist the lead picked (shown when they're on the way). */
export function arrivalChecklist(menu: Menu, plan: Plan): string[] {
  if (plan.arrival?.length) return plan.arrival;
  return picked(menu, plan, 'arrival').map((p) => withParam(p.item.label, p.param, p.item.param));
}

/** The pacing closest to a length in hours (an offer says "8 hours"). */
export function pacingForHours(menu: Menu, hours: number): Pacing | null {
  if (!menu.pacing.length) return null;
  return menu.pacing.reduce((best, p) => (Math.abs(p.hours - hours) < Math.abs(best.hours - hours) ? p : best));
}

/**
 * The pacing for a window and how much the follow can take on: the one
 * nearest the window's length, a step lighter for a light day and a step
 * fuller for a full one.
 */
export function pacingFor(menu: Menu, hours: number, capacity: Capacity = 'normal'): Pacing | null {
  const base = pacingForHours(menu, hours);
  if (!base || capacity === 'normal') return base;
  const byLoad = [...menu.pacing].sort((a, b) => a.hours - b.hours);
  const i = byLoad.indexOf(base) + (capacity === 'light' ? -1 : 1);
  return byLoad[Math.max(0, Math.min(byLoad.length - 1, i))] ?? base;
}

/**
 * Fill it for me: tops each block up (getting ready, chores, errands,
 * devotion, one for the lead; a play break in the free hour; a change for
 * the welcome home) and the arrival routine, from the menu. Nothing twice
 * in a day, and whatever recent scenes used (`avoid`: ids, and rooms as
 * "room:<name>") only once nothing new is left. Keeps everything already
 * picked. `rand` is for tests.
 */
export function autoFill(menu: Menu, plan: Plan, rand: () => number = Math.random, windowHours?: number, avoid: ReadonlySet<string> = new Set()): Plan {
  const next = tidyPlan(menu, cleanPlan(structuredClone(plan)));
  const pace = pacingOf(menu, next) ?? menu.pacing[0] ?? null;
  if (pace && !next.pacing) next.pacing = pace.id;
  if (!next.blocks.length) next.blocks = blocksFor(windowHours ?? pace?.hours ?? 2);
  const items = planItems(menu, next);
  // Shuffled, with anything done recently last: new first, repeats only if nothing new is left.
  const shuffle = <T,>(xs: T[], key?: (x: T) => string) => xs.map((x) => [(key && avoid.has(key(x)) ? 1 : 0) + rand(), x] as const)
    .sort((a, b) => a[0] - b[0]).map(([, x]) => x);
  const used = new Set(next.blocks.flatMap((b) => b.items));
  const roomsToday = new Set(Object.entries(next.picks).filter(([id]) => items.get(id)?.param === 'room').map(([, v]) => v.param).filter(Boolean));
  const room = () => {
    const r = shuffle(menu.rooms.filter((x) => !roomsToday.has(x)), (x) => `room:${x}`)[0] ?? shuffle(menu.rooms, (x) => `room:${x}`)[0] ?? '';
    roomsToday.add(r);
    return r;
  };
  const groupOf = new Map(menu.sections.flatMap((sec) => sec.groups.flatMap((g) => g.items.map((it) => [it.id, g.id] as const))));
  const take = (it: MenuItem, into?: PlanBlock) => {
    // Two jobs from one area in a block are in the same room.
    const same = it.param === 'room' ? into?.items.map((x) => (groupOf.get(x) === groupOf.get(it.id) && items.get(x)?.param === 'room' ? next.picks[x]?.param : undefined)).find(Boolean) : undefined;
    next.picks[it.id] = it.param ? { param: it.param === 'room' ? (same ?? room()) : defaultParam(it.param) } : {};
    into?.items.push(it.id);
    used.add(it.id);
  };
  // A part's groups, best fit first: a change-over suits the block it leads into, the welcome home has its own looks.
  const tiersFor = (kind: SectionKind, slot: Slot | undefined, into: BlockKind) => {
    const all = section(menu, kind).groups.filter((g) => g.items.length);
    return slot === 'welcome' || slot === 'changeover' ? changeoverTiers(all, slot, into) : [all];
  };
  const free = (xs: MenuItem[]) => shuffle(xs.filter((i) => !used.has(i.id) && !next.picks[i.id]), (i) => i.id);
  // Which groups each part has drawn from today: the next pick prefers one it hasn't, so the day varies.
  const drawn = new Map<SectionKind, Set<string>>();
  const mark = (kind: SectionKind, id: string) => {
    const g = groupOf.get(id);
    if (g) drawn.set(kind, (drawn.get(kind) ?? new Set()).add(g));
  };
  for (const id of next.blocks.flatMap((b) => b.items)) { const k = items.get(id)?.kind; if (k) mark(k, id); }
  /**
   * Candidates for a part, spread over its groups: one from each group in
   * turn (groups not drawn from today first), what recent scenes didn't use
   * first. The first few always come from different groups. Groups that fit
   * better (a change-over's) all come before the rest.
   */
  const spread = (kind: SectionKind, slot?: Slot, skip: ReadonlySet<string | undefined> = new Set(), into: BlockKind = 'home') => {
    const seen = drawn.get(kind) ?? new Set<string>();
    const out: MenuItem[] = [];
    for (const tier of tiersFor(kind, slot, into)) {
      const groups = tier.filter((g) => !skip.has(g.id));
      const lists = [...shuffle(groups.filter((g) => !seen.has(g.id))), ...shuffle(groups.filter((g) => seen.has(g.id)))].map((g) => free(g.items));
      // Within a round, what recent scenes didn't use still comes first.
      for (let round = 0; lists.some((l) => l.length > round); round++) {
        out.push(...lists.flatMap((l) => l[round] ? [l[round]!] : []).sort((a, b) => Number(avoid.has(a.id)) - Number(avoid.has(b.id))));
      }
    }
    return out;
  };

  const timed = schedule(next.blocks.map((b) => b.kind), windowHours ? Math.round(windowHours * 60) : undefined);
  // Every part, block by block; the free hour's play last, so each block's own play break gets one first.
  const parts = next.blocks.flatMap((b, i) => slotsFor(b.kind, timed[i]?.first ?? false).map((s) => ({ b, i, s })));
  for (const { b, i, s } of [...parts.filter((x) => !x.s.byTime), ...parts.filter((x) => x.s.byTime)]) {
    const mine = b.items.filter((id) => items.get(id)?.kind === s.kind);
    const add = (it: MenuItem) => { take(it, b); mark(s.kind, it.id); };
    if (s.perGroup && s.maxGroups) {
      // Chores: two areas (the one already started counts), up to two jobs in each, the areas the day hasn't had first.
      const has = new Map<string, number>();
      for (const id of mine) { const g = groupOf.get(id); if (g) has.set(g, (has.get(g) ?? 0) + 1); }
      let n = mine.length;
      for (const it of spread(s.kind, s.slot, undefined, b.kind)) {
        const g = groupOf.get(it.id)!;
        const k = has.get(g) ?? 0;
        if (n >= s.fill) break;
        if (k >= s.perGroup || (!k && has.size >= s.maxGroups)) continue;
        has.set(g, k + 1);
        add(it);
        n++;
      }
    } else if (s.perGroup) {
      // Getting ready: one from each group that has nothing yet, a whole look around what's picked.
      const has = new Set(mine.map((id) => groupOf.get(id)));
      for (const it of spread(s.kind, s.slot, has)) if (!has.has(groupOf.get(it.id))) { has.add(groupOf.get(it.id)); add(it); }
    } else if (s.byTime) {
      // The play break: as many as fit the free time (each its countdown, or the usual length).
      const length = timed[i] ? timed[i]!.end - timed[i]!.start : s.minutes;
      let usedMin = mine.reduce((n, id) => n + itemMinutes(s, items.get(id)?.minutes), 0);
      for (const it of spread(s.kind, s.slot)) {
        const m = itemMinutes(s, it.minutes);
        if (usedMin + m <= length) { add(it); usedMin += m; }
      }
    } else {
      // Each from a different group while there are others: one way to go and one place to go on errands, say.
      const has = new Set(mine.map((id) => groupOf.get(id)));
      const want = Math.max(0, s.fill - mine.length);
      const cands = spread(s.kind, s.slot, undefined, b.kind);
      const fresh = cands.filter((it) => !has.has(groupOf.get(it.id)));
      for (const it of [...fresh, ...cands.filter((it) => !fresh.includes(it))].slice(0, want)) add(it);
    }
  }
  // The arrival routine: one from each of its groups, in its order (where, how, the greeting, the service…), and at least three.
  const steps = Math.max(3, section(menu, 'arrival').groups.filter((g) => g.items.length).length);
  if (!picked(menu, next, 'arrival').length) for (const it of spread('arrival').slice(0, steps)) take(it);
  return cleanPlan(next);
}

/** What recent scenes used (picks, and blanks like rooms as "room:<name>"), for Fill it for me to steer away from. */
export function recentlyUsed(plans: Plan[]): Set<string> {
  const out = new Set<string>();
  for (const p of plans) {
    for (const [id, v] of Object.entries(p.picks)) {
      out.add(id);
      if (v.param) out.add(`room:${v.param}`);
    }
  }
  return out;
}

/** How often each roleplay has been played, and when last, from past scenes. */
export function roleplayHistory(scenes: { plan: Plan | null; started_at: string | null }[]): Record<string, { count: number; last: string }> {
  const out: Record<string, { count: number; last: string }> = {};
  for (const s of scenes) {
    const id = s.plan?.roleplay?.id;
    if (!id || !s.started_at) continue;
    const h = out[id] ?? { count: 0, last: s.started_at };
    out[id] = { count: h.count + 1, last: s.started_at > h.last ? s.started_at : h.last };
  }
  return out;
}

/** A sensible number for a blank ("mins" → 10). */
function defaultParam(unit: string): string {
  if (/min/i.test(unit)) return '10';
  if (/hour/i.test(unit)) return '2';
  if (/day/i.test(unit)) return '3';
  if (/many|lash|stroke|times|lines/i.test(unit)) return '20';
  return '';
}

