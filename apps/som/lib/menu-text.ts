// The menu as plain text, for reading and editing by hand (in the app, or in
// any notes app). It reads like the paper sheet:
//
//   # Our menu
//   > A line about it
//   Lead: Captain Kay
//   Follow: Sunny
//
//   ## Pacing
//   - 4 hours: 2 rooms, 2 play breaks, 2 praise tasks, errands — 2–3 rooms
//
//   ## Rooms
//   - Kitchen
//
//   ## Tasks: Praise & task bank
//   Note: Shown under the section's title.
//   ### Writing
//   - Daily affirmations [10 notes (affirmations) + 1 voice note (read aloud)]
//   - Clamps for ___ mins {mins} (10 min)
//     Details go on the lines under an item, indented.
//
// A file can hold just some sections; importing it replaces only those
// (lib/menu.ts mergeMenus). Pure: runs in the browser and in tests.

import { cleanMenu, cleanProofs, newId, proofText, SECTION_KINDS, type Menu, type MenuGroup, type MenuItem, type MenuSection, type Need, type Pacing, type Proof, type SectionKind } from './menu';

/** The word each section's heading starts with. */
export const KIND_WORD: Record<SectionKind, string> = {
  presentation: 'Presentation', changeover: 'Changeover', domain: 'Domain', errands: 'Errands', tasks: 'Tasks', wishes: 'Wishes', play: 'Play',
  arrival: 'Arrival', inspection: 'Inspection', outcomes: 'Outcomes', service: 'Service', aftercare: 'Aftercare',
};

const DEFAULT_TITLE = Object.fromEntries(SECTION_KINDS.map((k) => [k.kind, k.title])) as Record<SectionKind, string>;

// ── Writing ─────────────────────────────────────────────────────────────────

function itemText(it: MenuItem): string[] {
  let line = `- ${it.label}`;
  if (it.param) line += ` {${it.param}}`;
  if (it.needs?.length) line += ` [${it.needs.map(proofText).join(' + ')}]`;
  if (it.minutes) line += ` (${it.minutes} min)`;
  const out = [line];
  if (it.detail) out.push(...it.detail.split('\n').map((l) => `  ${l}`));
  return out;
}

export function sectionText(s: MenuSection): string {
  const title = s.title && s.title !== DEFAULT_TITLE[s.kind] ? `: ${s.title}` : '';
  const out = [`## ${KIND_WORD[s.kind]}${title}`];
  if (s.note) out.push(`Note: ${s.note}`);
  for (const g of s.groups) {
    out.push('', `### ${g.title}`);
    for (const it of g.items) out.push(...itemText(it));
  }
  return out.join('\n');
}

function pacingText(p: Pacing): string {
  const n = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`;
  const parts = [n(p.rooms, 'room', 'rooms'), n(p.playBreaks, 'play break', 'play breaks'), n(p.praise, 'praise task', 'praise tasks')];
  if (p.errands) parts.push('errands');
  const label = /\d/.test(p.label) ? p.label : `${p.label} (${p.hours} hours)`;
  return `- ${label}: ${parts.join(', ')}${p.note ? ` — ${p.note}` : ''}`;
}

/** The whole menu as text. */
export function menuToText(menu: Menu): string {
  const out = [`# ${menu.name}`];
  if (menu.tagline) out.push(`> ${menu.tagline}`);
  out.push(`Lead: ${menu.titles.lead}`, `Follow: ${menu.titles.follow}`, '', '## Pacing', ...menu.pacing.map(pacingText), '', '## Rooms', ...menu.rooms.map((r) => `- ${r}`));
  for (const s of menu.sections) out.push('', sectionText(s));
  return `${out.join('\n')}\n`;
}

// ── Reading ─────────────────────────────────────────────────────────────────

/** What a text file had in it: only the parts it mentions are set. */
export interface ParsedMenu {
  name?: string;
  tagline?: string;
  titles?: { lead?: string; follow?: string };
  pacing?: Pacing[];
  rooms?: string[];
  sections: MenuSection[];
  warnings: string[];
}

