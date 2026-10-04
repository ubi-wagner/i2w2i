// A member's profile in a pod: how much they like each thing, giving and
// receiving (0–5), and notes in their own words (limits, signals, aftercare,
// sizes, favourites…). Encrypted with the pod key like everything else, so
// the pod can read it and the server can't. The things to rate are the
// built-in list (lib/inventory-data.ts, for pod members only) plus the pod's
// own (menu.inventory). Pure: runs in the browser and in tests.

import { newId, type RateSection } from './menu';

export type Score = 0 | 1 | 2 | 3 | 4 | 5;
export const SCORES: Score[] = [0, 1, 2, 3, 4, 5];
export const SCALE: Record<Score, string> = { 0: 'Never', 1: 'Not my thing', 2: 'Maybe', 3: 'Like it', 4: 'Love it', 5: 'Can’t wait' };

export interface Rating { give?: Score; recv?: Score }

/** How someone feels about a roleplay: quick, before or after playing it. */
export type Feel = 'love' | 'ok' | 'no';
export const FEELS: Feel[] = ['love', 'ok', 'no'];
export const FEEL: Record<Feel, { icon: string; label: string }> = {
  love: { icon: '❤️', label: 'Love it' },
  ok: { icon: '👍', label: 'It’s OK' },
  no: { icon: '👎', label: 'Not for me' },
};
export interface RoleplayFeel { feel?: Feel; loved?: string; disliked?: string }

export const ABOUT = [
  { key: 'called', label: 'What I like to be called' },
  { key: 'callYou', label: 'What I’d like to call you' },
  { key: 'hard', label: 'Hard limits: never' },
  { key: 'soft', label: 'Soft limits: ask me first' },
  { key: 'signals', label: 'Safeword and signals' },
  { key: 'aftercare', label: 'Aftercare I need' },
  { key: 'body', label: 'Body notes: injuries, allergies, things to avoid' },
  { key: 'turnons', label: 'What gets me going' },
  { key: 'turnoffs', label: 'Mood killers' },
  { key: 'fantasies', label: 'Fantasies and things I’d like to try' },
  { key: 'sizes', label: 'Sizes: clothes, shoes, lingerie, rings' },
  { key: 'favourites', label: 'Favourite treats, drinks, flowers, scents' },
] as const;
export type AboutKey = (typeof ABOUT)[number]['key'];

export interface Profile {
  v: 1;
  ratings: Record<string, Rating>;
  about: Record<AboutKey, string>;
  /** Quick loves and dislikes for each roleplay, by its id. */
  roleplays: Record<string, RoleplayFeel>;
}

export function emptyProfile(): Profile {
  return { v: 1, ratings: {}, about: Object.fromEntries(ABOUT.map((a) => [a.key, ''])) as Record<AboutKey, string>, roleplays: {} };
}

const score = (v: unknown): Score | undefined => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 5 ? (v as Score) : undefined);

export function cleanProfile(raw: unknown): Profile {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out = emptyProfile();
  const about = (r.about ?? {}) as Record<string, unknown>;
  for (const a of ABOUT) out.about[a.key] = typeof about[a.key] === 'string' ? (about[a.key] as string).trim().slice(0, 2000) : '';
  if (r.ratings && typeof r.ratings === 'object') {
    for (const [k, v] of Object.entries(r.ratings as Record<string, unknown>).slice(0, 1000)) {
      if (!/^[a-z0-9_-]{1,40}$/i.test(k)) continue;
      const x = (v ?? {}) as Record<string, unknown>;
      const rating: Rating = {};
      const give = score(x.give);
      const recv = score(x.recv);
      if (give !== undefined) rating.give = give;
      if (recv !== undefined) rating.recv = recv;
      if (give !== undefined || recv !== undefined) out.ratings[k] = rating;
    }
  }
  if (r.roleplays && typeof r.roleplays === 'object') {
    for (const [k, v] of Object.entries(r.roleplays as Record<string, unknown>).slice(0, 200)) {
      if (!/^[a-z0-9_-]{1,40}$/i.test(k)) continue;
      const x = (v ?? {}) as Record<string, unknown>;
      const f: RoleplayFeel = {};
      if (FEELS.includes(x.feel as Feel)) f.feel = x.feel as Feel;
      for (const key of ['loved', 'disliked'] as const) {
        const t = typeof x[key] === 'string' ? (x[key] as string).trim().slice(0, 500) : '';
        if (t) f[key] = t;
      }
      if (f.feel || f.loved || f.disliked) out.roleplays[k] = f;
    }
  }
  return out;
}

