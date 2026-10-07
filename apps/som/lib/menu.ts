// The menu: everything a scene can be built from, laid out like the
// Select-O-Matic sheet (sections → groups → items). It's the pod's own,
// edited mostly by the follow so the lead only has to choose, and stored
// encrypted (lib/crypto.ts). Pure: runs in the browser and in tests.
//
// The app ships with a neutral starter menu. A couple's real menu comes in
// as a file they import in the app, so it never lives in this repository.

export type Need = 'photo' | 'video' | 'audio' | 'text';
export const NEEDS: Need[] = ['photo', 'video', 'audio', 'text'];

/**
 * One piece of required proof: how many of a kind, with an optional label,
 * e.g. 2 photos "before & after", 1 video, 10 notes "affirmations".
 */
export interface Proof { kind: Need; count: number; label?: string }
export const MAX_PROOF_COUNT = 50;

const PROOF_NOUN: Record<Need, [string, string]> = { photo: ['photo', 'photos'], video: ['video', 'videos'], audio: ['voice note', 'voice notes'], text: ['note', 'notes'] };

/** "2 photos (before & after)", "1 video", "10 notes (affirmations)". */
export function proofText(p: Proof): string {
  const base = `${p.count} ${PROOF_NOUN[p.kind][p.count === 1 ? 0 : 1]}`;
  return p.label ? `${base} (${p.label})` : base;
}

/**
 * Proof from anywhere: a kind on its own ("photo", the old format) means
 * one; objects carry a count and a label. Bad kinds are dropped.
 */
export function cleanProofs(raw: unknown): Proof[] {
  if (!Array.isArray(raw)) return [];
  const out: Proof[] = [];
  for (const x of raw.slice(0, 8)) {
    const r = (typeof x === 'string' ? { kind: x } : (x ?? {})) as Record<string, unknown>;
    if (!NEEDS.includes(r.kind as Need)) continue;
    const p: Proof = { kind: r.kind as Need, count: int(r.count, 1, MAX_PROOF_COUNT) ?? 1 };
    const label = str(r.label, 40);
    if (label) p.label = label;
    out.push(p);
  }
  return out;
}

export type SectionKind =
  | 'presentation' // getting ready (the first 30 minutes): one checklist task
  | 'changeover' // the 15 minutes between blocks: into the next outfit
  | 'domain' // chores, two to a block at home (a ___ {room} blank picks from the room bank)
  | 'errands' // out of the house, in an "out" block
  | 'tasks' // devotion: praise acts for the lead
  | 'wishes' // for the lead: things about the two of you
  | 'play' // a play break in the free hour
  | 'arrival' // what happens when the lead arrives (a checklist, not tasks)
  | 'inspection' // categories scored 1–5
  | 'outcomes' // consequences and rewards, chosen at inspection
  | 'service' // continuation after inspection, chosen at inspection
  | 'aftercare'; // closing the scene and coming back to "us"

export const SECTION_KINDS: { kind: SectionKind; title: string; help: string }[] = [
  { kind: 'presentation', title: 'Getting ready', help: 'The first 30 minutes of the day. Becomes one checklist, with a photo when done.' },
  { kind: 'changeover', title: 'Change-overs', help: 'The 15 minutes between blocks: out of one outfit, into the next.' },
  { kind: 'domain', title: 'Chores', help: 'Specific chores, two to a block at home. Write ___ with the blank “room” to pick from the room bank.' },
  { kind: 'errands', title: 'Errands', help: 'Out of the house: one or two to an “out” block, proof and all.' },
  { kind: 'tasks', title: 'Devotion', help: 'Praise acts for the lead: one to a block, about 15 minutes.' },
  { kind: 'wishes', title: 'For {lead}', help: 'Things for the lead and the two of you: one to a block, about 15 minutes.' },
  { kind: 'play', title: 'Play break', help: 'A break in the free hour, proof recorded.' },
  { kind: 'arrival', title: 'Arrival routine', help: 'Shown when the lead says they’re on the way.' },
  { kind: 'inspection', title: 'Inspection & scorecard', help: 'Each item is a 1–5 score at inspection.' },
  { kind: 'outcomes', title: 'Consequences & rewards', help: 'Chosen by the lead after inspection.' },
  { kind: 'service', title: 'Service continuation', help: 'Chosen by the lead after inspection.' },
  { kind: 'aftercare', title: 'Shutdown & aftercare', help: 'The closing checklist, then back to “us”.' },
];

