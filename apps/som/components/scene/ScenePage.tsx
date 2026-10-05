'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client/api';
import { STATUS_LABEL } from '../Home';
import { SceneRoles, usePod } from '../Pod';
import { clock, ErrorText, Sheet, Spinner } from '../ui';
import { Builder } from './Builder';
import { BeingBuilt, OfferView, ReadyView } from './Offer';
import { NextStep } from './NextStep';
import { Notes, Running } from './Running';
import { TaskSheet } from './TaskSheet';
import { useScene, type SceneData } from './useScene';
import { Aftercare, Inspection, Record } from './Wrapup';

/** One scene, whatever stage it's at. */
export function ScenePage({ id }: { id: string }) {
  const { data, error, reload } = useScene(id);
  const [taskId, setTaskId] = useState<string | null>(null);

  // Notification links point at #task-<id>: open that task.
  useEffect(() => {
    const fromHash = () => {
      const m = /^#task-([0-9a-f-]{36})$/.exec(window.location.hash);
      if (m) setTaskId(m[1]!);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  // A new stage (yours or your partner's doing): back to the top, where it
  // says what's needed now; otherwise you're left looking at the old buttons.
  const status = data?.scene.status;
  const lastStatus = useRef(status);
  useEffect(() => {
    if (lastStatus.current && status && lastStatus.current !== status) window.scrollTo(0, 0);
    lastStatus.current = status;
  }, [status]);

  // Aftercare and the record are calmer: "us" colours.
  const us = data?.scene.status === 'aftercare' || data?.scene.status === 'closed';
  useEffect(() => {
    if (!us) return;
    document.documentElement.dataset.mode = 'us';
    return () => { delete document.documentElement.dataset.mode; };
  }, [us]);

  if (!data) {
    return error ? (
      <div className="card space-y-3 text-center">
        <p>{error === 'Not found' ? 'This scene isn’t here any more.' : error === 'offline' ? 'No connection. Check your signal and try again.' : error}</p>
        <Link href="/" className="btn">Back to scenes</Link>
      </div>
    ) : <Spinner />;
  }

  const { scene } = data;
  const task = data.tasks.find((t) => t.id === taskId);
  const close = () => {
    setTaskId(null);
    if (window.location.hash) history.replaceState(null, '', window.location.pathname);
  };

  return (
    <SceneRoles switched={scene.switched}>
    <div className="space-y-5">
      <SceneHeader data={data} />

      {error === 'Not found' ? (
        <div className="card space-y-3 text-center" role="status">
          <p>This scene isn’t here any more (it was deleted).</p>
          <Link href="/" className="btn">Back to scenes</Link>
        </div>
      ) : error && <p className="text-sm text-warn" role="status">{error === 'offline' ? 'Offline? Showing what was last loaded.' : `Couldn’t refresh: ${error}`}</p>}
      {data.planBroken && <p className="card border-stop/40 text-sm text-stop">This scene’s plan couldn’t be opened on this phone, so it can’t be changed from here. Try your other phone, or unlock this one again.</p>}
      <PausedBanner data={data} reload={reload} />
      <DeleteRequest data={data} reload={reload} />
      {/* Where it stands, what's yours to do now and what comes next (the pause banner says it while paused). */}
      {error !== 'Not found' && !scene.paused_at && <NextStep data={data} />}

      {scene.status === 'offered' && <OfferView data={data} reload={reload} />}
      {scene.status === 'accepted' && (data.role === 'lead' ? <Builder data={data} reload={reload} /> : <BeingBuilt data={data} reload={reload} />)}
      {scene.status === 'ready' && <ReadyView data={data} reload={reload} onOpen={setTaskId} />}
      {(scene.status === 'draft' || scene.status === 'proposed') && <Builder data={data} reload={reload} />}
      {scene.status === 'active' && <Running data={data} reload={reload} onOpen={setTaskId} />}
      {scene.status === 'inspection' && <Inspection data={data} reload={reload} onOpen={setTaskId} />}
      {scene.status === 'aftercare' && <Aftercare data={data} reload={reload} />}
      {scene.status === 'closed' && <Record data={data} reload={reload} onOpen={setTaskId} />}
      {/* Before it starts, talk it over here; the same notes carry on into the scene. */}
      {(scene.status === 'offered' || scene.status === 'accepted' || scene.status === 'ready') && <Notes data={data} reload={reload} title="Talk it over" />}

      <DeleteScene data={data} reload={reload} />

      {(scene.status === 'active' || scene.status === 'inspection') && <PauseBar data={data} reload={reload} />}

      <Sheet open={Boolean(task)} onClose={close} title={task?.body.title ?? 'Task'} wide>
        {task && <TaskSheet task={task} data={data} reload={reload} />}
      </Sheet>
    </div>
    </SceneRoles>
  );
}

/** A scene's name: its own, its roleplay's, or whose it is. */
export function sceneName(plan: SceneData['plan'], scene: SceneData['scene'], nameOf: (id: string) => string): string {
  return plan.title || plan.roleplay?.title || (scene.offered_by ? `A scene from ${nameOf(scene.offered_by)}` : 'Untitled scene');
}

function SceneHeader({ data }: { data: SceneData }) {
  const pod = usePod();
  const { scene } = data;
  return (
    <header className="space-y-1">
      <Link href="/" className="text-sm text-ink-soft">← Scenes</Link>
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-display text-3xl text-lead-dark">{sceneName(data.plan, scene, pod.nameOf)}</h1>
        <span className={`mt-2 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${scene.paused_at ? 'bg-stop text-white' : 'bg-lead-light text-lead-dark'}`}>
          {scene.paused_at ? 'Paused' : STATUS_LABEL[scene.status]}
        </span>
      </div>
      {scene.switched && <p className="text-sm font-medium text-follow-dark">⇄ Switched: {pod.title('lead')} leads, {pod.title('follow')} follows</p>}
    </header>
  );
}

async function setPaused(id: string, paused: boolean) {
  await api(`/api/scenes/${id}/pause`, { body: { paused } });
}

/**
 * The pause button, always in reach while the scene runs. Either of you can
 * pause; only the one who paused can resume, so a pause is never overruled.
 */
function PauseBar({ data, reload }: { data: SceneData; reload: () => Promise<void> }) {
  const { scene } = data;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (scene.paused_at) return null;
  async function pause() {
    setBusy(true);
    setError('');
    try {
      await setPaused(scene.id, true);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper-raised/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2.5">
        <span className="text-sm text-ink-soft">{error || 'Need a moment? Pause stops everything.'}</span>
        <button type="button" className="btn-stop shrink-0" disabled={busy} onClick={pause}>Pause</button>
      </div>
    </div>
  );
}

function PausedBanner({ data, reload }: { data: SceneData; reload: () => Promise<void> }) {
  const pod = usePod();
  const { scene } = data;
  const [error, setError] = useState('');
  if (!scene.paused_at) return null;
  const mine = scene.paused_by === data.me;
  async function resume() {
    setError('');
    try {
      await setPaused(scene.id, false);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <div className="card space-y-2 border-stop bg-stop-light" role="alert">
      <p className="font-display text-2xl text-stop">Paused</p>
      <p>
        {mine ? 'You' : scene.paused_by ? pod.nameOf(scene.paused_by) : 'Someone'} paused the scene at {clock(scene.paused_at)}. Tasks, timers and check-ins are stopped.
        {!mine && ' Check in with each other; it carries on when they resume it.'}
      </p>
      <ErrorText>{error}</ErrorText>
      {mine && <button type="button" className="btn" onClick={resume}>Resume</button>}
    </div>
  );
}

/** A partner has asked to delete this scene: say so at the top. */
function DeleteRequest({ data, reload }: { data: SceneData; reload: () => Promise<void> }) {
  const pod = usePod();
  const router = useRouter();
  const { scene } = data;
  const askers = scene.delete_votes.filter((v) => v !== data.me);
  if (!askers.length || scene.delete_votes.includes(data.me)) return null;
  async function agree() {
    if (!confirm('Delete the whole scene, with everything in it, for both of you? It can’t be undone.')) return;
    const r = await api<{ deleted: boolean }>(`/api/scenes/${scene.id}/delete`, { body: { agree: true } });
    if (r.deleted) router.replace('/');
    else await reload();
  }
  return (
    <div className="card space-y-2 border-stop/50 bg-stop-light">
      <p>{askers.map((a) => pod.nameOf(a)).join(' and ')} would like to delete this scene and everything in it. It goes only if you agree.</p>
      <button type="button" className="btn-stop" onClick={agree}>Agree and delete</button>
    </div>
  );
}

/**
 * Deleting a whole scene: everyone has to agree (a draft nobody else has
 * seen yet is just its author's to delete).
 */
function DeleteScene({ data, reload }: { data: SceneData; reload: () => Promise<void> }) {
  const pod = usePod();
  const router = useRouter();
  const { scene } = data;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const solo = scene.status === 'draft' && scene.created_by === data.me;
  const voted = scene.delete_votes.includes(data.me);
  const waitingOn = data.members.filter((m) => !scene.delete_votes.includes(m.account_id) && m.account_id !== data.me && m.has_key);

  async function vote(agree: boolean) {
    setError('');
    try {
      const r = await api<{ deleted: boolean }>(`/api/scenes/${scene.id}/delete`, { body: { agree } });
      setOpen(false);
      if (r.deleted) router.replace('/');
      else await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="pt-6 text-center">
      {voted ? (
        <p className="text-sm text-ink-soft">
          You asked to delete this scene; waiting for {waitingOn.map((m) => pod.nameOf(m.account_id)).join(' and ') || 'the others'}.{' '}
          <button type="button" className="underline" onClick={() => vote(false)}>Take it back</button>
        </p>
      ) : (
        <button type="button" className="text-sm text-ink-faint underline" onClick={() => setOpen(true)}>{solo ? 'Delete this draft' : 'Delete this scene…'}</button>
      )}
      <ErrorText>{error}</ErrorText>
      <Sheet open={open} onClose={() => setOpen(false)} title={solo ? 'Delete this draft?' : 'Delete this scene?'}>
        <div className="space-y-4">
          <p>
            {solo
              ? 'It’s gone for good.'
              : `Everything in it goes, for both of you: tasks, notes, check-ins, photos, videos and voice notes. ${waitingOn.length ? `${waitingOn.map((m) => pod.nameOf(m.account_id)).join(' and ')} has to agree too; until then nothing is deleted.` : ''}`}
          </p>
          <p className="text-sm text-ink-soft">Just want one thing gone? Open it and delete it; you can always delete what you sent.</p>
          <button type="button" className="btn-stop w-full" onClick={() => vote(true)}>{solo || !waitingOn.length ? 'Delete it' : 'Ask to delete'}</button>
        </div>
      </Sheet>
    </div>
  );
}
