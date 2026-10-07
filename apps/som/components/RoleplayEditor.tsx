'use client';

import { useMemo, useState } from 'react';
import { newId, type Menu, type Roleplay } from '@/lib/menu';
import { keepRoleplayIds, roleplaysToText, textToRoleplays, type RoleWords } from '@/lib/roleplay-text';
import { usePod } from './Pod';
import { useProfiles } from './Profiles';
import { feelLine, FeelPicker } from './RoleplayFeel';
import { Collapsible, ErrorText, Sheet } from './ui';

/** Words that mean each of you in a roleplay's "Leads:" line: titles, switch titles and names. */
export function roleWords(menu: Menu, members: { role: 'lead' | 'follow'; display_name: string }[]): RoleWords {
  const low = (xs: string[]) => xs.map((x) => x.trim().toLowerCase()).filter(Boolean);
  const names = (r: 'lead' | 'follow') => members.filter((m) => m.role === r).map((m) => m.display_name);
  return {
    lead: low([menu.titles.lead, menu.switchTitles.follow, ...names('lead')]),
    follow: low([menu.titles.follow, menu.switchTitles.lead, ...names('follow')]),
  };
}

const blank = (): Roleplay => ({ id: newId(), title: '', group: '', leads: 'lead', location: '', intensity: '', attire: '', setup: '', action: '', aftercare: '' });

/**
 * The pod's roleplays, on the Menu page: each says who leads it (whoever
 * usually leads, or whoever usually follows: a switch), and how it goes.
 * Edited one at a time, or all at once as text; saved with the menu.
 */
