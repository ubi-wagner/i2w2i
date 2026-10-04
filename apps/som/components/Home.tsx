'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { api } from '@/lib/client/api';
import { emptyPlan, roleplayHistory } from '@/lib/plan';
import type { SceneStatus } from '@/lib/rules';
import { NotifyToggle } from './NotifyToggle';
import { lengthText, NewOffer, when as whenText } from './scene/Offer';
import { usePod } from './Pod';
import { useScenes, type ListedScene } from './scenes';
import { ErrorText, Section, Spinner, timeAgo } from './ui';

export const STATUS_LABEL: Record<SceneStatus, string> = {
  draft: 'Draft', offered: 'Offered', accepted: 'Accepted', proposed: 'Waiting to start', ready: 'Ready to start',
  active: 'Running', inspection: 'Inspection', aftercare: 'Aftercare', closed: 'Closed',
};

export function Home() {
  const pod = usePod();
  const router = useRouter();
  const { scenes, error: loadError } = useScenes();
  const [busy, setBusy] = useState(false);
  const [err, setError] = useState('');
  const error = err || loadError;
  const [offering, setOffering] = useState(false);

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
  const toAnswer = scenes?.filter((s) => s.status === 'offered' && s.offered_by !== pod.account.id) ?? [];
  const myOffers = scenes?.filter((s) => s.status === 'offered' && s.offered_by === pod.account.id) ?? [];
  const upcoming = (scenes?.filter((s) => s.status === 'accepted' || s.status === 'ready') ?? [])
    .sort((a, b) => (a.starts_at ?? '').localeCompare(b.starts_at ?? ''));
  const proposed = scenes?.filter((s) => s.status === 'proposed') ?? [];
  const lead = pod.role === 'lead';
  // A new offer starts from your last one; roleplays show how often (and when) they've been played.
  const last = useMemo(() => {
    const s = (scenes ?? []).filter((x) => x.offered_by === pod.account.id && x.starts_at && x.ends_at).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    return s ? { startsAt: s.starts_at!, endsAt: s.ends_at!, leads: s.switched ? 'follow' as const : 'lead' as const, kind: s.plan?.roleplay ? 'roleplay' as const : 'tasks' as const, id: s.id } : null;
  }, [scenes, pod.account.id]);
  const history = useMemo(() => roleplayHistory(scenes ?? []), [scenes]);
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
          <button type="button" className={`${lead ? 'btn' : 'btn-follow'} w-full min-h-14 text-lg`} onClick={() => setOffering(true)}>
            {lead ? `Offer ${pod.title('follow')} a scene` : `Ask ${pod.title('lead')} for a scene`}
          </button>
          {toAnswer.length > 0 && (
            <Section title="To answer" eyebrow="Offers">
              {toAnswer.map((s) => <SceneCard key={s.id} s={s} big />)}
            </Section>
          )}
          {myOffers.length > 0 && (
            <Section title="Waiting for an answer" eyebrow="Offers">
              {myOffers.map((s) => <SceneCard key={s.id} s={s} />)}
            </Section>
          )}
          {upcoming.length > 0 && (
            <Section title="Coming up" eyebrow="Agreed">
              {upcoming.map((s) => <SceneCard key={s.id} s={s} />)}
            </Section>
          )}
          {proposed.length > 0 && (
            <Section title={pod.role === 'lead' ? 'Waiting for you' : 'Sent'} eyebrow="Proposed">
              {proposed.map((s) => <SceneCard key={s.id} s={s} />)}
            </Section>
          )}
          <Section title="Drafts" eyebrow="Build" action={<button type="button" className={pod.role === 'follow' ? 'btn-follow' : 'btn-quiet'} disabled={busy} onClick={newScene}>{lead ? 'Build one now' : 'New scene'}</button>}>
            {drafts.length ? drafts.map((s) => <SceneCard key={s.id} s={s} />) : <p className="text-sm text-ink-soft">No drafts. {pod.role === 'follow' ? `Start one and send it to ${pod.title('lead')}.` : `Start one, or wait for ${pod.title('follow')} to send you one.`}</p>}
          </Section>
          {past.length > 0 && (
            <Section title="Past scenes" eyebrow="Record">
              {past.map((s) => <SceneCard key={s.id} s={s} />)}
            </Section>
          )}
        </>
      )}
      {scenes && <NewOffer key={last?.id ?? 'none'} open={offering} onClose={() => setOffering(false)} last={last} history={history} />}
    </div>
  );
}

function SceneCard({ s, big = false }: { s: ListedScene; big?: boolean }) {
  const pod = usePod();
  const when = s.closed_at ?? s.started_at ?? s.created_at;
  // An offer or a plan whose window has gone by without starting.
  const passed = ['offered', 'accepted', 'ready'].includes(s.status) && s.ends_at !== null && new Date(s.ends_at).getTime() <= Date.now();
  return (
    <Link href={`/scene/${s.id}`} className={`card block space-y-1 ${big ? 'border-lead/40 p-5' : ''} ${s.paused_at ? 'border-stop/50' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className={`font-display ${big ? 'text-2xl' : 'text-lg'}`}>{s.plan?.title || s.plan?.roleplay?.title || (s.offered_by ? `A scene from ${pod.nameOf(s.offered_by)}` : 'Untitled scene')}</h3>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.paused_at ? 'bg-stop text-white' : s.status === 'closed' ? 'bg-paper-sunk text-ink-soft' : 'bg-lead-light text-lead-dark'}`}>
          {s.paused_at ? 'Paused' : passed ? 'Time passed' : STATUS_LABEL[s.status]}
        </span>
      </div>
      {s.starts_at && ['offered', 'accepted', 'ready'].includes(s.status) && (
        <p className="font-medium text-lead-dark">{whenText(s.starts_at, s.ends_at)} <span className="font-normal text-ink-soft">({lengthText(s.starts_at, s.ends_at)})</span></p>
      )}
      {s.change_requested && <p className="text-sm font-medium text-follow-dark">Change asked for</p>}
      {(s.switched || s.plan?.roleplay) && (
        <p className="text-sm font-medium text-follow-dark">{[s.plan?.roleplay && '🎭 Roleplay', s.switched && '⇄ Switched'].filter(Boolean).join(' · ')}</p>
      )}
      <p className="text-sm text-ink-soft">
        {s.tasks > 0 ? `${s.done} of ${s.tasks} done` : `By ${pod.nameOf(s.created_by)}`} · {timeAgo(when)}
        {s.waiting > 0 && <span className="ml-2 rounded-full bg-follow-light px-2 py-0.5 font-medium text-follow-dark">{s.waiting} to review</span>}
        {s.delete_votes.length > 0 && <span className="ml-2 rounded-full bg-stop-light px-2 py-0.5 font-medium text-stop">Delete requested</span>}
      </p>
    </Link>
  );
}
