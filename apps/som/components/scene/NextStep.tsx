'use client';

import { EARLY_START, startState } from '@/lib/rules';
import { usePod } from '../Pod';
import { when } from './Offer';
import type { SceneData } from './useScene';

// At the top of every scene: where it stands, what (if anything) is yours
// to do now, and what comes next, so nobody is left wondering whether it's
// stuck or over.

const STEPS = {
  tasks: ['Plan & agree', 'Build & send', 'Start', 'Do it', 'Inspection', 'Aftercare'],
  roleplay: ['Plan & agree', 'Start', 'Play it', 'Aftercare'],
} as const;

type Who = 'you' | 'them' | 'both' | 'soon' | 'done';
export interface Guide { who: Who; waitingOn?: string; now: string; next?: string; /** Who else can see it, when that's worth saying. */ seen?: string }

const clock = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** Which step a scene is on (STEPS.length when it's closed). */
function stepOf(status: SceneData['scene']['status'], roleplay: boolean): number {
  const order = roleplay
    ? { draft: 0, proposed: 0, offered: 0, accepted: 0, ready: 1, active: 2, inspection: 3, aftercare: 3, closed: 4 }
    : { draft: 0, proposed: 0, offered: 0, accepted: 1, ready: 2, active: 3, inspection: 4, aftercare: 5, closed: 6 };
  return order[status];
}

/** What now, and what next, for this person in this scene. */
export function guideFor(data: SceneData, pod: ReturnType<typeof usePod>): Guide {
  const { scene, role, plan } = data;
  const L = pod.title('lead');
  const F = pod.title('follow');
  const lead = role === 'lead';
  const rp = scene.roleplay;
  const mine = scene.offered_by === data.me;
  const other = lead ? F : L;
  const nameOf = (id: string | null) => (id ? (id === data.me ? 'you' : pod.nameOf(id)) : 'your partner');
  const at = when(scene.starts_at, scene.ends_at);
  const opens = scene.starts_at ? clock(new Date(new Date(scene.starts_at).getTime() - EARLY_START)) : '';
  const timing = startState(scene.starts_at ? new Date(scene.starts_at) : null, scene.ends_at ? new Date(scene.ends_at) : null, new Date(Date.now() + data.skew));
  const built = plan.blocks.some((b) => b.items.length) || plan.customs.length > 0;

  switch (scene.status) {
    case 'draft': {
      // Drafts show to everyone in the pod as they're built; only the author changes or sends one (ownsDraft).
      const author = pod.nameOf(scene.created_by);
      const watchers = data.members.filter((m) => m.account_id !== data.me && m.has_key).map((m) => pod.nameOf(m.account_id)).join(' and ');
      if (scene.created_by !== data.me) {
        return { who: 'them', waitingOn: author, now: `${author} is still building this draft. You see it as it saves; only ${author} can change it.`, next: `You’ll get a notification when ${author} sends it or offers it to you.` };
      }
      const seen = watchers ? `${watchers} can see this draft as it saves, but can’t change it. Nothing is sent until you send or offer it.` : undefined;
      if (plan.roleplay) return { who: 'you', now: 'This roleplay isn’t on: it was turned down or called off.', next: 'Offer a time to ask again, or delete it.', seen };
      return lead
        ? { who: 'you', now: 'Your draft. Pick what goes in each block, or tap Fill it for me; it saves as you go.', next: `Then Offer a time (${F} sees the whole scene before saying yes), or Start now.`, seen }
        : { who: 'you', now: 'Your draft. Pick what goes in each block, or tap Fill it for me; it saves as you go.', next: `Then Send to ${L} to look at, or Offer a time.`, seen };
    }
    case 'proposed':
      return lead
        ? { who: 'you', now: `${pod.nameOf(scene.created_by)} sent you this scene to look at. Change anything you like.`, next: `Then Start now, Offer a time for later, or Not now (it goes back to ${F}).` }
        : { who: 'them', waitingOn: L, now: `Sent to ${L}. It’s with them now; you can take it back to change it.`, next: `${L} starts it, gives it a time, or says not now. You’ll get a notification either way.` };
    case 'offered': {
      if (scene.ends_at && new Date(scene.ends_at).getTime() <= Date.now() + data.skew) {
        return mine ? { who: 'you', now: 'Its time passed before it was answered.', next: 'Offer a new time, or take it back.' } : { who: 'them', waitingOn: nameOf(scene.offered_by), now: 'Its time passed before you answered.', next: `${nameOf(scene.offered_by)} can offer a new time.` };
      }
      if (mine) {
        if (scene.change_request) return { who: 'you', now: `${other} asked for a change (below).`, next: 'Agree to it, offer a different time, or take it back.' };
        return {
          who: 'them', waitingOn: other,
          now: `${other} reads it and answers: yes, a change, or not this time.`,
          next: rp ? 'You’ll get a notification when they answer; a yes means it’s on. Talk it over in the notes meanwhile.' : 'You’ll get a notification when they answer. Talk it over in the notes meanwhile.',
        };
      }
      if (rp) return { who: 'you', now: 'Read the roleplay below and talk it over in the notes if you like.', next: 'Accept and it’s on (nothing to build), ask for a change, or say not this time.' };
      return {
        who: 'you',
        now: 'Read what’s planned below, then accept, ask for a change, or say not this time.',
        next: lead ? 'Once you accept, you build it and send it.' : built ? `It’s built: once you accept, ${L} sends it and you start it at the time.` : `Once you accept, ${L} builds it and sends it; you see every task before it starts.`,
      };
    }
    case 'accepted':
      return lead
        ? { who: 'you', now: `Agreed for ${at}. Now build it: pick what goes in each block, or tap Fill it for me.`, next: `Then Send to ${F}: they see every task and start it at the time.` }
        : { who: 'them', waitingOn: L, now: `Agreed for ${at}. ${L} is building it now.`, next: 'You’ll get a notification when it’s sent, and see every task before you start it.' };
    case 'ready':
      if (timing === 'over') return { who: lead ? 'you' : 'them', waitingOn: L, now: 'Its time passed without it starting.', next: lead ? 'Take it back to offer a new time, or call it off.' : `${L} can offer a new time, or either of you can call it off.` };
      if (rp) {
        return timing === 'early'
          ? { who: 'soon', now: `It’s on for ${at}. Either of you starts it, from ${opens}.`, next: `Then play it out; ${L} ends it with Time for aftercare (no inspection, no scores).` }
          : { who: 'both', now: 'It’s time: either of you taps Start the scene.', next: `Then play it out; ${L} ends it with Time for aftercare (no inspection, no scores).` };
      }
      if (lead) return { who: 'them', waitingOn: F, now: `Sent. ${F} starts it at the time (from ${opens}); you’ll get a notification.`, next: `While it runs you review what ${F} sends and can demand or praise any time. Then the inspection.` };
      return timing === 'early'
        ? { who: 'soon', now: `It’s on for ${at}. You start it yourself, from ${opens}. Look over the tasks below${plan.ahead.length ? ' and get ready what’s on the list' : ''}.`, next: `Once started: do each task and send its proof; ${L} reviews as you go.` }
        : { who: 'you', now: 'It’s time: tap Start the scene.', next: `Then do each task and send its proof; ${L} reviews as you go.` };
    case 'active': {
      if (scene.paused_at) {
        const byMe = scene.paused_by === data.me;
        return { who: byMe ? 'you' : 'them', waitingOn: nameOf(scene.paused_by), now: 'Paused: nothing moves, and no timers run.', next: byMe ? 'Resume it when you’re both ready.' : `${nameOf(scene.paused_by)} resumes it when you’re both ready.` };
      }
      if (rp) {
        return lead
          ? { who: 'you', now: 'Playing it: the roleplay is below.', next: 'When it’s played out, tap Time for aftercare at the bottom. No inspection, no scores.' }
          : { who: 'both', now: 'Playing it: the roleplay is below.', next: `${L} ends it with Time for aftercare; then you each say what you loved.` };
      }
      const checkins = scene.checkin_minutes ? ` Check in every ${scene.checkin_minutes} minutes.` : scene.checkin_blocks ? ' Check in at the end of each block.' : '';
      return lead
        ? { who: 'you', now: `It’s running. Review what ${F} sends (approve it or send it back); demand or praise any time.`, next: 'When it’s done, tap Start the inspection at the bottom, then aftercare.' }
        : { who: 'you', now: `It’s running. Tap a task, do it, and send its proof.${checkins}`, next: `${L} reviews as you go and can send demands any time. When it’s done, ${L} inspects it.` };
    }
    case 'inspection': {
      const shared = data.entries.some((e) => e.kind === 'scores' && e.body);
      if (lead) return shared ? { who: 'you', now: `Shared with ${F}.`, next: 'Tap Time for aftercare when you’re ready.' } : { who: 'you', now: 'Inspect it: give every task a score, then fill in the overall scorecard, rewards and consequences.', next: `Share it with ${F}, then Time for aftercare.` };
      return shared ? { who: 'them', waitingOn: L, now: 'Your scorecard is below.', next: `${L} starts aftercare next.` } : { who: 'them', waitingOn: L, now: `${L} is going over everything you did.`, next: 'Your scores and rewards show here when they share them; then aftercare.' };
    }
    case 'aftercare': {
      const voted = scene.close_votes.includes(data.me);
      const left = data.members.filter((m) => m.account_id !== data.me && m.has_key && !scene.close_votes.includes(m.account_id));
      if (voted) return { who: 'them', waitingOn: left.map((m) => pod.nameOf(m.account_id)).join(' and ') || 'your partner', now: 'Your side is done.', next: 'It closes when they tap I’m back to us too.' };
      return { who: 'both', now: `Take your time. Go through the aftercare together${rp ? ' and say what you loved and didn’t' : ''}; a reflection is optional.`, next: 'When you’re ready, tap I’m back to us at the bottom. It closes once you both have.' };
    }
    case 'closed':
      return { who: 'done', now: 'Closed. Everything stays here for both of you.', next: 'You can add a reflection any time.' };
  }
}

export function NextStep({ data }: { data: SceneData }) {
  const pod = usePod();
  const g = guideFor(data, pod);
  const steps = data.scene.roleplay ? STEPS.roleplay : STEPS.tasks;
  const at = stepOf(data.scene.status, data.scene.roleplay);
  const label = { you: 'Your turn', both: 'Both of you', soon: 'Coming up', done: 'All done', them: `Waiting for ${g.waitingOn ?? 'your partner'}` }[g.who];
  const tone = g.who === 'you' || g.who === 'both' ? 'border-lead bg-lead-light' : 'border-line bg-paper-raised';
  return (
    <section className={`card space-y-2 ${tone}`} aria-label="What now">
      <p className={`eyebrow ${g.who === 'you' || g.who === 'both' ? 'text-lead' : 'text-ink-soft'}`}>{g.who === 'you' ? '👉 ' : ''}{label}</p>
      <p className="font-medium">{g.now}</p>
      {g.next && <p className="text-sm text-ink-soft"><span className="font-semibold">Next:</span> {g.next}</p>}
      {g.seen && <p className="text-sm text-ink-soft">👁 {g.seen}</p>}
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 pt-1 text-xs" aria-label="Steps">
        {steps.flatMap((s, i) => [
          ...(i ? [<li key={`${s}-sep`} aria-hidden className="text-ink-faint">›</li>] : []),
          <li key={s} className={i < at ? 'text-ink-faint' : i === at ? 'rounded-full bg-lead px-2 py-0.5 font-semibold text-white' : 'text-ink-soft'} aria-current={i === at ? 'step' : undefined}>
            {i < at ? `✓ ${s}` : s}
          </li>,
        ])}
      </ol>
    </section>
  );
}
