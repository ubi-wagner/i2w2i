'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { mediaMeta, type MediaRow } from '@/lib/client/media';
import { SECTION_KINDS, type Proof } from '@/lib/menu';
import { noProof, proofProgress, type ProofCounts, type TaskKind } from '@/lib/plan';
import type { TaskStatus } from '@/lib/rules';
import { usePod } from '../Pod';
import { clock, timeAgo } from '../ui';
import { MediaGrid } from './Media';
import type { EntryView, TaskView } from './useScene';

export const TASK_LABEL: Record<TaskStatus, string> = {
  todo: 'To do', started: 'Doing', submitted: 'For review', returned: 'Sent back', approved: 'Approved', skipped: 'Skipped',
};

const TASK_TONE: Record<TaskStatus, string> = {
  todo: 'bg-paper-sunk text-ink-soft',
  started: 'bg-lead-light text-lead-dark',
  submitted: 'bg-follow-light text-follow-dark',
  returned: 'bg-warn-light text-warn',
  approved: 'bg-ok/10 text-ok',
  skipped: 'bg-paper-sunk text-ink-faint line-through',
};

export const KIND_ICON: Record<TaskKind, string> = {
  presentation: '✨', domain: '🧽', errands: '🛍️', tasks: '✍️', play: '⏱️', arrival: '🚪', inspection: '📋', outcomes: '⚖️', service: '🍽️', aftercare: '🤍', demand: '⚡',
};

/** "Presentation", "Domain maintenance"… or "Demand". */
export function kindTitle(kind: TaskKind): string {
  return kind === 'demand' ? 'Demand' : SECTION_KINDS.find((k) => k.kind === kind)?.title ?? '';
}

export const NEED_LABEL = { photo: '📷 Photo', video: '🎥 Video', audio: '🎙️ Voice', text: '✍️ Words' } as const;

export const MOODS = [
  { id: 'great', label: '😊 Great' },
  { id: 'ok', label: '🙂 Okay' },
  { id: 'meh', label: '😐 Meh' },
  { id: 'hard', label: '😟 Struggling' },
  { id: 'help', label: '🆘 Need you' },
] as const;
export const moodLabel = (id: unknown) => MOODS.find((m) => m.id === id)?.label ?? '';