const KIND_HINTS: [SectionKind, RegExp][] = [
  ['changeover', /change-?overs?|between blocks/i],
  ['presentation', /present|canvas|getting ready|\bprep\b/i],
  ['domain', /domain|chore|clean|maintenance|room/i],
  ['errands', /errand|public/i],
  ['wishes', /wish|for (the )?lead|for \{lead\}|for her|for him/i],
  ['tasks', /praise|devotion|task bank|tribute|tasks?\b|writing/i],
  ['play', /play/i],
  ['arrival', /arriv|greeting/i],
  ['service', /service/i],
  ['inspection', /inspect|score/i],
  ['outcomes', /consequence|reward|punish|outcome/i],
  ['aftercare', /aftercare|shutdown|closing|affirmation/i],
];

function kindOf(heading: string): { kind: SectionKind; title: string } | null {
  const [head, ...rest] = heading.split(':');
  const word = head!.trim().toLowerCase();
  const exact = SECTION_KINDS.find((k) => KIND_WORD[k.kind].toLowerCase() === word || k.kind === word);
  if (exact) return { kind: exact.kind, title: rest.join(':').trim() || exact.title };
  const hint = KIND_HINTS.find(([, re]) => re.test(heading));
  return hint ? { kind: hint[0], title: heading.trim() } : null;
}

const NEED_WORDS: [Need, RegExp][] = [
  ['photo', /^(photos?|pics?|pictures?|images?|selfies?)$/i],
  ['video', /^(videos?|clips?|recordings? on video)$/i],
  ['audio', /^(voice ?notes?|voice|audio|voice recordings?|recordings?)$/i],
  ['text', /^(notes?|texts?|words|writing|messages?|lines?|entries)$/i],
];

/** "2 photos (before & after)", "1 voice note", "notes: affirmations", "video". */
export function parseProof(raw: string): Proof[] | null {
  const out: Proof[] = [];
  for (const part of raw.split(/\s*(?:\+|;|,(?=\s*\d))\s*/).map((p) => p.trim()).filter(Boolean)) {
    const m = /^(\d+)?\s*(?:x\s*)?([a-z ]+?)\s*(?:\((.*)\)|:\s*(.*))?$/i.exec(part);
    const kind = m && NEED_WORDS.find(([, re]) => re.test(m[2]!.trim()))?.[0];
    if (!m || !kind) return null;
    const p: Proof = { kind, count: m[1] ? Number(m[1]) : 1 };
    const label = (m[3] ?? m[4] ?? '').trim();
    if (label) p.label = label;
    out.push(p);
  }
  return cleanProofs(out);
}

function parseItem(body: string, lineNo: number, warnings: string[]): MenuItem | null {
  let rest = body.trim();
  const item: MenuItem = { id: newId(), label: '' };
  // Trailing parts, in any order: [proof] (N min) {blank}
  for (;;) {
    let m: RegExpExecArray | null;
    if ((m = /\s*\[([^\]]*)\]\s*$/.exec(rest))) {
      const proof = parseProof(m[1]!);
      if (proof) item.needs = [...(item.needs ?? []), ...proof];
      else warnings.push(`Line ${lineNo}: couldn’t read the proof “[${m[1]}]” (try “2 photos + 1 video”)`);
    } else if ((m = /\s*\((\d{1,4})\s*(?:m|min|mins|minutes?)\)\s*$/i.exec(rest))) {
      item.minutes = Number(m[1]);
    } else if ((m = /\s*\{([^}]*)\}\s*$/.exec(rest))) {
      if (m[1]!.trim()) item.param = m[1]!.trim();
    } else break;
    rest = rest.slice(0, m.index).trimEnd();
  }
  item.label = rest;
  if (!item.label) return null;
  if (/\[[^\]]*\]/.test(item.label)) warnings.push(`Line ${lineNo}: put the proof in [ ] at the end of the line, after the item`);
  if (item.label.includes('___') && !item.param) item.param = 'number';
  return item;
}