export interface MenuItem {
  id: string;
  label: string;
  detail?: string;
  /** A blank to fill when it's picked, e.g. "mins" for "clamps for ___ mins". */
  param?: string;
  /** What has to be sent to complete it (any number of each). */
  needs?: Proof[];
  /** A countdown, for tasks that take a set time. */
  minutes?: number;
}

export interface MenuGroup {
  id: string;
  title: string;
  items: MenuItem[];
}

export interface MenuSection {
  id: string;
  kind: SectionKind;
  title: string;
  note?: string;
  groups: MenuGroup[];
}

export interface Pacing {
  id: string;
  label: string;
  hours: number;
  rooms: number;
  playBreaks: number;
  praise: number;
  errands: boolean;
  note: string;
}

/**
 * A roleplay: who leads it (the pod's usual lead, or the usual follow, which
 * switches the scene), where, what to wear, and how it goes.
 */
export interface Roleplay {
  id: string;
  title: string;
  group: string;
  leads: 'lead' | 'follow';
  location: string;
  intensity: string;
  attire: string;
  setup: string;
  action: string;
  aftercare: string;
}

/**
 * A template: the shape of a scene to offer again (its hours, who leads,
 * tasks or a roleplay, a note), never what's in it, so each one is new.
 */
export interface Template {
  id: string;
  name: string;
  /** "08:30" */
  from: string;
  until: string;
  leads: 'lead' | 'follow';
  kind: 'tasks' | 'roleplay';
  note: string;
}

/** The pod's own things to rate in profiles, beside the built-in ones. */
export interface RateSection { id: string; title: string; items: { id: string; label: string }[] }

export interface Menu {
  v: 1;
  name: string;
  tagline: string;
  titles: { lead: string; follow: string };
  /** Titles in a switched scene (empty: your names). */
  switchTitles: { lead: string; follow: string };
  pacing: Pacing[];
  rooms: string[];
  sections: MenuSection[];
  /**
   * The pod's own ideas: a bigger pool to pick menu items from (lib/ideas.ts
   * adds the built-in ones). Same shape as the sections; not shown when
   * building a scene.
   */
  library: MenuSection[];
  roleplays: Roleplay[];
  templates: Template[];
  inventory: RateSection[];
  /** Whether profiles list the built-in things to rate too. */
  builtInInventory: boolean;
}

const LIMITS = { sections: 10, groups: 12, items: 60, rooms: 40, pacing: 8, text: 160, detail: 600, note: 600 } as const;
const LIBRARY_LIMITS = { groups: 40, items: 150 } as const;

export function newId(): string {
  const b = globalThis.crypto.getRandomValues(new Uint8Array(6));
  return Array.from(b, (x) => x.toString(36).padStart(2, '0')).join('').slice(0, 10);
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const longStr = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const id = (v: unknown) => (typeof v === 'string' && /^[a-z0-9_-]{1,40}$/i.test(v) ? v : newId());
const int = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : undefined);

function cleanItem(raw: unknown): MenuItem | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const label = str(r.label, LIMITS.text);
  if (!label) return null;
  const item: MenuItem = { id: id(r.id), label };
  const detail = longStr(r.detail, LIMITS.detail);
  if (detail) item.detail = detail;
  const param = str(r.param, 20);
  if (param) item.param = param;
  const needs = cleanProofs(r.needs);
  if (needs.length) item.needs = needs;
  const minutes = int(r.minutes, 1, 1440);
  if (minutes) item.minutes = minutes;
  return item;
}