export function TaskChip({ status }: { status: TaskStatus }) {
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${TASK_TONE[status]}`}>{TASK_LABEL[status]}{status === 'approved' ? ' ✓' : ''}</span>;
}

export function done(t: TaskView) {
  return t.status === 'approved' || t.status === 'skipped';
}

export function ProgressBar({ tasks }: { tasks: TaskView[] }) {
  const n = tasks.filter(done).length;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm text-ink-soft"><span>{n} of {tasks.length} done</span><span>{tasks.filter((t) => t.status === 'submitted').length} for review</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-paper-sunk"><div className="h-full rounded-full bg-follow transition-all" style={{ width: `${tasks.length ? (n / tasks.length) * 100 : 0}%` }} /></div>
    </div>
  );
}

/**
 * Notes, writing, check-ins and media in the order they were sent, like a
 * chat: yours on the right. Media sent with an entry shows under it.
 */
export function Timeline({ entries, media, reload, empty }: { entries: EntryView[]; media: MediaRow[]; reload: () => void; empty?: string }) {
  const pod = usePod();
  type Item = { at: string; entry?: EntryView; media?: MediaRow[] };
  const attached = new Set(entries.map((e) => e.id));
  const items: Item[] = [
    ...entries.map((e) => ({ at: e.created_at, entry: e })),
    ...media.filter((m) => !m.entry_id || !attached.has(m.entry_id)).map((m) => ({ at: m.created_at, media: [m] })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  // Media sent together by one person shows as one grid.
  const merged: Item[] = [];
  for (const it of items) {
    const last = merged[merged.length - 1];
    if (it.media && last?.media && last.media[0]!.uploader_id === it.media[0]!.uploader_id) last.media.push(...it.media);
    else merged.push(it);
  }
  if (!merged.length) return empty ? <p className="text-sm text-ink-soft">{empty}</p> : null;
  return (
    <ol className="space-y-3">
      {merged.map((it) => {
        const author = it.entry?.author_id ?? it.media![0]!.uploader_id;
        const mine = author === pod.account.id;
        return (
          <li key={it.entry?.id ?? it.media![0]!.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`${it.entry?.kind === 'writing' ? 'w-full' : 'max-w-[88%]'} space-y-1`}>
              {it.entry ? <EntryBubble e={it.entry} mine={mine} media={media.filter((m) => m.entry_id === it.entry!.id)} reload={reload} /> : <MediaGrid items={it.media!} onChange={reload} />}
              <p className={`px-1 text-[11px] text-ink-faint ${mine ? 'text-right' : ''}`}>{mine ? 'You' : pod.nameOf(author)} · {clock(it.at)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function EntryBubble({ e, mine, media, reload }: { e: EntryView; mine: boolean; media: MediaRow[]; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!confirm(media.length ? 'Delete this and what you sent with it, for both of you?' : 'Delete this for both of you?')) return;
    setBusy(true);
    try {
      await api(`/api/entries/${e.id}`, { method: 'DELETE' });
      reload();
    } catch (err) {
      alert((err as Error).message);
      setBusy(false);
    }
  }
  const text: string = e.body?.text ?? '';
  const tone = e.kind === 'praise' ? 'border-warn/40 bg-warn-light' : e.kind === 'checkin' ? 'border-lead/30 bg-lead-light' : mine ? 'border-follow/25 bg-follow-light' : 'border-line bg-paper-raised';
  return (
    <div className={`space-y-2 rounded-2xl border px-3.5 py-2.5 ${tone} ${busy ? 'opacity-50' : ''}`}>
      {e.kind === 'checkin' && <p className="text-sm font-semibold text-lead-dark">Check-in {moodLabel(e.body?.mood)}</p>}
      {e.kind === 'writing' && <p className="eyebrow text-follow">Writing</p>}
      {e.kind === 'praise' && <p className="eyebrow text-warn">✨ Praise</p>}
      {e.body === null && <p className="text-sm italic text-ink-soft">Couldn’t open this one.</p>}
      {Array.isArray(e.body?.items) ? (
        <ol className="list-decimal space-y-0.5 pl-5">{(e.body.items as string[]).map((it, i) => <li key={i} className="break-words">{it}</li>)}</ol>
      ) : text ? (
        <p className={`whitespace-pre-wrap break-words ${e.kind === 'writing' ? 'font-display text-[17px] leading-relaxed' : ''}`}>{text}</p>
      ) : null}
      <MediaGrid items={media} onChange={reload} />
      {mine && <button type="button" className="text-xs text-ink-faint underline" onClick={remove}>Delete</button>}
    </div>
  );
}

export function LastCheckin({ entries }: { entries: EntryView[] }) {
  const pod = usePod();
  const last = [...entries].reverse().find((e) => e.kind === 'checkin');
  if (!last) return <p className="text-sm text-ink-soft">No check-ins yet.</p>;
  return (
    <p className="text-sm">
      <b>{pod.nameOf(last.author_id)}</b> checked in {timeAgo(last.created_at)}: {moodLabel(last.body?.mood)}
      {last.body?.text ? <span className="text-ink-soft"> “{String(last.body.text).slice(0, 140)}”</span> : null}
    </p>
  );
}

/** Ticks that only matter on this phone (a checklist while getting ready). */
export function useLocalTicks(key: string): [Record<string, boolean>, (item: string) => void] {
  const [ticks, setTicks] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(`ticks:${key}`) ?? '{}') as Record<string, boolean>;
    } catch {
      return {};
    }
  });
  const toggle = (item: string) => setTicks((t) => {
    const next = { ...t, [item]: !t[item] };
    try { localStorage.setItem(`ticks:${key}`, JSON.stringify(next)); } catch { /* private mode */ }
    return next;
  });
  return [ticks, toggle];
}

export function Checklist({ items, ticks, toggle, disabled }: { items: string[]; ticks: Record<string, boolean>; toggle: (i: string) => void; disabled?: boolean }) {
  return (
    <ul className="space-y-1.5">
      {items.map((it) => (
        <li key={it}>
          <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-xl bg-paper-sunk px-3 py-2">
            <input type="checkbox" className="h-5 w-5 accent-[rgb(var(--follow))]" checked={Boolean(ticks[it])} disabled={disabled} onChange={() => toggle(it)} />
            <span className={ticks[it] ? 'text-ink-soft line-through' : ''}>{it}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/**
 * What the follow has sent for a task, by kind: photos, videos and voice
 * notes (from the encrypted descriptions, opened here), and notes (a list
 * of affirmations counts each line).
 */
export function useProofCounts(entries: EntryView[], media: MediaRow[], from: string[]): ProofCounts {
  const pod = usePod();
  const [kinds, setKinds] = useState<Record<string, string>>({});
  const mine = media.filter((m) => m.status === 'ready' && from.includes(m.uploader_id));
  const ids = mine.map((m) => m.id).join(',');
  useEffect(() => {
    let live = true;
    void Promise.all(mine.map(async (m) => [m.id, (await mediaMeta(m, pod.key).catch(() => null))?.kind ?? 'file'] as const))
      .then((pairs) => live && setKinds(Object.fromEntries(pairs)));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, pod.key]);
  const counts = noProof();
  for (const m of mine) {
    const k = kinds[m.id];
    if (k === 'photo' || k === 'video' || k === 'audio') counts[k] += 1;
  }
  for (const e of entries) {
    if (!from.includes(e.author_id) || (e.kind !== 'comment' && e.kind !== 'writing') || !e.body) continue;
    counts.text += Array.isArray(e.body.items) ? e.body.items.length : 1;
  }
  return counts;
}

export function ProofMeter({ needs, counts }: { needs: Proof[]; counts: ProofCounts }) {
  const rows = proofProgress(needs, counts);
  if (!rows.length) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Proof">
      {rows.map((r) => {
        const ok = r.have >= r.want;
        return (
          <li key={r.kind} className={`rounded-xl px-2.5 py-1 text-sm ${ok ? 'bg-ok/10 text-ok' : 'bg-paper-sunk text-ink'}`}>
            {NEED_LABEL[r.kind].split(' ')[0]} {r.have}/{r.want} {r.want === 1 ? NOUN[r.kind][0] : NOUN[r.kind][1]}
            {r.labels.length > 0 && <span className="text-ink-soft"> · {r.labels.join(', ')}</span>}
            {ok && ' ✓'}
          </li>
        );
      })}
    </ul>
  );
}

const NOUN = { photo: ['photo', 'photos'], video: ['video', 'videos'], audio: ['voice note', 'voice notes'], text: ['note', 'notes'] } as const;
