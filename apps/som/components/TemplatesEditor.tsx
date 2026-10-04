'use client';

import type { Menu } from '@/lib/menu';
import { usePod } from './Pod';
import { Collapsible } from './ui';

/** Templates on the Menu page: what each one sets, and deleting them. They're made when offering. */
export function TemplatesEditor({ menu, change, open, setOpen }: {
  menu: Menu;
  change: (fn: (m: Menu) => void) => void;
  open: string | null;
  setOpen: (v: string | null) => void;
}) {
  const pod = usePod();
  const leader = (r: 'lead' | 'follow') => pod.members.find((m) => m.role === r)?.display_name ?? menu.titles[r];
  return (
    <Collapsible id="templates" title="Templates" open={open} setOpen={setOpen} summary={`${menu.templates.length}`}>
      <p className="text-sm text-ink-soft">
        The shape of a scene to offer again: its hours, who leads, tasks or a roleplay, and a note. Never what’s in it, so each one’s new.
        Save one from “Save as a template” when you offer or ask for a scene.
      </p>
      {menu.templates.length === 0 && <p className="text-sm text-ink-soft">None yet.</p>}
      <ul className="space-y-1.5">
        {menu.templates.map((t) => (
          <li key={t.id} className="flex items-start justify-between gap-3 rounded-xl border border-line px-3 py-2">
            <span className="min-w-0">
              <span className="block font-medium">{t.name}</span>
              <span className="block text-xs text-ink-soft">{t.from}–{t.until} · {leader(t.leads)} leads · {t.kind === 'roleplay' ? '🎭 a roleplay' : 'tasks'}</span>
            </span>
            <button type="button" className="shrink-0 text-sm text-stop underline" onClick={() => change((m) => { m.templates = m.templates.filter((x) => x.id !== t.id); })}>Delete</button>
          </li>
        ))}
      </ul>
    </Collapsible>
  );
}
