'use client';

import { MAX_PROOF_COUNT, NEEDS, type Need, type Proof } from '@/lib/menu';

export const NEED_NAME: Record<Need, string> = { photo: '📷 Photos', video: '🎥 Videos', audio: '🎙️ Voice notes', text: '✍️ Notes' };

/**
 * Required proof as a list: how many of each, with an optional label
 * ("before & after", "affirmations"). Several rows of one kind are fine.
 */
export function ProofEditor({ value, onChange, disabled }: { value: Proof[]; onChange: (v: Proof[]) => void; disabled?: boolean }) {
  const set = (i: number, patch: Partial<Proof>) => onChange(value.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <div className="space-y-2">
      {value.map((p, i) => (
        <div key={i} className="grid grid-cols-[4.5rem_1fr] gap-2 rounded-xl bg-paper-sunk p-2 sm:grid-cols-[4.5rem_9rem_1fr_auto]">
          <input className="input px-2 py-1.5 text-center" type="number" min={1} max={MAX_PROOF_COUNT} aria-label="How many" disabled={disabled} value={p.count}
            onChange={(e) => set(i, { count: Math.min(MAX_PROOF_COUNT, Math.max(1, Number(e.target.value) || 1)) })} />
          <select className="input py-1.5" aria-label="Kind of proof" disabled={disabled} value={p.kind} onChange={(e) => set(i, { kind: e.target.value as Need })}>
            {NEEDS.map((n) => <option key={n} value={n}>{NEED_NAME[n]}</option>)}
          </select>
          <input className="input col-span-2 py-1.5 sm:col-span-1" placeholder="Label (optional), e.g. before & after" aria-label="Label" disabled={disabled} maxLength={40} value={p.label ?? ''}
            onChange={(e) => set(i, { label: e.target.value || undefined })} />
          {!disabled && <button type="button" className="col-span-2 text-sm text-stop underline sm:col-span-1" onClick={() => onChange(value.filter((_, j) => j !== i))}>Remove</button>}
        </div>
      ))}
      {!disabled && value.length < 8 && (
        <div className="flex flex-wrap gap-2">
          {NEEDS.map((n) => (
            <button key={n} type="button" className="btn-quiet min-h-9 px-3 py-1 text-sm" onClick={() => onChange([...value, { kind: n, count: 1 }])}>+ {NEED_NAME[n]}</button>
          ))}
        </div>
      )}
    </div>
  );
}
