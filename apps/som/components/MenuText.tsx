'use client';

import { useMemo, useState } from 'react';
import { textToMenu, type ParsedMenu } from '@/lib/menu-text';

/**
 * A text box for editing the menu (or one section of it) as plain text,
 * with what was understood and any lines that weren't, as you type.
 */
export function MenuTextEditor({ initial, onApply, onCancel, expect }: {
  initial: string;
  onApply: (parsed: ParsedMenu) => void;
  onCancel: () => void;
  /** Editing one section: what to call it if the heading goes missing. */
  expect?: string;
}) {
  const [text, setText] = useState(initial);
  const parsed = useMemo(() => {
    const body = expect && !/^\s*##\s/m.test(text) ? `## ${expect}\n${text}` : text;
    return textToMenu(body);
  }, [text, expect]);
  const items = parsed.sections.reduce((n, s) => n + s.groups.reduce((k, g) => k + g.items.length, 0), 0);
  const groups = parsed.sections.reduce((n, s) => n + s.groups.length, 0);
  const changed = text !== initial;

  return (
    <div className="space-y-3">
      <textarea
        className="input min-h-[50dvh] font-mono text-[13px] leading-relaxed"
        value={text}
        spellCheck={false}
        autoCapitalize="off"
        aria-label="Menu as text"
        onChange={(e) => setText(e.target.value)}
      />
      <p className="text-sm text-ink-soft" role="status">
        {parsed.sections.length > 1 ? `${parsed.sections.length} sections, ` : ''}{groups} {groups === 1 ? 'group' : 'groups'}, {items} {items === 1 ? 'item' : 'items'}
        {parsed.pacing ? `, ${parsed.pacing.length} pacing` : ''}{parsed.rooms ? `, ${parsed.rooms.length} rooms` : ''}
      </p>
      {parsed.warnings.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-warn-light p-3 text-sm text-warn" aria-label="Lines not understood">
          {parsed.warnings.map((w) => <li key={w}>{w}</li>)}
          <li className="text-ink-soft">Those lines are left out if you apply now.</li>
        </ul>
      )}
      <details className="rounded-xl bg-paper-sunk p-3 text-sm">
        <summary className="cursor-pointer font-medium">How to write it</summary>
        <ul className="mt-2 space-y-1.5 text-ink-soft">
          <li><code>## Play</code> starts a section (Presentation, Domain, Errands, Tasks, Play, Arrival, Inspection, Outcomes, Service, Aftercare). Add <code>: your title</code> to rename it.</li>
          <li><code>### Group name</code> starts a group.</li>
          <li><code>- An item</code>, one per line.</li>
          <li><code>[2 photos (before &amp; after) + 1 video]</code> after an item is the proof: photos, videos, voice notes, notes, as many of each as you like.</li>
          <li><code>(15 min)</code> after an item is a countdown.</li>
          <li><code>___</code> in an item is a blank to fill in when it’s picked; <code>{'{mins}'}</code> says what goes there.</li>
          <li>Lines under an item, indented with two spaces, are its details.</li>
          <li><code>Note: …</code> right under a section heading is shown with it.</li>
        </ul>
      </details>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-quiet" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn" disabled={!changed} onClick={() => onApply(parsed)}>Apply</button>
      </div>
    </div>
  );
}
