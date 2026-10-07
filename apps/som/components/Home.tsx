'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { api } from '@/lib/client/api';
import { emptyPlan, roleplayHistory } from '@/lib/plan';
import { sceneRole, type Role, type SceneStatus } from '@/lib/rules';
import { NotifyToggle } from './NotifyToggle';
import { AskRoleplay, lengthText, NewOffer, when as whenText } from './scene/Offer';
import { usePod } from './Pod';
import { useScenes, type ListedScene } from './scenes';
import { ErrorText, Section, Spinner, timeAgo } from './ui';

export const STATUS_LABEL: Record<SceneStatus, string> = {
  draft: 'Draft', offered: 'Offered', accepted: 'Accepted', proposed: 'Proposed', ready: 'Ready to start',
  active: 'Running', inspection: 'Inspection', aftercare: 'Aftercare', closed: 'Closed',
};

export function Home() {
  const pod = usePod();
  const router = useRouter();
  const { scenes, error: loadError } = useScenes();
  const [busy, setBusy] = useState(false);
  const [err, setError] = useState('');
  const error = err || loadError;
  const [offering, setOffering] = useState<'scene' | 'roleplay' | null>(null);

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
  // Roleplays asked for are kept apart from Select-O-Matic scenes (anything to answer comes first, either kind).
  const isRoleplay = (s: ListedScene) => Boolean(s.plan?.roleplay);
  const toAnswer = scenes?.filter((s) => s.status === 'offered' && s.offered_by !== pod.account.id) ?? [];
  const myOffers = scenes?.filter((s) => s.status === 'offered' && s.offered_by === pod.account.id && !isRoleplay(s)) ?? [];
  const byStart = (a: ListedScene, b: ListedScene) => (a.starts_at ?? '').localeCompare(b.starts_at ?? '');
  const upcoming = (scenes?.filter((s) => (s.status === 'accepted' || s.status === 'ready') && !isRoleplay(s)) ?? []).sort(byStart);
  const roleplays = (scenes?.filter((s) => isRoleplay(s) && ((s.status === 'offered' && s.offered_by === pod.account.id) || s.status === 'accepted' || s.status === 'ready')) ?? []).sort(byStart);
  const proposed = scenes?.filter((s) => s.status === 'proposed') ?? [];
  const lead = pod.role === 'lead';
  // A new offer starts from your last one of its kind; roleplays show how often (and when) they've been played.
  const [last, lastRoleplay] = useMemo(() => {
    const latest = (rp: boolean) => {
      const s = (scenes ?? []).filter((x) => x.offered_by === pod.account.id && x.starts_at && x.ends_at && Boolean(x.plan?.roleplay) === rp)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      return s ? { startsAt: s.starts_at!, endsAt: s.ends_at!, leads: s.switched ? 'follow' as const : 'lead' as const, id: s.id } : null;
    };
    return [latest(false), latest(true)] as const;
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
          <div className="grid gap-2">
            <button type="button" className={`${lead ? 'btn' : 'btn-follow'} w-full min-h-14 text-lg`} onClick={() => setOffering('scene')}>
              {lead ? `Offer ${pod.title('follow')} a scene` : `Ask ${pod.title('lead')} for a scene`}
            </button>
            <button type="button" className="btn-quiet w-full min-h-12" onClick={() => setOffering('roleplay')}>🎭 Ask for a roleplay</button>
          </div>
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
          {roleplays.length > 0 && (
            <Section title="Roleplays" eyebrow="🎭 Asked for and agreed">
              {roleplays.map((s) => <SceneCard key={s.id} s={s} />)}
            </Section>
          )}
          {proposed.length > 0 && (
            <Section title={pod.role === 'lead' ? 'Waiting for you' : 'Sent'} eyebrow="Proposed">
              {proposed.map((s) => <SceneCard key={s.id} s={s} />)}
            </Section>
          )}
          <Section title="Drafts" eyebrow="Build" action={<button type="button" className={pod.role === 'follow' ? 'btn-follow' : 'btn-quiet'} disabled={busy} onClick={newScene}>{lead ? 'Build one now' : 'New scene'}</button>}>
            {drafts.length ? drafts.map((s) => <SceneCard key={s.id} s={s} />) : <p className="text-sm text-ink-soft">No drafts. {pod.role === 'follow' ? `Start one and send it to ${pod.title('lead')}.` : `Start one, or wait for ${pod.title('follow')} to send you one.`}</p>}
            {partner && <p className="text-xs text-ink-soft">👁 You both see every draft as it’s built; only whoever started one can change it, send it or start it.</p>}
          </Section>
          {past.length > 0 && (
            <Section title="Past scenes" eyebrow="Record">
              {past.map((s) => <SceneCard key={s.id} s={s} />)}
            </Section>
          )}
        </>
      )}
      {scenes && <NewOffer key={`scene-${last?.id ?? 'none'}`} open={offering === 'scene'} onClose={() => setOffering(null)} last={last} />}
      {scenes && <AskRoleplay key={`roleplay-${lastRoleplay?.id ?? 'none'}`} open={offering === 'roleplay'} onClose={() => setOffering(null)} last={lastRoleplay} history={history} />}
    </div>
  );
}

