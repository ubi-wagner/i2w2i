'use client';

import { useEffect, useMemo, useState } from 'react';
import { newId, proofText, SECTION_KINDS, type Menu, type MenuGroup, type MenuItem, type MenuSection, type SectionKind } from '@/lib/menu';
import { describeParsed, KIND_WORD, menuToText, mergeMenus, readMenuFile, sectionText, type ParsedMenu } from '@/lib/menu-text';
import { addIdeas, keepRemoved, ownIdeaCount, removeIdea, toggleIdea, withTitles } from '@/lib/ideas';
import { loadBuiltInIdeas } from '@/lib/client/ideas';
import { IdeasPicker } from './Ideas';
import { MenuTextEditor } from './MenuText';
import { ProofEditor } from './ProofEditor';
import { MenuClash, usePod } from './Pod';
import { Collapsible, ErrorText, Sheet, Spinner } from './ui';
import { RoleplaysEditor } from './RoleplayEditor';
import { TemplatesEditor } from './TemplatesEditor';


/** The menu: what scenes are built from. Mostly the follow's to fill, so the lead only chooses. */
export function MenuEditor() {
  const pod = usePod();
  const [menu, setMenu] = useState<Menu>(pod.menu);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ s: number; g: number; i: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  /** The text box: the whole menu, or one section. */
  const [asText, setAsText] = useState<'all' | SectionKind | null>(null);
  /** The ideas sheet, for one section. */
  const [ideas, setIdeas] = useState<SectionKind | null>(null);

  // From the scene builder's "More ideas": /menu#play opens that section's ideas.
  useEffect(() => {
    const k = window.location.hash.slice(1) as SectionKind;
    const sec = pod.menu.sections.find((x) => x.kind === k);
    if (!sec) return;
    setOpen(sec.id);
    setIdeas(k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (!dirty) setMenu(pod.menu); }, [pod.menu, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // The built-in ideas, from the server, with this pod's titles filled in.
  const [rawIdeas, setRawIdeas] = useState<MenuSection[] | null>(null);
  useEffect(() => { void loadBuiltInIdeas().then(setRawIdeas).catch((e) => setError((e as Error).message)); }, []);
  const builtIn = useMemo(() => (rawIdeas ? withTitles(rawIdeas, menu.titles) : null), [rawIdeas, menu.titles]);

  // Every change goes through here: anything that leaves the menu and isn't
  // in the pool is kept in your own ideas, so nothing written is lost.
  const update = (fn: (m: Menu) => Menu) => setMenu((m) => keepRemoved(m, fn(m), newId, builtIn ?? []));

  const change = (fn: (m: Menu) => void) => {
    update((m) => {
      const copy = structuredClone(m);
      fn(copy);
      return copy;
    });
    setDirty(true);
    setMsg('');
  };

  async function save() {
    setBusy(true);
    setError('');
    try {
      try {
        await pod.saveMenu(menu);
      } catch (err) {
        if (!(err instanceof MenuClash)) throw err;
        // Your edits stay on screen either way; nothing is lost without asking.
        if (!confirm('Your partner saved the menu since you opened it. Save yours over theirs?\n\nCancel keeps your changes here, unsaved, so you can look first.')) {
          setMsg('Not saved yet: your changes are still here. Save again to replace theirs, or leave this page to see theirs.');
          return;
        }
        await pod.saveMenu(menu, { overwrite: true });
      }
      setDirty(false);
      setMsg('Saved.');
    } catch (err) {
      // Still unsaved: keep the edits on screen.
      setError(`${(err as Error).message} Your changes are still here; try Save again.`);
    } finally {
      setBusy(false);
    }
  }

  /** A file or a text box brought these parts: they replace the same parts, the rest stays. */
  function bring(parsed: ParsedMenu, what: string) {
    update((m) => mergeMenus(m, parsed));
    setDirty(true);
    setMsg(`${what} updated. Check it over, then Save.`);
  }

  async function importFile(file: File) {
    setError('');
    const parsed = readMenuFile(await file.text());
    const parts = describeParsed(parsed);
    if (!parts) return setError(parsed.warnings[0] ?? 'Nothing in that file looks like a menu.');
    const others = parsed.sections.length && parsed.sections.length < SECTION_KINDS.length ? ' The other sections stay as they are.' : '';
    const skipped = parsed.warnings.length ? `\n\n${parsed.warnings.length} ${parsed.warnings.length === 1 ? 'line was' : 'lines were'} not understood and will be left out:\n${parsed.warnings.slice(0, 5).join('\n')}` : '';
    if (!confirm(`Replace ${parts} from “${file.name}”?${others}${skipped}`)) return;
    bring(parsed, parts.charAt(0).toUpperCase() + parts.slice(1));
  }

  async function importIdeas(file: File) {
    setError('');
    const parsed = readMenuFile(await file.text());
    const count = parsed.sections.reduce((n, x) => n + x.groups.reduce((k, g) => k + g.items.length, 0), 0);
    if (!count) return setError(parsed.warnings[0] ?? 'No ideas in that file. Ideas are written like the menu: ## section, ### group, - idea.');
    const skipped = parsed.warnings.length ? `\n\n${parsed.warnings.length} ${parsed.warnings.length === 1 ? 'line was' : 'lines were'} not understood and will be left out.` : '';
    if (!confirm(`Add ${count} ideas from “${file.name}” to your own ideas? They wait in Ideas until you pick them for the menu.${skipped}`)) return;
    setMenu((m) => addIdeas(m, parsed.sections, newId));
    setDirty(true);
    setMsg(`Ideas added. Save to keep them, then pick from Ideas in each section.`);
  }

  function download(text: string, name: string) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    a.download = `${name.replace(/[^\w -]+/g, '').trim() || 'menu'}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // Wait for the ideas, so nothing taken out of the menu is mistaken for a new idea.
  if (!builtIn && !error) return <Spinner label="Loading the menu…" />;

  const item = editing ? menu.sections[editing.s]!.groups[editing.g]!.items[editing.i] : undefined;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="eyebrow text-follow">Everything a scene can be built from</p>
        <h1 className="font-display text-3xl text-lead-dark">Menu</h1>
        <p className="text-sm text-ink-soft">{pod.role === 'follow' ? `Fill it with what you’d love to do, so ${pod.title('lead')} only has to choose.` : `${pod.title('follow')} fills this in; you choose from it.`}</p>
      </header>

      <div className="card space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="m-lead">The one who leads</label>
            <input id="m-lead" className="input" value={menu.titles.lead} maxLength={40} onChange={(e) => change((m) => { m.titles.lead = e.target.value; })} />
          </div>
          <div>
            <label className="label" htmlFor="m-follow">The one who follows</label>
            <input id="m-follow" className="input" value={menu.titles.follow} maxLength={40} onChange={(e) => change((m) => { m.titles.follow = e.target.value; })} />
          </div>
          <div>
            <label className="label" htmlFor="m-switch-lead">When you switch, the one who leads</label>
            <input id="m-switch-lead" className="input" value={menu.switchTitles.lead} maxLength={40} placeholder={pod.members.find((x) => x.role === 'follow')?.display_name ?? ''}
              onChange={(e) => change((m) => { m.switchTitles.lead = e.target.value; })} />
          </div>
          <div>
            <label className="label" htmlFor="m-switch-follow">…and the one who follows</label>
            <input id="m-switch-follow" className="input" value={menu.switchTitles.follow} maxLength={40} placeholder={pod.members.find((x) => x.role === 'lead')?.display_name ?? ''}
              onChange={(e) => change((m) => { m.switchTitles.follow = e.target.value; })} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="m-name">Menu name</label>
          <input id="m-name" className="input" value={menu.name} maxLength={80} onChange={(e) => change((m) => { m.name = e.target.value; })} />
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" className="btn-quiet" onClick={() => setAsText('all')}>Edit it all as text</button>
          <label className="btn-quiet cursor-pointer">
            Import a menu file
            <input type="file" accept=".txt,.md,.json,text/plain,text/markdown,application/json" className="sr-only" aria-label="Import a menu file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f); }} />
          </label>
          <button type="button" className="btn-quiet" onClick={() => download(menuToText(menu), menu.name)}>Download as text</button>
          <label className="btn-quiet cursor-pointer">
            Import ideas
            <input type="file" accept=".txt,.md,.json,text/plain,text/markdown,application/json" className="sr-only" aria-label="Import ideas" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importIdeas(f); }} />
          </label>
          {ownIdeaCount(menu) > 0 && (
            <button type="button" className="btn-quiet" onClick={() => download(menu.library.filter((x) => x.groups.length).map(sectionText).join('\n\n') + '\n', `${menu.name} - our ideas`)}>
              Download our ideas ({ownIdeaCount(menu)})
            </button>
          )}
        </div>
        <p className="text-xs text-ink-soft">
          Each section has Ideas to pick from: tap to add. The text version reads like the paper sheet and opens in any notes app; a file with only some sections replaces just those.
        </p>
      </div>

      <Collapsible id="pacing" title="Lengths of day" open={open} setOpen={setOpen} summary={menu.pacing.map((p) => p.label).join(' · ')}>
        <p className="text-sm text-ink-soft">How long a scene can be when there’s no offered time. The day is made of two-hour blocks from its hours: 2 is a block at home, 4 adds one out, 8 adds a free hour and welcome home.</p>
        {menu.pacing.map((p, i) => (
          <div key={p.id} className="space-y-2 rounded-xl border border-line p-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Name" value={p.label} onChange={(v) => change((m) => { m.pacing[i]!.label = v; })} />
              <Num label="Hours" value={p.hours} onChange={(v) => change((m) => { m.pacing[i]!.hours = v; })} />
            </div>
            <Field label="Guide" value={p.note} onChange={(v) => change((m) => { m.pacing[i]!.note = v; })} />
          </div>
        ))}
      </Collapsible>

      <Collapsible id="rooms" title="Room bank" open={open} setOpen={setOpen} summary={`${menu.rooms.length} rooms`}>
        <Chips values={menu.rooms} onChange={(rooms) => change((m) => { m.rooms = rooms; })} placeholder="Add a room" />
      </Collapsible>

      {menu.sections.map((sec, si) => {
        const help = SECTION_KINDS.find((k) => k.kind === sec.kind)!.help;
        const count = sec.groups.reduce((n, g) => n + g.items.length, 0);
        return (
          <Collapsible key={sec.id} id={sec.id} title={`${si + 1}. ${sec.title.replace('{lead}', menu.titles.lead)}`} open={open} setOpen={setOpen} summary={`${count} ${count === 1 ? 'item' : 'items'}`}>
            <button type="button" className="btn-follow w-full" onClick={() => setIdeas(sec.kind)}>Ideas for {sec.title.replace('{lead}', menu.titles.lead)}</button>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-ink-soft">{help}</p>
              <span className="flex shrink-0 gap-3 text-sm">
                <button type="button" className="text-lead underline" onClick={() => setAsText(sec.kind)}>Edit as text</button>
                <button type="button" className="text-lead underline" onClick={() => download(sectionText(sec), `${menu.name} - ${sec.title}`)}>Download</button>
              </span>
            </div>
            <Field label="Section title" value={sec.title} onChange={(v) => change((m) => { m.sections[si]!.title = v; })} />
            {sec.groups.map((g, gi) => (
              <GroupEditor
                key={g.id}
                group={g}
                onTitle={(v) => change((m) => { m.sections[si]!.groups[gi]!.title = v; })}
                onRemove={() => { if (confirm(`Remove “${g.title}” and its ${g.items.length} items?`)) change((m) => { m.sections[si]!.groups.splice(gi, 1); }); }}
                onAdd={(label) => change((m) => { m.sections[si]!.groups[gi]!.items.push({ id: newId(), label }); })}
                onEdit={(i) => setEditing({ s: si, g: gi, i })}
              />
            ))}
            <button type="button" className="btn-quiet w-full" onClick={() => change((m) => { m.sections[si]!.groups.push({ id: newId(), title: 'New group', items: [] }); })}>+ Add a group</button>
          </Collapsible>
        );
      })}

      <RoleplaysEditor menu={menu} change={change} open={open} setOpen={setOpen} />
      <TemplatesEditor menu={menu} change={change} open={open} setOpen={setOpen} />

      <ErrorText>{error}</ErrorText>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper-raised/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <span className="text-sm text-ink-soft" role="status">{msg || (dirty ? 'Unsaved changes' : 'All saved')}</span>
          <button type="button" className="btn" disabled={!dirty || busy} onClick={save}>Save menu</button>
        </div>
      </div>

      <Sheet open={ideas !== null} onClose={() => setIdeas(null)} title={`Ideas: ${menu.sections.find((x) => x.kind === ideas)?.title ?? ''}`} wide>
        {ideas && !builtIn && <Spinner label="Loading ideas…" />}
        {ideas && builtIn && (
          <IdeasPicker
            menu={menu}
            kind={ideas}
            builtIn={builtIn}
            onForget={(label) => {
              if (!confirm(`Take “${label}” out of your ideas?`)) return;
              setMenu((m) => removeIdea(m, ideas, label));
              setDirty(true);
            }}
            onToggle={(groupTitle, idea) => {
              update((m) => toggleIdea(m, ideas, groupTitle, idea, newId));
              setDirty(true);
              setMsg('');
            }}
          />
        )}
      </Sheet>

      <Sheet open={asText !== null} onClose={() => setAsText(null)} title={asText === 'all' || !asText ? 'The menu as text' : `${menu.sections.find((x) => x.kind === asText)?.title ?? ''} as text`} wide>
        {asText && (
          <MenuTextEditor
            initial={asText === 'all' ? menuToText(menu) : sectionText(menu.sections.find((x) => x.kind === asText)!)}
            expect={asText === 'all' ? undefined : KIND_WORD[asText]}
            onCancel={() => setAsText(null)}
            onApply={(parsed) => {
              // Editing one section only ever changes that section.
              const scoped = asText === 'all' ? parsed : { sections: parsed.sections.filter((x) => x.kind === asText), warnings: [] };
              bring(scoped, asText === 'all' ? 'The menu' : menu.sections.find((x) => x.kind === asText)!.title);
              setAsText(null);
            }}
          />
        )}
      </Sheet>

      <Sheet open={!!item} onClose={() => setEditing(null)} title="Edit item">
        {item && editing && (
          <ItemForm
            item={item}
            onChange={(next) => change((m) => { m.sections[editing.s]!.groups[editing.g]!.items[editing.i] = next; })}
            onMove={(d) => change((m) => {
              const items = m.sections[editing.s]!.groups[editing.g]!.items;
              const j = editing.i + d;
              if (j < 0 || j >= items.length) return;
              [items[editing.i], items[j]] = [items[j]!, items[editing.i]!];
              setEditing({ ...editing, i: j });
            })}
            onRemove={() => { change((m) => { m.sections[editing.s]!.groups[editing.g]!.items.splice(editing.i, 1); }); setEditing(null); }}
          />
        )}
      </Sheet>
    </div>
  );
}

function GroupEditor({ group, onTitle, onRemove, onAdd, onEdit }: { group: MenuGroup; onTitle: (v: string) => void; onRemove: () => void; onAdd: (label: string) => void; onEdit: (i: number) => void }) {
  const [label, setLabel] = useState('');
  return (
    <div className="space-y-2 rounded-xl border border-line bg-paper p-3">
      <div className="flex items-center gap-2">
        <input className="input py-1.5 font-semibold" aria-label="Group title" value={group.title} onChange={(e) => onTitle(e.target.value)} maxLength={160} />
        <button type="button" className="text-sm text-stop underline" onClick={onRemove}>Remove</button>
      </div>
      <ul className="space-y-1.5">
        {group.items.map((it, i) => (
          <li key={it.id}>
            <button type="button" className="chip w-full justify-between" onClick={() => onEdit(i)}>
              <span>{it.label}{it.param ? ' ___' : ''}</span>
              <span className="flex shrink-0 gap-1 text-xs text-ink-soft">
                {it.needs?.map((n, j) => <span key={j} className="rounded bg-paper-sunk px-1.5 py-0.5">{proofText(n)}</span>)}
                {it.minutes ? <span className="rounded bg-paper-sunk px-1.5 py-0.5">{it.minutes} min</span> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (label.trim()) { onAdd(label.trim()); setLabel(''); } }}>
        <input className="input py-2" placeholder="Add an item" aria-label={`Add to ${group.title}`} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={160} />
        <button className="btn-quiet shrink-0">Add</button>
      </form>
    </div>
  );
}

function ItemForm({ item, onChange, onMove, onRemove }: { item: MenuItem; onChange: (i: MenuItem) => void; onMove: (d: number) => void; onRemove: () => void }) {
  const set = (patch: Partial<MenuItem>) => onChange({ ...item, ...patch });
  return (
    <div className="space-y-4">
      <div>
        <label className="label" htmlFor="it-label">What it is</label>
        <input id="it-label" className="input" value={item.label} maxLength={160} onChange={(e) => set({ label: e.target.value })} />
        <p className="mt-1 text-xs text-ink-soft">Put ___ where a number goes, like “Clamps for ___ mins”.</p>
      </div>
      <div>
        <label className="label" htmlFor="it-detail">Details (optional)</label>
        <textarea id="it-detail" className="input" rows={3} value={item.detail ?? ''} maxLength={600} onChange={(e) => set({ detail: e.target.value || undefined })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="it-param">Blank to fill (optional)</label>
          <input id="it-param" className="input" placeholder="e.g. mins" value={item.param ?? ''} maxLength={20} onChange={(e) => set({ param: e.target.value || undefined })} />
        </div>
        <div>
          <label className="label" htmlFor="it-min">Countdown (minutes)</label>
          <input id="it-min" className="input" type="number" min={1} max={1440} value={item.minutes ?? ''} onChange={(e) => set({ minutes: e.target.value ? Number(e.target.value) : undefined })} />
        </div>
      </div>
      <fieldset>
        <legend className="label">Proof to send</legend>
        <ProofEditor value={item.needs ?? []} onChange={(needs) => set({ needs: needs.length ? needs : undefined })} />
        <p className="mt-1 text-xs text-ink-soft">As many of each as you like: 3 photos, 2 videos, 10 notes for affirmations…</p>
      </fieldset>
      <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-4">
        <span className="flex gap-2">
          <button type="button" className="btn-quiet" onClick={() => onMove(-1)} aria-label="Move up">↑</button>
          <button type="button" className="btn-quiet" onClick={() => onMove(1)} aria-label="Move down">↓</button>
        </span>
        <button type="button" className="btn-quiet text-stop" onClick={onRemove}>Remove item</button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="label">{label}</span>
      <input className="input py-2" value={value} onChange={(e) => onChange(e.target.value)} maxLength={600} />
    </label>
  );
}

function Num({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block text-sm">
      <span className="label">{label}</span>
      <input className="input py-2" type="number" min={0} max={48} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </label>
  );
}

function Chips({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [v, setV] = useState('');
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {values.map((x, i) => (
          <span key={x} className="chip gap-1 py-1">
            {x}
            <button type="button" aria-label={`Remove ${x}`} className="px-1 text-ink-soft" onClick={() => onChange(values.filter((_, j) => j !== i))}>×</button>
          </span>
        ))}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const t = v.trim(); if (t && !values.includes(t)) onChange([...values, t]); setV(''); }}>
        <input className="input py-2" placeholder={placeholder} aria-label={placeholder} value={v} onChange={(e) => setV(e.target.value)} maxLength={60} />
        <button className="btn-quiet shrink-0">Add</button>
      </form>
    </div>
  );
}
