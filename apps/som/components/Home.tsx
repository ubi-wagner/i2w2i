'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { cleanPlan, emptyPlan, type Plan } from '@/lib/plan';
import type { SceneStatus } from '@/lib/rules';
import { NotifyToggle } from './NotifyToggle';
import { usePod } from './Pod';
import { ErrorText, Section, Spinner, timeAgo } from './ui';

interface SceneListRow { id: string; status: SceneStatus; plan_enc: string; created_by: string; created_at: string; started_at: string | null; closed_at: string | null; paused_at: string | null; delete_votes: string[]; tasks: number; done: number; waiting: number }

export const STATUS_LABEL: Record<SceneStatus, string> = {
  draft: 'Draft', proposed: 'Waiting to start', active: 'Running', inspection: 'Inspection', aftercare: 'Aftercare', closed: 'Closed',
};

export function Home() {
  const pod = usePod();
  const router = useRouter();
  const [scenes, setScenes] = useState<(SceneListRow & { plan: Plan | null })[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const r = await api<{ scenes: SceneListRow[] }>(`/api/pods/${pod.pod.id}/scenes`);
    setScenes(await Promise.all(r.scenes.map(async (s) => ({ ...s, plan: await pod.open(s.plan_enc, `plan:${s.id}`).then(cleanPlan).catch(() => null) }))));
  }, [pod]);
  useEffect(() => { void load().catch((e) => setError((e as Error).message)); }, [load]);

  async function newScene() {
    setBusy(true);
    try {
      const id = crypto.randomUUID();
      await api(`/api/pods/${pod.pod.id}/scenes`, { body: { id, planEnc: await pod.seal(emptyPlan(pod.menu), `plan:${id}`) } });
      router.push(`/scene/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const partner = pod.members.find((m) => m.account_id !== pod.account.id);
  const other = pod.role === 'lead' ? 'follow' : 'lead';
  const running = scenes?.filter((s) => ['active', 'inspection', 'aftercare'].includes(s.status)) ?? [];
  const proposed = scenes?.filter((s) => s.status === 'proposed') ?? [];
  const drafts = scenes?.filter((s) => s.status === 'draft') ?? [];
  const past = scenes?.filter((s) => s.status === 'closed') ?? [];

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="eyebrow text-follow">{pod.settings.name}</p>
        <h1 className="font-display text-3xl text-lead-dark">Hello, {pod.title(pod.role)}</h1>
      </header>

      {!partner && (
        <Link href="/settings#partner" className="card block border-follow/40 bg-follow-light">
          <b>Add {pod.title(other)}</b>
          <p className="text-sm text-ink-soft">Make their sign-in and key link, then text it to them.</p>
        </Link>
      )}
      {partner && !partner.has_key && (
        <div className="card border-warn/40 bg-warn-light text-sm">Waiting for {pod.title(partner.role)} to open their key link. Lost it? Make a new one in <Link href="/settings#partner" className="underline">Settings</Link>.</div>
      )}

      <div className="card"><NotifyToggle purpose={pod.role === 'lead' ? 'Hear when things are sent for review.' : 'Hear about new scenes, check-ins and arrivals.'} /></div>

      <ErrorText>{error}</ErrorText>
      {!scenes ? <Spinner /> : (
        <>
          {running.map((s) => <SceneCard key={s.id} s={s} big />)}
          {proposed.length > 0 && (
            <Section title={pod.role === 'lead' ? 'Waiting for you' : 'Sent'} eyebrow="Proposed">
              {proposed.map((s) => <SceneCard key={s.id} s={s} />)}
            </Section>
          )}
          <Section title="Drafts" eyebrow="Build" action={<button type="button" className={pod.role === 'follow' ? 'btn-follow' : 'btn'} disabled={busy} onClick={newScene}>New scene</button>}>
            {drafts.length ? drafts.map((s) => <SceneCard key={s.id} s={s} />) : <p className="text-sm text-ink-soft">No drafts. {pod.role === 'follow' ? `Start one and send it to ${pod.title('lead')}.` : `Start one, or wait for ${pod.title('follow')} to send you one.`}</p>}
          </Section>
          {past.length > 0 && (
            <Section title="Past scenes" eyebrow="Record">
              {past.map((s) => <SceneCard key={s.id} s={s} />)}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function SceneCard({ s, big = false }: { s: SceneListRow & { plan: Plan | null }; big?: boolean }) {
  const pod = usePod();
  const when = s.closed_at ?? s.started_at ?? s.created_at;
  return (
    <Link href={`/scene/${s.id}`} className={`card block space-y-1 ${big ? 'border-lead/40 p-5' : ''} ${s.paused_at ? 'border-stop/50' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className={`font-display ${big ? 'text-2xl' : 'text-lg'}`}>{s.plan?.title || 'Untitled scene'}</h3>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.paused_at ? 'bg-stop text-white' : s.status === 'closed' ? 'bg-paper-sunk text-ink-soft' : 'bg-lead-light text-lead-dark'}`}>
          {s.paused_at ? 'Paused' : STATUS_LABEL[s.status]}
        </span>
      </div>
      <p className="text-sm text-ink-soft">
        {s.tasks > 0 ? `${s.done} of ${s.tasks} done` : `By ${pod.nameOf(s.created_by)}`} · {timeAgo(when)}
        {s.waiting > 0 && <span className="ml-2 rounded-full bg-follow-light px-2 py-0.5 font-medium text-follow-dark">{s.waiting} to review</span>}
        {s.delete_votes.length > 0 && <span className="ml-2 rounded-full bg-stop-light px-2 py-0.5 font-medium text-stop">Delete requested</span>}
      </p>
    </Link>
  );
}
