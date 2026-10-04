'use client';

import { useMemo, useState } from 'react';
import { ideasFor, inMenu, type IdeaGroup } from '@/lib/ideas';
import { proofText, type Menu, type MenuItem, type MenuSection, type SectionKind } from '@/lib/menu';

/**
 * Ideas for one section of the menu: tap one to add it to the menu, tap
 * again to take it out. Your own ideas (from an ideas pack) come first.
 */
export function IdeasPicker({ menu, kind, builtIn, onToggle, onForget }: {
  menu: Menu;
  kind: SectionKind;
  /** The built-in ideas, titles already filled in. */
  builtIn: MenuSection[];
  onToggle: (groupTitle: string, idea: MenuItem) => void;
  /** Take one of your own ideas out of the pool. */
  onForget: (label: string) => void;
}) {
  const [q, setQ] = useState('');
  const all = useMemo(() => ideasFor(menu, kind, builtIn), [menu, kind, builtIn]);
  const query = q.trim().toLowerCase();
  const groups: IdeaGroup[] = query
    ? all.map((g) => ({ ...g, items: g.items.filter((i) => `${i.label} ${i.detail ?? ''} ${g.title}`.toLowerCase().includes(query)) })).filter((g) => g.items.length)
    : all;
  const picked = all.reduce((n, g) => n + g.items.filter((i) => inMenu(menu, kind, i.label)).length, 0);
  const total = all.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="space-y-4">
      <div className="sticky -top-4 z-10 -mx-5 space-y-2 border-b border-line bg-paper px-5 pb-3 pt-1">
        <input className="input" type="search" placeholder={`Search ${total} ideas`} aria-label="Search ideas" value={q} onChange={(e) => setQ(e.target.value)} />
        <p className="text-sm text-ink-soft" role="status">{picked} in your menu. Tap to add or take out; then Save menu.</p>
      </div>
      {groups.length === 0 && <p className="text-sm text-ink-soft">Nothing matches “{q}”.</p>}
      {groups.map((g) => (
        <div key={g.title} className="space-y-2">
          <p className="eyebrow text-follow">{g.title}</p>
          <div className="flex flex-wrap gap-2">
            {g.items.map((it) => {
              const on = inMenu(menu, kind, it.label);
              return (
                <span key={it.label} className="inline-flex items-stretch">
                  <button type="button" className={`chip flex-col items-start gap-0.5 ${it.ours && !on ? 'rounded-r-none' : ''}`} aria-pressed={on} title={it.detail} onClick={() => onToggle(g.title, it)}>
                    <span>{on ? '✓ ' : '+ '}{it.label}</span>
                    {(it.needs?.length || it.minutes || it.ours) && (
                      <span className="text-xs font-normal text-ink-soft">
                        {[it.ours ? 'yours' : '', it.needs?.map(proofText).join(' + ') ?? '', it.minutes ? `${it.minutes} min` : ''].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </button>
                  {it.ours && !on && (
                    <button type="button" className="chip rounded-l-none border-l-0 px-2 text-ink-faint" aria-label={`Take “${it.label}” out of your ideas`} onClick={() => onForget(it.label)}>×</button>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