/** Whose move it is on a scene, in a few words ("mine": it's yours to do now). */
function turnFor(s: ListedScene, pod: ReturnType<typeof usePod>): { mine: boolean; text: string } | null {
  const me = pod.account.id;
  const lead = sceneRole(pod.role, s.switched) === 'lead';
  const nameIn = (r: Role) => {
    const m = pod.members.find((x) => x.account_id !== me && sceneRole(x.role, s.switched) === r) ?? pod.members.find((x) => x.account_id !== me);
    return m ? pod.nameOf(m.account_id) : 'your partner';
  };
  const other = nameIn(lead ? 'follow' : 'lead');
  const passed = ['offered', 'accepted', 'ready'].includes(s.status) && s.ends_at !== null && new Date(s.ends_at).getTime() <= Date.now();
  if (passed) return { mine: s.offered_by === me || lead, text: s.offered_by === me || lead ? 'Its time passed: offer a new one, or call it off' : `Its time passed: ${other} can offer a new one` };
  if (s.paused_at) return { mine: false, text: 'Paused: nothing moves until it’s resumed' };
  switch (s.status) {
    case 'draft': return s.created_by === me ? { mine: true, text: 'Your draft: not sent yet' } : { mine: false, text: `${pod.nameOf(s.created_by)} is building it: not sent yet` };
    case 'proposed': return lead ? { mine: true, text: 'Your turn: look at it, then start it or give it a time' } : { mine: false, text: `With ${other} to look at` };
    case 'offered':
      if (s.offered_by === me) return s.change_requested ? { mine: true, text: `Your turn: ${other} asked for a change` } : { mine: false, text: `Waiting for ${other} to answer` };
      return { mine: true, text: s.roleplay ? 'Your turn: read it and answer' : 'Your turn: answer it' };
    case 'accepted': return lead ? { mine: true, text: `Your turn: build it and send it to ${other}` } : { mine: false, text: `${other} is building it` };
    case 'ready':
      if (s.roleplay) return { mine: false, text: 'It’s on: either of you starts it at the time' };
      return lead ? { mine: false, text: `Sent: ${other} starts it at the time` } : { mine: true, text: 'Sent to you: you start it at the time' };
    case 'active':
      if (s.roleplay) return { mine: lead, text: lead ? 'Playing now: you end it with aftercare' : 'Playing now' };
      return lead ? { mine: s.waiting > 0, text: s.waiting ? `Running: ${s.waiting} to review` : `Running: ${other} is on the tasks` } : { mine: true, text: 'Running: your tasks' };
    case 'inspection': return lead ? { mine: true, text: 'Your turn: inspect it' } : { mine: false, text: `${other} is inspecting it` };
    case 'aftercare': return s.close_votes.includes(me) ? { mine: false, text: `Aftercare: waiting for ${other} to be back to us` } : { mine: true, text: 'Aftercare: tap I’m back to us when you’re ready' };
    case 'closed': return null;
  }
}

function SceneCard({ s, big = false }: { s: ListedScene; big?: boolean }) {
  const pod = usePod();
  const turn = turnFor(s, pod);
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
      {turn && <p className={`text-sm ${turn.mine ? 'font-semibold text-lead' : 'text-ink-soft'}`}>{turn.mine ? '👉 ' : ''}{turn.text}</p>}
      {(s.switched || s.plan?.roleplay) && (
        <p className="text-sm font-medium text-follow-dark">{[s.plan?.roleplay && '🎭 Roleplay', s.switched && '⇄ Switched'].filter(Boolean).join(' · ')}</p>
      )}
      <p className="text-sm text-ink-soft">
        {s.tasks > 0 ? `${s.done} of ${s.tasks} done` : `By ${pod.nameOf(s.created_by)}`} · {timeAgo(when)}
        {s.waiting > 0 && (s.status === 'active' || s.status === 'inspection') && <span className="ml-2 rounded-full bg-follow-light px-2 py-0.5 font-medium text-follow-dark">{s.waiting} to review</span>}
        {s.delete_votes.length > 0 && <span className="ml-2 rounded-full bg-stop-light px-2 py-0.5 font-medium text-stop">Delete requested</span>}
      </p>
    </Link>
  );
}