function cleanGroup(raw: unknown, maxItems: number = LIMITS.items): MenuGroup | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const items = (Array.isArray(r.items) ? r.items : []).map(cleanItem).filter((x): x is MenuItem => !!x).slice(0, maxItems);
  const title = str(r.title, LIMITS.text);
  if (!title && !items.length) return null;
  return { id: id(r.id), title: title || 'Untitled', items };
}

const RP = { count: 100, text: 120, attire: 400, body: 2500 } as const;

export function cleanRoleplay(raw: unknown): Roleplay | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const title = str(r.title, RP.text);
  if (!title) return null;
  return {
    id: id(r.id),
    title,
    group: str(r.group, 60),
    leads: r.leads === 'follow' ? 'follow' : 'lead',
    location: str(r.location, RP.text),
    intensity: str(r.intensity, RP.text),
    attire: longStr(r.attire, RP.attire),
    setup: longStr(r.setup, RP.body),
    action: longStr(r.action, RP.body),
    aftercare: longStr(r.aftercare, RP.body),
  };
}

const hhmm = (v: unknown) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : '');

export function cleanTemplate(raw: unknown): Template | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = str(r.name, 60);
  const from = hhmm(r.from);
  const until = hhmm(r.until);
  if (!name || !from || !until) return null;
  return {
    id: id(r.id), name, from, until,
    leads: r.leads === 'follow' ? 'follow' : 'lead',
    kind: r.kind === 'roleplay' ? 'roleplay' : 'tasks',
    note: longStr(r.note, 1000),
  };
}

function cleanRateSections(raw: unknown): RateSection[] {
  return (Array.isArray(raw) ? raw : []).slice(0, 20).map((x) => {
    const r = (x ?? {}) as Record<string, unknown>;
    const items = (Array.isArray(r.items) ? r.items : []).slice(0, 150)
      .map((i) => ({ id: id((i as { id?: unknown })?.id), label: str((i as { label?: unknown })?.label, LIMITS.text) }))
      .filter((i) => i.label);
    return { id: id(r.id), title: str(r.title, 80) || 'Ours', items };
  }).filter((s) => s.items.length);
}

function cleanPacing(raw: unknown): Pacing | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const hours = int(r.hours, 1, 48);
  if (!hours) return null;
  return {
    id: id(r.id),
    label: str(r.label, 40) || `${hours} hours`,
    hours,
    rooms: int(r.rooms, 0, 20) ?? 0,
    playBreaks: int(r.playBreaks, 0, 10) ?? 0,
    praise: int(r.praise, 0, 10) ?? 0,
    errands: r.errands === true,
    note: str(r.note, LIMITS.note),
  };
}

/**
 * Checks and normalises a menu from anywhere (an import, a decrypted copy,
 * an edit): unknown fields dropped, text trimmed, sizes capped, ids kept or
 * made, and every section kind present once, in the sheet's order.
 */
export function cleanMenu(raw: unknown): Menu {
  const r = (raw ?? {}) as Record<string, unknown>;
  const titles = (r.titles ?? {}) as Record<string, unknown>;
  const switchTitles = (r.switchTitles ?? {}) as Record<string, unknown>;
  const sections = cleanSections(r.sections, LIMITS.groups, LIMITS.items);
  const library = cleanSections(r.library, LIBRARY_LIMITS.groups, LIBRARY_LIMITS.items);
  const pacing = (Array.isArray(r.pacing) ? r.pacing : []).map(cleanPacing).filter((p): p is Pacing => !!p).slice(0, LIMITS.pacing);
  const rooms = Array.from(new Set((Array.isArray(r.rooms) ? r.rooms : []).map((x) => str(x, 60)).filter(Boolean))).slice(0, LIMITS.rooms);
  return {
    v: 1,
    name: str(r.name, 80) || 'Scene menu',
    tagline: str(r.tagline, 160),
    titles: { lead: str(titles.lead, 40) || 'Lead', follow: str(titles.follow, 40) || 'Follow' },
    switchTitles: { lead: str(switchTitles.lead, 40), follow: str(switchTitles.follow, 40) },
    pacing: pacing.length ? pacing : starterMenu().pacing,
    rooms,
    sections,
    library,
    roleplays: (Array.isArray(r.roleplays) ? r.roleplays : []).map(cleanRoleplay).filter((x): x is Roleplay => !!x).slice(0, RP.count),
    templates: (Array.isArray(r.templates) ? r.templates : []).map(cleanTemplate).filter((x): x is Template => !!x).slice(0, 30),
    inventory: cleanRateSections(r.inventory),
    builtInInventory: r.builtInInventory !== false,
  };
}

