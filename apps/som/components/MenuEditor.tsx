'use client';

import { useEffect, useState } from 'react';
import { cleanMenu, newId, proofText, SECTION_KINDS, type Menu, type MenuGroup, type MenuItem } from '@/lib/menu';
import { ProofEditor } from './ProofEditor';
import { usePod } from './Pod';
import { ErrorText, Sheet } from './ui';


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

  useEffect(() => { if (!dirty) setMenu(pod.menu); }, [pod.menu, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const change = (fn: (m: Menu) => void) => {
    setMenu((m) => {
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
      await pod.saveMenu(menu);
      setDirty(false);
      setMsg('Saved.');
    } catch (err) {
      setError((err as Error).message);
      setDirty(false);
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file: File) {
    try {
      const parsed = cleanMenu(JSON.parse(await file.text()));
      const items = parsed.sections.reduce((n, s) => n + s.groups.reduce((k, g) => k + g.items.length, 0), 0);
      if (!confirm(`Replace the whole menu with “${parsed.name}” (${items} items)? Scenes already started keep their tasks.`)) return;
      setMenu(parsed);
      setDirty(true);
      setMsg('Imported. Check it over, then Save.');
    } catch {
      setError('That file isn’t a menu S-O-M can read.');
    }
  }

  function exportFile() {
    const blob = new Blob([JSON.stringify(menu, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${menu.name.replace(/[^\w -]+/g, '').trim() || 'menu'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

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
        </div>
        <div>
          <label className="label" htmlFor="m-name">Menu name</label>
          <input id="m-name" className="input" value={menu.name} maxLength={80} onChange={(e) => change((m) => { m.name = e.target.value; })} />
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <label className="btn-quiet cursor-pointer">
            Import a menu file
            <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f); }} />
          </label>
          <button type="button" className="btn-quiet" onClick={exportFile}>Download a copy</button>
        </div>
      </div>

      <Collapsible id="pacing" title="Pacing guide" open={open} setOpen={setOpen} summary={menu.pacing.map((p) => p.label).join(' · ')}>
        {menu.pacing.map((p, i) => (
          <div key={p.id} className="space-y-2 rounded-xl border border-line p-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Field label="Name" value={p.label} onChange={(v) => change((m) => { m.pacing[i]!.label = v; })} />
              <Num label="Hours" value={p.hours} onChange={(v) => change((m) => { m.pacing[i]!.hours = v; })} />
              <Num label="Rooms" value={p.rooms} onChange={(v) => change((m) => { m.pacing[i]!.rooms = v; })} />
              <Num label="Play breaks" value={p.playBreaks} onChange={(v) => change((m) => { m.pacing[i]!.playBreaks = v; })} />
              <Num label="Praise tasks" value={p.praise} onChange={(v) => change((m) => { m.pacing[i]!.praise = v; })} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.errands} onChange={(e) => change((m) => { m.pacing[i]!.errands = e.target.checked; })} /> Errands</label>
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
          <Collapsible key={sec.id} id={sec.id} title={`${si + 1}. ${sec.title}`} open={open} setOpen={setOpen} summary={`${count} ${count === 1 ? 'item' : 'items'}`}>
            <p className="text-sm text-ink-soft">{help}</p>
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

      <ErrorText>{error}</ErrorText>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper-raised/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <span className="text-sm text-ink-soft" role="status">{msg || (dirty ? 'Unsaved changes' : 'All saved')}</span>
          <button type="button" className="btn" disabled={!dirty || busy} onClick={save}>Save menu</button>
        </div>
      </div>

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

function Collapsible({ id, title, summary, open, setOpen, children }: { id: string; title: string; summary: string; open: string | null; setOpen: (v: string | null) => void; children: React.ReactNode }) {
  const isOpen = open === id;
  return (
    <section className="card p-0">
      <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : id)}>
        <span className="font-display text-lg text-lead-dark">{title}</span>
        <span className="text-sm text-ink-soft">{summary} {isOpen ? '▴' : '▾'}</span>
      </button>
      {isOpen && <div className="space-y-3 border-t border-line px-4 py-4">{children}</div>}
    </section>
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
