// A scene's plan: what was picked from the menu, and the blanks filled in.
// The follow usually drafts it, the lead adjusts and starts it; starting
// turns it into the follow's tasks (planToTasks). Pure.

import { cleanProofs, itemsById, NEEDS, section, type Menu, type MenuItem, type Need, type Pacing, type Proof, type SectionKind } from './menu';
import type { Capacity } from './rules';

export interface Plan {
  v: 1;
  title: string;
  pacing: string | null;
  /** Picked menu items, with the blank filled in for items that have one. */
  picks: Record<string, { param?: string }>;
  rooms: { room: string; note: string }[];
  roomNotes: string;
  story: { on: boolean; players: string; setting: string; arc: string; note: string };
  customPrompt: string;
  customTask: { title: string; details: string; needs: Proof[] };
  note: string;
  /** Minutes between check-ins while the scene runs; null for none. */
  checkinMinutes: number | null;
}

export const CHECKIN_CHOICES = [15, 30, 45, 60, 90, 120];

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function emptyPlan(menu: Menu): Plan {
  const pace = menu.pacing[0] ?? null;
  return {
    v: 1,
    title: '',
    pacing: pace?.id ?? null,
    picks: {},
    rooms: Array.from({ length: pace?.rooms ?? 1 }, () => ({ room: '', note: '' })),
    roomNotes: '',
    story: { on: false, players: '', setting: '', arc: '', note: '' },
    customPrompt: '',
    customTask: { title: '', details: '', needs: [] },
    note: '',
    checkinMinutes: null,
  };
}

export function cleanPlan(raw: unknown): Plan {
  const r = (raw ?? {}) as Record<string, unknown>;
  const picks: Plan['picks'] = {};
  if (r.picks && typeof r.picks === 'object') {
    for (const [k, v] of Object.entries(r.picks as Record<string, unknown>).slice(0, 300)) {
      if (!/^[a-z0-9_-]{1,40}$/i.test(k)) continue;
      const param = str((v as { param?: unknown })?.param, 40);
      picks[k] = param ? { param } : {};
    }
  }
  const s = (r.story ?? {}) as Record<string, unknown>;
  const ct = (r.customTask ?? {}) as Record<string, unknown>;
  const every = typeof r.checkinMinutes === 'number' && CHECKIN_CHOICES.includes(r.checkinMinutes) ? r.checkinMinutes : null;
  return {
    v: 1,
    title: str(r.title, 80),
    pacing: typeof r.pacing === 'string' ? r.pacing.slice(0, 40) : null,
    picks,
    rooms: (Array.isArray(r.rooms) ? r.rooms : []).slice(0, 20).map((x) => ({ room: str((x as { room?: unknown })?.room, 60), note: str((x as { note?: unknown })?.note, 600) })),
    roomNotes: str(r.roomNotes, 1000),
    story: { on: s.on === true, players: str(s.players, 160), setting: str(s.setting, 160), arc: str(s.arc, 300), note: str(s.note, 1000) },
    customPrompt: str(r.customPrompt, 600),
    customTask: { title: str(ct.title, 120), details: str(ct.details, 1000), needs: cleanProofs(ct.needs) },
    note: str(r.note, 2000),
    checkinMinutes: every,
  };
}

export function pacingOf(menu: Menu, plan: Plan): Pacing | null {
  return menu.pacing.find((p) => p.id === plan.pacing) ?? null;
}

/** Picked items in one section, in menu order. */
export function picked(menu: Menu, plan: Plan, kind: SectionKind): { item: MenuItem; param?: string }[] {
  return section(menu, kind).groups.flatMap((g) => g.items.filter((i) => plan.picks[i.id]).map((item) => ({ item, param: plan.picks[item.id]?.param })));
}

/** How the picks compare with the pacing guide, section by section. */
export function pacingCheck(menu: Menu, plan: Plan): { rooms: [number, number]; play: [number, number]; praise: [number, number]; errands: boolean } | null {
  const p = pacingOf(menu, plan);
  if (!p) return null;
  const praise = picked(menu, plan, 'tasks').length + (plan.story.on ? 1 : 0) + (plan.customPrompt ? 1 : 0) + (plan.customTask.title ? 1 : 0);
  return {
    rooms: [plan.rooms.filter((r) => r.room).length, p.rooms],
    play: [picked(menu, plan, 'play').length, p.playBreaks],
    praise: [praise, p.praise],
    errands: p.errands,
  };
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
}

const one = (kind: Need): Proof[] => [{ kind, count: 1 }];
const isWriting = (n: Proof[]) => n.length === 1 && n[0]!.kind === 'text' && n[0]!.count === 1;