/** Every section kind once, in the sheet's order, each cleaned. */
function cleanSections(raw: unknown, maxGroups: number, maxItems: number): MenuSection[] {
  const given = Array.isArray(raw) ? raw : [];
  return SECTION_KINDS.map(({ kind, title }) => {
    const s = (given.find((x) => (x as { kind?: unknown })?.kind === kind) ?? {}) as Record<string, unknown>;
    const groups = (Array.isArray(s.groups) ? s.groups : []).map((g) => cleanGroup(g, maxItems)).filter((g): g is MenuGroup => !!g).slice(0, maxGroups);
    const section: MenuSection = { id: id(s.id), kind, title: str(s.title, LIMITS.text) || title, groups };
    const note = str(s.note, LIMITS.note);
    if (note) section.note = note;
    return section;
  });
}

export function section(menu: Menu, kind: SectionKind): MenuSection {
  return menu.sections.find((s) => s.kind === kind)!;
}

/** Every item in the menu by id. */
export function itemsById(menu: Menu): Map<string, { item: MenuItem; group: MenuGroup; section: MenuSection }> {
  const out = new Map<string, { item: MenuItem; group: MenuGroup; section: MenuSection }>();
  for (const s of menu.sections) for (const g of s.groups) for (const item of g.items) out.set(item.id, { item, group: g, section: s });
  return out;
}

const g = (title: string, items: (string | Omit<MenuItem, 'id'>)[]): MenuGroup => ({
  id: newId(),
  title,
  items: items.map((i) => (typeof i === 'string' ? { id: newId(), label: i } : { id: newId(), ...i })),
});

const photo: Proof = { kind: 'photo', count: 1 };
const beforeAfter: Proof = { kind: 'photo', count: 2, label: 'before & after' };