/** Roleplays everyone here loves (in the order given). */
export function lovedByAll<T extends { id: string }>(roleplays: T[], profiles: Profile[]): T[] {
  return profiles.length ? roleplays.filter((r) => profiles.every((p) => p.roleplays[r.id]?.feel === 'love')) : [];
}

/** Everything to rate: the built-in list (unless the pod turned it off) and the pod's own. */
export function rateSections(builtIn: RateSection[], own: RateSection[], useBuiltIn: boolean): RateSection[] {
  return [...(useBuiltIn ? builtIn : []), ...own];
}

/** How many of these things they've rated at all. */
export function ratedCount(sections: RateSection[], p: Profile): number {
  return sections.reduce((n, s) => n + s.items.filter((i) => p.ratings[i.id]).length, 0);
}

export interface Match {
  id: string;
  label: string;
  section: string;
  /** "give": I'd give it and they'd receive it; "recv": the other way. */
  way: 'give' | 'recv';
  mine: Score;
  theirs: Score;
}

/**
 * Where two profiles meet: each thing one of you would give and the other
 * would receive. Both keen (3+) is a yes; one keen and the other a maybe is
 * worth talking about; a 0 from either is off the table. Only things you've
 * both rated count.
 */
export function matches(sections: RateSection[], mine: Profile, theirs: Profile): { yes: Match[]; talk: Match[]; no: Match[] } {
  const yes: Match[] = [];
  const talk: Match[] = [];
  const no: Match[] = [];
  for (const s of sections) {
    for (const i of s.items) {
      const a = mine.ratings[i.id];
      const b = theirs.ratings[i.id];
      if (!a || !b) continue;
      for (const [way, m, t] of [['give', a.give, b.recv], ['recv', a.recv, b.give]] as const) {
        if (m === undefined || t === undefined) continue;
        const x: Match = { id: i.id, label: i.label, section: s.title, way, mine: m, theirs: t };
        if (m === 0 || t === 0) no.push(x);
        else if (m >= 3 && t >= 3) yes.push(x);
        else if ((m >= 3 && t === 2) || (m === 2 && t >= 3)) talk.push(x);
      }
    }
  }
  yes.sort((x, y) => y.mine + y.theirs - (x.mine + x.theirs));
  return { yes, talk, no };
}

// ── The pod's own list, as text ─────────────────────────────────────────────
//   ## Section
//   - A thing to rate

export function rateSectionsToText(sections: RateSection[]): string {
  return `${sections.map((s) => [`## ${s.title}`, ...s.items.map((i) => `- ${i.label}`)].join('\n')).join('\n\n')}\n`;
}

/** Reads a list; things already in `prev` (same section and wording) keep their ids, and so their ratings. */
export function textToRateSections(text: string, prev: RateSection[] = []): { sections: RateSection[]; warnings: string[] } {
  const sections: RateSection[] = [];
  const warnings: string[] = [];
  const key = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  text.split(/\r?\n/).forEach((raw, i) => {
    const t = raw.trim();
    if (!t || /^#\s/.test(t)) return;
    const h = /^#{2,}\s*(.+)$/.exec(t);
    if (h) {
      const title = h[1]!.trim();
      const old = prev.find((s) => key(s.title) === key(title));
      sections.push({ id: old?.id ?? newId(), title, items: [] });
      return;
    }
    const it = /^(?:[-*•]|\d+[.)])\s+(.+)$/.exec(t);
    if (!it) { warnings.push(`Line ${i + 1}: “${t.slice(0, 40)}” isn’t a heading (“## …”) or a thing to rate (“- …”).`); return; }
    if (!sections.length) sections.push({ id: newId(), title: 'Ours', items: [] });
    const s = sections[sections.length - 1]!;
    const label = it[1]!.trim().slice(0, 160);
    const old = prev.find((p) => key(p.title) === key(s.title))?.items.find((x) => key(x.label) === key(label));
    if (!s.items.some((x) => key(x.label) === key(label))) s.items.push({ id: old?.id ?? newId(), label });
  });
  return { sections: sections.filter((s) => s.items.length), warnings };
}