function parsePacing(body: string, lineNo: number, warnings: string[]): Pacing | null {
  const [left, ...noteParts] = body.split(/\s+(?:—|--|–)\s+/);
  const note = noteParts.join(' — ').trim();
  const colon = left!.indexOf(':');
  const label = (colon >= 0 ? left!.slice(0, colon) : left!).trim();
  const spec = colon >= 0 ? left!.slice(colon + 1) : '';
  const num = (re: RegExp) => Number(re.exec(spec)?.[1] ?? 0);
  const hours = Number(/(\d+(?:\.\d+)?)\s*(?:h|hours?|hrs?)\b/i.exec(label)?.[1] ?? /(\d+)/.exec(label)?.[1] ?? 0);
  if (!hours) {
    warnings.push(`Line ${lineNo}: a pacing line needs its hours, like “- 4 hours: 2 rooms, 2 play breaks, 2 praise tasks”`);
    return null;
  }
  return {
    id: newId(),
    label: label.replace(/\s*\(\d+ hours\)$/, ''),
    hours: Math.round(hours),
    rooms: num(/(\d+)\+?\s*rooms?/i),
    playBreaks: num(/(\d+)\s*(?:play\s*)?breaks?/i),
    praise: num(/(\d+)\s*praise/i),
    errands: /\berrands\b/i.test(spec) && !/\bno errands\b/i.test(spec),
    note,
  };
}

