// A scene's plan: its blocks (see lib/blocks.ts) and what's picked for each
// from the menu (with blanks filled in), plus anything written for this
// scene alone. The follow usually drafts it, the lead adjusts and starts
// or sends it; that turns it into the follow's tasks (planToTasks). Pure.

import { blocksForWindow, checkinOffsets, schedule, slotsFor, BLOCK_KINDS, WELCOME_GROUP, type BlockKind, type Slot } from './blocks';
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
}

export const CHECKIN_CHOICES = [15, 30, 45, 60, 90, 120];

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
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
  };
}

export function cleanPlan(raw: unknown): Plan {
  const r = (raw ?? {}) as Record<string, unknown>;
  const picks: Plan['picks'] = {};
  if (r.picks && typeof r.picks === 'object') {
    for (const [k, v] of Object.entries(r.picks as Record<string, unknown>).slice(0, 300)) {
      if (!ID.test(k)) continue;
      const param = str((v as { param?: unknown })?.param, 60);
      picks[k] = param ? { param } : {};
    }
  }
  const customs: CustomItem[] = (Array.isArray(r.customs) ? r.customs : []).slice(0, 40).flatMap((x) => {
    const c = (x ?? {}) as Record<string, unknown>;
    const label = str(c.label, 160);
    if (!label || typeof c.id !== 'string' || !ID.test(c.id) || !KINDS.has(c.kind as SectionKind)) return [];
    return [{ id: c.id, kind: c.kind as SectionKind, label, details: str(c.details, 1000), needs: cleanProofs(c.needs) }];
  });
  // Each thing in one block only.
  const placed = new Set<string>();
  const blocks: PlanBlock[] = (Array.isArray(r.blocks) ? r.blocks : []).slice(0, 10).flatMap((x) => {
    const b = (x ?? {}) as Record<string, unknown>;
    if (!BLOCK_KINDS.includes(b.kind as BlockKind)) return [];
    const items = (Array.isArray(b.items) ? b.items : []).filter((id): id is string => typeof id === 'string' && ID.test(id) && !placed.has(id)).slice(0, 12);
    items.forEach((id) => placed.add(id));
    return [{ kind: b.kind as BlockKind, items }];
  });
  const every = r.checkinMinutes === 0 ? 0 : typeof r.checkinMinutes === 'number' && CHECKIN_CHOICES.includes(r.checkinMinutes) ? r.checkinMinutes : null;
  return {
    v: 1,
    title: str(r.title, 80),
    pacing: typeof r.pacing === 'string' ? r.pacing.slice(0, 40) : null,
    picks,
    blocks,
    customs,
    note: str(r.note, 2000),
    checkinMinutes: every,
    roleplay: cleanRoleplay(r.roleplay),
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
    const here = b.items.map((id) => items.get(id)).filter((x): x is PlanItem => !!x);
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
 * Fill it for me: tops each block up (getting ready, two chores, errands,
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
  const take = (it: MenuItem, into?: PlanBlock) => {
    next.picks[it.id] = it.param ? { param: it.param === 'room' ? room() : defaultParam(it.param) } : {};
    into?.items.push(it.id);
    used.add(it.id);
  };
  const pool = (kind: SectionKind, oneEachGroup: boolean, slot?: Slot) => {
    const all = section(menu, kind).groups.filter((g) => g.items.length);
    // A change-over is between blocks; the welcome home has its own looks (when the menu has some).
    const welcome = slot === 'welcome' || slot === 'changeover' ? all.filter((g) => WELCOME_GROUP.test(g.title)) : [];
    const groups = slot === 'welcome' && welcome.length ? welcome : slot === 'changeover' && welcome.length < all.length ? all.filter((g) => !welcome.includes(g)) : all;
    const free = (xs: MenuItem[]) => shuffle(xs.filter((i) => !used.has(i.id) && !next.picks[i.id]), (i) => i.id);
    return oneEachGroup
      ? shuffle(groups).map((g) => free(g.items)[0]).filter((i): i is MenuItem => !!i).sort((a, b) => Number(avoid.has(a.id)) - Number(avoid.has(b.id)))
      : free(groups.flatMap((g) => g.items));
  };

  const timed = schedule(next.blocks.map((b) => b.kind));
  next.blocks.forEach((b, i) => {
    for (const s of slotsFor(b.kind, timed[i]?.first ?? false)) {
      const have = b.items.filter((id) => items.get(id)?.kind === s.kind).length;
      for (const it of pool(s.kind, s.slot === 'prep', s.slot).slice(0, Math.max(0, s.fill - have))) take(it, b);
    }
  });
  if (!picked(menu, next, 'arrival').length) for (const it of pool('arrival', true).slice(0, 3)) take(it);
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

