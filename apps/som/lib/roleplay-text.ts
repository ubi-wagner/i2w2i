// Roleplays as plain text, for importing and editing by hand:
//
//   ## Indoor
//   - The night shift
//     Leads: {follow}
//     Location: Kitchen | Intensity: Playful
//     Attire: An apron (follow); a clipboard (lead)
//     Setup: Where it starts and what the rule is.
//     Action: What happens.
//     Aftercare: How it ends.
//
// Headings are groups. "Leads" is {lead} (whoever usually leads) or
// {follow} (whoever usually follows, which switches the scene); your titles
// or names work too. Fields can share a line with " | ", and a field runs
// on over the lines under it until the next one. Pure.

import { cleanRoleplay, newId, type Roleplay } from './menu';

type Field = 'leads' | 'location' | 'intensity' | 'attire' | 'setup' | 'action' | 'aftercare';
const FIELDS: Record<string, Field> = {
  leads: 'leads', 'led by': 'leads', location: 'location', where: 'location', intensity: 'intensity', attire: 'attire', wearing: 'attire',
  setup: 'setup', 'set-up': 'setup', 'set up': 'setup', action: 'action', aftercare: 'aftercare', 'after-care': 'aftercare',
};
const LABEL: Record<Exclude<Field, 'leads'>, string> = {
  location: 'Location', intensity: 'Intensity', attire: 'Attire', setup: 'Setup', action: 'Action', aftercare: 'Aftercare',
};
const FIELD_RE = new RegExp(`^(?:the\\s+)?(${Object.keys(FIELDS).join('|')})\\s*:\\s*(.*)$`, 'i');

/** Words that mean each role (titles, names), lower case. */
export interface RoleWords { lead: string[]; follow: string[] }

export function roleplaysToText(roleplays: Roleplay[]): string {
  const out: string[] = [];
  let group: string | null = null;
  for (const r of roleplays) {
    if (r.group !== group) {
      if (out.length) out.push('');
      out.push(`## ${r.group || 'Roleplays'}`);
      group = r.group;
    }
    out.push(`- ${r.title}`, `  Leads: {${r.leads}}`);
    for (const k of ['location', 'intensity', 'attire', 'setup', 'action', 'aftercare'] as const) {
      if (!r[k]) continue;
      const [first, ...rest] = r[k].split('\n');
      out.push(`  ${LABEL[k]}: ${first}`, ...rest.map((l) => `    ${l}`));
    }
  }
  return `${out.join('\n')}\n`;
}

export function textToRoleplays(text: string, words: RoleWords = { lead: [], follow: [] }): { roleplays: Roleplay[]; warnings: string[] } {
  const roleplays: Roleplay[] = [];
  const warnings: string[] = [];
  let group = '';
  let cur: (Partial<Record<Field, string>> & { title: string; line: number }) | null = null;
  let field: Field | null = null;

  const leadsOf = (v: string, line: number): 'lead' | 'follow' => {
    const w = v.trim().toLowerCase().replace(/^\{|\}$/g, '');
    if (w === 'lead' || words.lead.includes(w)) return 'lead';
    if (w === 'follow' || words.follow.includes(w)) return 'follow';
    warnings.push(`Line ${line}: “Leads: ${v.trim()}” isn’t {lead} or {follow}; it’s set to {lead}.`);
    return 'lead';
  };
  const finish = () => {
    if (!cur) return;
    const r = cleanRoleplay({ id: newId(), title: cur.title, group, location: cur.location, intensity: cur.intensity, attire: cur.attire, setup: cur.setup, action: cur.action, aftercare: cur.aftercare,
      leads: cur.leads ? leadsOf(cur.leads, cur.line) : 'lead' });
    if (r) roleplays.push(r);
    cur = null;
    field = null;
  };

  text.split(/\r?\n/).forEach((raw, i) => {
    const n = i + 1;
    const line = raw.replace(/\s+$/, '');
    const t = line.trim();
    if (/^#\s/.test(t)) return;
    const heading = /^#{2,}\s*(.+)$/.exec(t);
    if (heading) { finish(); group = heading[1]!.trim(); return; }
    const item = /^[-*•]\s+(.+)$/.exec(line);
    if (item) { finish(); cur = { title: item[1]!.trim(), line: n }; return; }
    if (!t) return;
    if (!cur) { warnings.push(`Line ${n}: “${t.slice(0, 40)}” isn’t under a roleplay (start one with “- ”).`); return; }
    const parts = t.split(/\s+\|\s+/);
    if (parts.some((p) => FIELD_RE.test(p))) {
      for (const p of parts) {
        const m = FIELD_RE.exec(p);
        if (!m) { if (field) cur[field] = `${cur[field] ?? ''} ${p}`.trim(); continue; }
        field = FIELDS[m[1]!.toLowerCase()]!;
        cur[field] = m[2]!.trim();
        if (field === 'leads') cur.line = n;
      }
      return;
    }
    if (!field) { warnings.push(`Line ${n}: “${t.slice(0, 40)}” isn’t a field (like “Setup: …”).`); return; }
    // A run-on line: a new paragraph if the source was indented deeper, else the same one.
    cur[field] = cur[field] ? `${cur[field]}${/^\s{4,}/.test(line) ? '\n' : ' '}${t}` : t;
  });
  finish();
  return { roleplays, warnings };
}