/** Reads a menu (or part of one) written as text. Never throws; problems come back as warnings. */
export function textToMenu(text: string): ParsedMenu {
  const out: ParsedMenu = { sections: [], warnings: [] };
  let mode: 'top' | 'pacing' | 'rooms' | 'section' | 'skip' = 'top';
  let section: MenuSection | null = null;
  let group: MenuGroup | null = null;
  let last: MenuItem | null = null;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');

  lines.forEach((raw, i) => {
    const n = i + 1;
    const line = raw.replace(/\s+$/, '');
    const t = line.trim();
    if (!t || t.startsWith('//')) return;
    let m: RegExpExecArray | null;

    if ((m = /^#\s+(.+)$/.exec(t)) && !t.startsWith('##')) {
      out.name = m[1]!.trim();
      mode = 'top';
      return;
    }
    if ((m = /^##\s+(.+)$/.exec(t)) && !t.startsWith('###')) {
      const h = m[1]!.trim();
      group = null;
      last = null;
      if (/^pacing/i.test(h)) { mode = 'pacing'; out.pacing = []; return; }
      if (/^rooms?(\s+bank)?$/i.test(h) || /^room bank/i.test(h)) { mode = 'rooms'; out.rooms = []; return; }
      const k = kindOf(h);
      if (!k) {
        out.warnings.push(`Line ${n}: “${h}” isn’t a section S-O-M knows (start it with one of: ${Object.values(KIND_WORD).join(', ')})`);
        mode = 'skip';
        return;
      }
      if (out.sections.some((s) => s.kind === k.kind)) out.warnings.push(`Line ${n}: ${KIND_WORD[k.kind]} appears twice; the later one is used`);
      out.sections = out.sections.filter((s) => s.kind !== k.kind);
      section = { id: newId(), kind: k.kind, title: k.title, groups: [] };
      out.sections.push(section);
      mode = 'section';
      return;
    }
    if (mode === 'skip') return;

    if (mode === 'top') {
      if ((m = /^>\s*(.*)$/.exec(t))) { out.tagline = m[1]!.trim(); return; }
      if ((m = /^(lead|follow)\s*:\s*(.+)$/i.exec(t))) {
        out.titles = { ...out.titles, [m[1]!.toLowerCase()]: m[2]!.trim() };
        return;
      }
      out.warnings.push(`Line ${n}: not sure what “${t.slice(0, 40)}” is (sections start with “## ”)`);
      return;
    }

    const bullet = /^[-*•]\s+(.*)$/.exec(t);
    if (mode === 'pacing') {
      if (!bullet) return void out.warnings.push(`Line ${n}: pacing lines start with “- ”`);
      const p = parsePacing(bullet[1]!, n, out.warnings);
      if (p) out.pacing!.push(p);
      return;
    }
    if (mode === 'rooms') {
      const names = (bullet ? bullet[1]! : t).split(/\s*,\s*/).map((r) => r.trim()).filter(Boolean);
      out.rooms!.push(...names);
      return;
    }

    // In a section.
    if ((m = /^###\s+(.+)$/.exec(t))) {
      group = { id: newId(), title: m[1]!.trim(), items: [] };
      section!.groups.push(group);
      last = null;
      return;
    }
    if ((m = /^note\s*:\s*(.*)$/i.exec(t)) && !group) {
      section!.note = m[1]!.trim();
      return;
    }
    if (bullet) {
      const it = parseItem(bullet[1]!, n, out.warnings);
      if (!it) return;
      if (!group) {
        group = { id: newId(), title: section!.title, items: [] };
        section!.groups.push(group);
      }
      group.items.push(it);
      last = it;
      return;
    }
    if (/^\s/.test(line) && last) {
      last.detail = last.detail ? `${last.detail}\n${t}` : t;
      return;
    }
    out.warnings.push(`Line ${n}: “${t.slice(0, 40)}” isn’t an item (start items with “- ”, groups with “### ”)`);
  });
  return out;
}

// ── Putting it together ─────────────────────────────────────────────────────

const key = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Gives items, groups and pacing in `next` the ids they had in `prev` when
 * they match by name (in the same section), so scenes drafted from the old
 * menu keep their picks after an edit or a re-import.
 */
export function keepIds(next: Menu, prev: Menu): Menu {
  const out = structuredClone(next);
  for (const s of out.sections) {
    const old = prev.sections.find((x) => x.kind === s.kind);
    if (!old) continue;
    s.id = old.id;
    const oldItems = new Map(old.groups.flatMap((g) => g.items).map((it) => [key(it.label), it.id]));
    const oldGroups = new Map(old.groups.map((g) => [key(g.title), g.id]));
    const used = new Set<string>();
    for (const g of s.groups) {
      const gid = oldGroups.get(key(g.title));
      if (gid && !used.has(gid)) { g.id = gid; used.add(gid); }
      for (const it of g.items) {
        const id = oldItems.get(key(it.label));
        if (id && !used.has(id)) { it.id = id; used.add(id); }
      }
    }
  }
  const oldPacing = new Map(prev.pacing.map((p) => [key(p.label), p.id]));
  for (const p of out.pacing) p.id = oldPacing.get(key(p.label)) ?? p.id;
  return out;
}

/**
 * The current menu with what a file brought: its sections replace the same
 * sections (others stay as they are); its pacing, rooms, name and titles
 * replace those only if it has them.
 */
export function mergeMenus(current: Menu, parsed: ParsedMenu): Menu {
  const next: Menu = structuredClone(current);
  if (parsed.name) next.name = parsed.name;
  if (parsed.tagline !== undefined) next.tagline = parsed.tagline;
  if (parsed.titles?.lead) next.titles.lead = parsed.titles.lead;
  if (parsed.titles?.follow) next.titles.follow = parsed.titles.follow;
  if (parsed.pacing?.length) next.pacing = parsed.pacing;
  if (parsed.rooms) next.rooms = parsed.rooms;
  for (const s of parsed.sections) next.sections = next.sections.map((x) => (x.kind === s.kind ? s : x));
  return keepIds(cleanMenu(next), current);
}

/** A JSON menu file in the same shape as a parsed text one: only the sections it lists count. */
export function jsonToParsed(raw: unknown): ParsedMenu {
  const r = (raw ?? {}) as Record<string, unknown>;
  const clean = cleanMenu(raw);
  const listed = new Set((Array.isArray(r.sections) ? r.sections : []).map((s) => (s as { kind?: unknown })?.kind));
  return {
    name: typeof r.name === 'string' ? clean.name : undefined,
    tagline: typeof r.tagline === 'string' ? clean.tagline : undefined,
    titles: r.titles ? clean.titles : undefined,
    pacing: Array.isArray(r.pacing) ? clean.pacing : undefined,
    rooms: Array.isArray(r.rooms) ? clean.rooms : undefined,
    sections: clean.sections.filter((s) => listed.has(s.kind)),
    warnings: [],
  };
}

/** Reads a menu file, text or JSON. */
export function readMenuFile(text: string): ParsedMenu {
  const t = text.trimStart();
  if (t.startsWith('{')) {
    try {
      return jsonToParsed(JSON.parse(t));
    } catch {
      return { sections: [], warnings: ['That looks like JSON but isn’t valid JSON.'] };
    }
  }
  return textToMenu(text);
}

/** "Presentation, Domain and Play" for a confirm message. */
export function describeParsed(p: ParsedMenu): string {
  const parts = [
    ...(p.name || p.titles ? ['name and titles'] : []),
    ...(p.pacing?.length ? ['pacing'] : []),
    ...(p.rooms ? ['rooms'] : []),
    ...p.sections.map((s) => KIND_WORD[s.kind]),
  ];
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