export function RoleplaysEditor({ menu, change, open, setOpen }: {
  menu: Menu;
  change: (fn: (m: Menu) => void) => void;
  open: string | null;
  setOpen: (v: string | null) => void;
}) {
  const pod = usePod();
  const [editing, setEditing] = useState<Roleplay | null>(null);
  const [asText, setAsText] = useState(false);
  const [error, setError] = useState('');
  const words = useMemo(() => roleWords(menu, pod.members), [menu, pod.members]);
  const { profiles, update } = useProfiles();
  const who = (r: 'lead' | 'follow') => {
    const name = pod.members.find((m) => m.role === r)?.display_name;
    return r === 'lead' ? `${menu.titles.lead} leads` : `${menu.switchTitles.lead || name || menu.titles.follow} leads ⇄`;
  };
  const groups = [...new Set(menu.roleplays.map((r) => r.group))];

  function keep(rp: Roleplay) {
    if (!rp.title.trim()) return setError('Give it a title.');
    change((m) => {
      const i = m.roleplays.findIndex((x) => x.id === rp.id);
      if (i >= 0) m.roleplays[i] = rp;
      else m.roleplays.push(rp);
    });
    setEditing(null);
    setError('');
  }

  async function importFile(file: File) {
    setError('');
    const { roleplays, warnings } = textToRoleplays(await file.text(), words);
    if (!roleplays.length) return setError(warnings[0] ?? 'No roleplays in that file. Start each with “- Title”, then lines like “Leads: …”, “Setup: …”.');
    const known = new Set(menu.roleplays.map((r) => `${r.group}|${r.title}`.toLowerCase()));
    const fresh = roleplays.filter((r) => !known.has(`${r.group}|${r.title}`.toLowerCase()));
    const skipped = warnings.length ? `\n\n${warnings.length} ${warnings.length === 1 ? 'line' : 'lines'} not understood:\n${warnings.slice(0, 4).join('\n')}` : '';
    if (!confirm(`Add ${fresh.length} roleplays from “${file.name}”?${fresh.length < roleplays.length ? ` (${roleplays.length - fresh.length} you already have are left as they are.)` : ''}${skipped}`)) return;
    change((m) => { m.roleplays.push(...fresh); });
  }

  function download() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([roleplaysToText(menu.roleplays)], { type: 'text/plain;charset=utf-8' }));
    a.download = 'roleplays.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <Collapsible id="roleplays" title="Roleplays" open={open} setOpen={setOpen} summary={`${menu.roleplays.length} ${menu.roleplays.length === 1 ? 'roleplay' : 'roleplays'}`}>
      <p className="text-sm text-ink-soft">
        Scenes to play out, picked when you offer or ask for a scene. Each says who leads it; one led by {menu.titles.follow} is a switch.
      </p>
      {groups.map((g) => (
        <div key={g} className="space-y-1.5">
          {g && <p className="eyebrow text-follow">{g}</p>}
          <ul className="space-y-1.5">
            {menu.roleplays.filter((r) => r.group === g).map((r) => (
              <li key={r.id}>
                <button type="button" className="flex w-full items-start justify-between gap-3 rounded-xl border border-line px-3 py-2 text-left" onClick={() => setEditing(r)}>
                  <span className="min-w-0">
                    <span className="block font-medium">{r.title}</span>
                    <span className="block text-xs text-ink-soft">{[who(r.leads), r.location, r.intensity].filter(Boolean).join(' · ')}</span>
                    {feelLine(r.id, profiles, pod.account.id, pod.nameOf) && <span className="block text-xs">{feelLine(r.id, profiles, pod.account.id, pod.nameOf)}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-quiet" onClick={() => setEditing(blank())}>+ Add a roleplay</button>
        <button type="button" className="btn-quiet" onClick={() => setAsText(true)}>Edit as text</button>
        <label className="btn-quiet cursor-pointer">
          Import roleplays
          <input type="file" accept=".txt,.md,text/plain,text/markdown" className="sr-only" aria-label="Import roleplays" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f); }} />
        </label>
        {menu.roleplays.length > 0 && <button type="button" className="btn-quiet" onClick={download}>Download as text</button>}
      </div>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing && menu.roleplays.some((r) => r.id === editing.id) ? 'Edit roleplay' : 'New roleplay'} wide>
        {editing && (
          <div className="mb-4 space-y-1.5 border-b border-line pb-4">
            <span className="label">How you feel about it</span>
            <FeelPicker value={profiles?.[pod.account.id]?.profile.roleplays[editing.id]?.feel} label="How you feel about it"
              onPick={(f) => void update((p) => { p.roleplays[editing.id] = { ...(p.roleplays[editing.id] ?? {}), feel: f }; }).catch((e) => setError((e as Error).message))} />
            <p className="text-xs text-ink-soft">Saved straight away, in your profile. {pod.members.length > 1 ? 'Your partner sees it too.' : ''}</p>
          </div>
        )}
        {editing && <RoleplayForm rp={editing} who={who} onSave={keep} onDelete={() => {
          if (!confirm(`Delete “${editing.title || 'this roleplay'}”?`)) return;
          change((m) => { m.roleplays = m.roleplays.filter((x) => x.id !== editing.id); });
          setEditing(null);
        }} />}
      </Sheet>
      <Sheet open={asText} onClose={() => setAsText(false)} title="Roleplays as text" wide>
        {asText && <RoleplayText initial={roleplaysToText(menu.roleplays)} words={words} onApply={(rps) => { change((m) => { m.roleplays = keepRoleplayIds(rps, m.roleplays); }); setAsText(false); }} />}
      </Sheet>
    </Collapsible>
  );
}

function RoleplayForm({ rp, who, onSave, onDelete }: { rp: Roleplay; who: (r: 'lead' | 'follow') => string; onSave: (rp: Roleplay) => void; onDelete: () => void }) {
  const [v, setV] = useState(rp);
  const set = (k: keyof Roleplay) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  const line = (k: 'title' | 'group' | 'location' | 'intensity', label: string, placeholder = '') => (
    <div>
      <label className="label" htmlFor={`rp-${k}`}>{label}</label>
      <input id={`rp-${k}`} className="input" value={v[k]} placeholder={placeholder} maxLength={120} onChange={set(k)} />
    </div>
  );
  const box = (k: 'attire' | 'setup' | 'action' | 'aftercare', label: string, rows = 3) => (
    <div>
      <label className="label" htmlFor={`rp-${k}`}>{label}</label>
      <textarea id={`rp-${k}`} className="input" rows={rows} value={v[k]} maxLength={k === 'attire' ? 400 : 2500} onChange={set(k)} />
    </div>
  );
  return (
    <div className="space-y-4">
      {line('title', 'Title')}
      <div>
        <span className="label">Who leads</span>
        <div className="grid grid-cols-2 gap-2">
          {(['lead', 'follow'] as const).map((r) => <button key={r} type="button" className="chip justify-center" aria-pressed={v.leads === r} onClick={() => setV({ ...v, leads: r })}>{who(r)}</button>)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {line('group', 'Group', 'Indoor')}
        {line('intensity', 'Intensity', 'Gentle')}
      </div>
      {line('location', 'Where')}
      {box('attire', 'What to wear', 2)}
      {box('setup', 'The setup')}
      {box('action', 'The action', 5)}
      {box('aftercare', 'The aftercare')}
      <div className="flex items-center justify-between gap-3">
        <button type="button" className="text-sm text-stop underline" onClick={onDelete}>Delete</button>
        <button type="button" className="btn" onClick={() => onSave({ ...v, title: v.title.trim() })}>Keep it</button>
      </div>
      <p className="text-xs text-ink-soft">Save the menu to keep your changes.</p>
    </div>
  );
}

function RoleplayText({ initial, words, onApply }: { initial: string; words: RoleWords; onApply: (rps: Roleplay[]) => void }) {
  const [text, setText] = useState(initial);
  const parsed = useMemo(() => textToRoleplays(text, words), [text, words]);
  return (
    <div className="space-y-3">
      <textarea className="input min-h-[50dvh] font-mono text-base leading-relaxed sm:text-[13px]" value={text} spellCheck={false} autoCapitalize="off" aria-label="Roleplays as text" onChange={(e) => setText(e.target.value)} />
      <p className="text-sm text-ink-soft" role="status">{parsed.roleplays.length} {parsed.roleplays.length === 1 ? 'roleplay' : 'roleplays'}</p>
      {parsed.warnings.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-warn">{parsed.warnings.slice(0, 8).map((w) => <li key={w}>{w}</li>)}</ul>}
      <p className="text-xs text-ink-soft">“## Group”, then “- Title” and lines like “Leads: {'{lead}'}” or “Leads: {'{follow}'}” (a switch), “Location:”, “Intensity:”, “Attire:”, “Setup:”, “Action:”, “Aftercare:”. Applying replaces every roleplay.</p>
      <button type="button" className="btn w-full" onClick={() => onApply(parsed.roleplays)}>Use this</button>
    </div>
  );
}