/** The follow's tasks for this plan, in the order of the sheet. */
export function planToTasks(menu: Menu, plan: Plan): TaskDraft[] {
  const tasks: TaskDraft[] = [];
  // Getting ready is one checklist; its proof is whatever the picks ask for (a photo if none do).
  const pres = picked(menu, plan, 'presentation');
  if (pres.length) {
    const presNeeds = pres.flatMap((p) => p.item.needs ?? []);
    tasks.push({ kind: 'presentation', title: 'Presentation', details: '', checklist: pres.map((p) => withParam(p.item.label, p.param, p.item.param)), needs: presNeeds.length ? presNeeds.map((n) => ({ ...n })) : one('photo') });
  }
  // Every room needs all the evidence picked (2 before & after photos and a note, say).
  const evidence = picked(menu, plan, 'domain');
  const needs = evidence.flatMap((e) => e.item.needs ?? []);
  for (const r of plan.rooms.filter((x) => x.room)) {
    tasks.push({
      kind: 'domain',
      title: `Clean: ${r.room}`,
      details: [r.note, plan.roomNotes].filter(Boolean).join('\n\n'),
      checklist: evidence.map((e) => e.item.label),
      needs: needs.length ? needs.map((n) => ({ ...n })) : one('photo'),
    });
  }
  for (const kind of ['errands', 'tasks', 'play'] as const) {
    for (const { item, param } of picked(menu, plan, kind)) {
      const wanted = item.needs ?? one(kind === 'tasks' ? 'text' : 'photo');
      tasks.push({
        kind,
        title: withParam(item.label, param, item.param),
        details: item.detail ?? '',
        checklist: [],
        needs: wanted.map((n) => ({ ...n })),
        minutes: item.minutes,
        writing: isWriting(wanted),
      });
    }
    if (kind === 'tasks') {
      if (plan.story.on) {
        const s = plan.story;
        const lines = [s.players && `Players: ${s.players}`, s.setting && `Setting: ${s.setting}`, s.arc && `Story arc & tags: ${s.arc}`, s.note && `Director’s note: ${s.note}`];
        tasks.push({ kind, title: 'Short story assignment', details: lines.filter(Boolean).join('\n'), checklist: [], needs: one('text'), writing: true });
      }
      if (plan.customPrompt) tasks.push({ kind, title: 'Writing prompt', details: plan.customPrompt, checklist: [], needs: one('text'), writing: true });
      if (plan.customTask.title) {
        const n = plan.customTask.needs;
        tasks.push({ kind, title: plan.customTask.title, details: plan.customTask.details, checklist: [], needs: n.map((x) => ({ ...x })), writing: isWriting(n) });
      }
    }
  }
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

/** Stale picks (items since removed from the menu) are simply ignored. */
export function livePicks(menu: Menu, plan: Plan): number {
  const all = itemsById(menu);
  return Object.keys(plan.picks).filter((k) => all.has(k)).length;
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
 * Fill it for me: tops the plan up to its pacing (rooms, play breaks,
 * praise tasks, errands) with picks from the menu, plus a little
 * presentation, evidence and an arrival routine if there's none yet.
 * Keeps everything already picked. `rand` is for tests.
 */
export function autoFill(menu: Menu, plan: Plan, rand: () => number = Math.random, windowHours?: number): Plan {
  const next = cleanPlan(structuredClone(plan));
  const pace = pacingOf(menu, next) ?? menu.pacing[0] ?? null;
  if (pace && !next.pacing) next.pacing = pace.id;
  const shuffle = <T,>(xs: T[]) => xs.map((x) => [rand(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);
  const pickFrom = (kind: SectionKind, n: number, oneEachGroup = false) => {
    if (n <= 0) return;
    const groups = section(menu, kind).groups.filter((g) => g.items.length);
    const pool = oneEachGroup
      ? shuffle(groups).map((g) => shuffle(g.items.filter((i) => !next.picks[i.id]))[0]).filter((i): i is MenuItem => !!i)
      : shuffle(groups.flatMap((g) => g.items).filter((i) => !next.picks[i.id]));
    for (const it of pool.slice(0, n)) next.picks[it.id] = it.param ? { param: defaultParam(it.param) } : {};
  };
  const have = (kind: SectionKind) => picked(menu, next, kind).length;

  // Rooms, as many as the pacing says.
  const want = pace?.rooms ?? 0;
  const chosen = next.rooms.filter((r) => r.room);
  const free = shuffle(menu.rooms.filter((r) => !chosen.some((c) => c.room === r)));
  while (chosen.length < want && free.length) chosen.push({ room: free.shift()!, note: '' });
  next.rooms = chosen.length ? chosen : next.rooms.slice(0, 1);
  if (chosen.length && !have('domain')) pickFrom('domain', 1);

  if (!have('presentation')) pickFrom('presentation', 3, true);
  const check = pacingCheck(menu, next);
  if (check) {
    pickFrom('tasks', check.praise[1] - check.praise[0]);
    pickFrom('play', check.play[1] - check.play[0]);
    if (check.errands && !have('errands')) pickFrom('errands', 1 + Math.floor(rand() * 2));
  }
  if (!have('arrival')) pickFrom('arrival', 3, true);
  // Check-ins follow how long it lasts (the window, if there is one), not how much is in it.
  if (!next.checkinMinutes && (windowHours ?? pace?.hours ?? 0) >= 4) next.checkinMinutes = 60;
  return cleanPlan(next);
}

/** A sensible number for a blank ("mins" → 10). */
function defaultParam(unit: string): string {
  if (/min/i.test(unit)) return '10';
  if (/hour/i.test(unit)) return '2';
  if (/day/i.test(unit)) return '3';
  if (/many|lash|stroke|times|lines/i.test(unit)) return '20';
  return '';
}