/** A neutral starting point, in the shape of the Select-O-Matic. */
export function starterMenu(): Menu {
  return {
    v: 1,
    name: 'Scene menu',
    tagline: 'Pick what you’d like; the rest is taken care of.',
    titles: { lead: 'Lead', follow: 'Follow' },
    switchTitles: { lead: '', follow: '' },
    pacing: [
      { id: 'p2', label: '2 hours', hours: 2, rooms: 1, playBreaks: 1, praise: 1, errands: false, note: 'One block at home: getting ready, chores in two areas, devotion, one for you.' },
      { id: 'p4', label: '4 hours', hours: 4, rooms: 2, playBreaks: 2, praise: 2, errands: false, note: 'A block at home, then one out on errands.' },
      { id: 'p8', label: '8 hours', hours: 8, rooms: 4, playBreaks: 3, praise: 3, errands: true, note: 'Home, out, a free hour, home again, then welcome home.' },
    ],
    rooms: ['Kitchen', 'Living room', 'Bedroom', 'Bathroom', 'Laundry', 'Office'],
    sections: [
      { id: newId(), kind: 'presentation', title: 'Getting ready', groups: [g('Getting ready', ['Shower', 'Hair done', 'Outfit of your choosing']), g('Shoes', ['Barefoot', 'Slippers'])] },
      {
        id: newId(), kind: 'changeover', title: 'Change-overs',
        groups: [
          g('Going out', [{ label: 'Out of the cleaning clothes, into ___ for going out', param: 'what', needs: [photo] }]),
          g('Back to the chores', [{ label: 'Into your apron for the chores', needs: [photo] }]),
          g('Fresh up', [{ label: 'Hair redone, fresh lipstick, a photo', needs: [photo] }]),
          g('Welcome home', [{ label: 'Into your best outfit, waiting at the door', needs: [photo] }]),
        ],
      },
      {
        id: newId(), kind: 'domain', title: 'Chores',
        groups: [
          g('Rooms', [{ label: 'Deep-clean the ___', param: 'room', needs: [beforeAfter] }, { label: 'Vacuum and mop the ___ floor', param: 'room', needs: [beforeAfter] }]),
          g('Kitchen & bath', [{ label: 'Clean the refrigerator, inside and out', needs: [beforeAfter] }, { label: 'Scrub the shower and tiles', needs: [beforeAfter] }]),
          g('Around the house', [{ label: 'Wash the windows, inside', needs: [beforeAfter] }, { label: 'Laundry: wash, dry, fold and put away', needs: [photo] }]),
        ],
      },
      { id: newId(), kind: 'errands', title: 'Errands', groups: [g('Errands', [{ label: 'Pick up flowers', needs: [photo] }, { label: 'Grocery run', needs: [{ kind: 'photo', count: 1, label: 'the receipt' }] }])] },
      {
        id: newId(), kind: 'tasks', title: 'Devotion',
        groups: [g('Devotion', [
          { label: 'Write a love note', needs: [{ kind: 'text', count: 1 }] },
          { label: 'List 20 things you adore about me', needs: [{ kind: 'text', count: 20, label: 'one thing each' }] },
          { label: 'Daily affirmations', needs: [{ kind: 'text', count: 10, label: 'affirmations' }, { kind: 'audio', count: 1, label: 'read aloud' }] },
          { label: 'Sing me a song', needs: [{ kind: 'video', count: 1 }] },
        ])],
      },
      {
        id: newId(), kind: 'wishes', title: 'For {lead}',
        groups: [g('For me', [
          { label: 'Write me a sonnet about our marriage', needs: [{ kind: 'text', count: 1 }] },
          { label: 'Plan a night out: a new activity in a new place', needs: [{ kind: 'text', count: 1, label: 'the plan' }] },
          { label: 'Prepare a welcome-home comfort station', needs: [{ kind: 'photo', count: 3 }] },
          { label: 'Pick an outfit for a date, underwear to shoes, and surprise me with it this week', needs: [photo] },
        ])],
      },
      { id: newId(), kind: 'play', title: 'Play break', groups: [g('Breaks', [{ label: 'A dance, on video', needs: [{ kind: 'video', count: 1 }], minutes: 2 }, { label: 'A voice note telling me about your day', needs: [{ kind: 'audio', count: 1 }] }])] },
      { id: newId(), kind: 'arrival', title: 'Arrival routine', groups: [g('The greeting', ['Meet at the door with a drink']), g('The service', ['Take my coat and shoes'])] },
      { id: newId(), kind: 'inspection', title: 'Inspection & scorecard', groups: [g('Categories', ['Presentation', 'Task completion', 'Quality of work', 'Attitude'])] },
      { id: newId(), kind: 'outcomes', title: 'Consequences & rewards', groups: [g('Consequences', [{ label: 'An extra chore' }, { label: 'Early night', param: 'mins early' }]), g('Rewards', [{ label: 'Movie pick' }, { label: 'Massage', param: 'mins' }])] },
      { id: newId(), kind: 'service', title: 'Service continuation', groups: [g('Service', ['Cook dinner', { label: 'Foot rub', param: 'mins' }])] },
      { id: newId(), kind: 'aftercare', title: 'Shutdown & aftercare', groups: [g('Scene closure', ['Declare the scene closed', 'Change into comfy clothes']), g('Couple aftercare', ['Cuddle on the couch', 'Talk about the day as equals'])] },
    ],
    library: SECTION_KINDS.map(({ kind, title }) => ({ id: newId(), kind, title, groups: [] })),
    roleplays: [],
    templates: [],
    inventory: [],
    builtInInventory: true,
  };
}
