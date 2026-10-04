'use client';

import { useState } from 'react';
import { api } from '@/lib/client/api';
import { uploadMedia } from '@/lib/client/upload';
import { proofText } from '@/lib/menu';
import { arrivalChecklist, CHECKIN_CHOICES } from '@/lib/plan';
import { usePod } from '../Pod';
import { clock, ErrorText, Section, Sheet } from '../ui';
import { Composer } from './Composer';
import { Checklist, done, KIND_ICON, LastCheckin, MOODS, ProgressBar, TaskChip, Timeline, useLocalTicks } from './parts';
import { DayList } from './Day';
import { LeadBar } from './Lead';
import { RoleplayCard } from './Roleplay';
import { mmss, useCountdown, type SceneData, type TaskView } from './useScene';


/** The scene while it runs: tasks, review, check-ins, "on my way" and notes. */
export function Running({ data, reload, onOpen }: { data: SceneData; reload: () => Promise<void>; onOpen: (taskId: string) => void }) {
  const pod = usePod();
  const { scene, role, tasks } = data;
  const review = tasks.filter((t) => t.status === 'submitted');
  const demands = tasks.filter((t) => t.body.kind === 'demand' && (t.status === 'todo' || t.status === 'started' || t.status === 'returned'));
  const lead = role === 'lead';

  return (
    <div className="space-y-6">
      {lead && <LeadBar data={data} reload={reload} />}
      {!lead && <ArrivalCard data={data} />}
      {data.plan.roleplay && <RoleplayCard rp={data.plan.roleplay} open />}
      {!lead && demands.length > 0 && (
        <section className="card space-y-1 border-follow/50 bg-follow-light" aria-label="Demands">
          <p className="eyebrow text-follow-dark">⚡ From {pod.title('lead')}</p>
          {demands.map((t) => <TaskRow key={t.id} t={t} skew={data.skew} paused={Boolean(scene.paused_at)} onOpen={onOpen} />)}
        </section>
      )}
      {lead && review.length > 0 && (
        <section className="card space-y-2 border-follow/50 bg-follow-light" aria-label="Waiting for review">
          <p className="eyebrow text-follow-dark">For review</p>
          {review.map((t) => <TaskRow key={t.id} t={t} skew={data.skew} paused={Boolean(scene.paused_at)} onOpen={onOpen} />)}
        </section>
      )}
      {!lead && (scene.checkin_minutes || scene.checkin_blocks) && <CheckinCard data={data} reload={reload} />}

      {(tasks.length > 0 || !data.plan.roleplay) && (
        <Section title={lead ? `${pod.title('follow')}’s tasks` : 'Your tasks'} eyebrow="Running">
          <div className="card space-y-3">
            <ProgressBar tasks={tasks} />
            <DayList plan={data.plan} scene={scene} tasks={tasks} base={scene.started_at} skew={data.skew}
              row={(t) => <TaskRow t={t} skew={data.skew} paused={Boolean(scene.paused_at)} onOpen={onOpen} />} />
          </div>
        </Section>
      )}

      {lead && <LeadCheckins data={data} reload={reload} />}

      <Notes data={data} reload={reload} />

      {lead && <StartInspection data={data} reload={reload} />}
    </div>
  );
}

export function TaskRow({ t, skew, paused, onOpen }: { t: TaskView; skew: number; paused: boolean; onOpen: (id: string) => void }) {
  const left = useCountdown(t.status === 'started' && !paused ? t.due_at : null, skew);
  return (
    <button type="button" id={`task-${t.id}`} className="flex w-full items-center gap-3 py-2.5 text-left" onClick={() => onOpen(t.id)}>
      <span className="text-xl" aria-hidden>{KIND_ICON[t.body.kind]}</span>
      <span className="min-w-0 flex-1">
        <span className={`block font-medium ${done(t) ? 'text-ink-soft' : ''}`}>{t.body.title}</span>
        <span className="block truncate text-xs text-ink-soft">
          {left !== null ? <b className={left > 0 ? 'text-lead' : 'text-stop'}>{left > 0 ? `${mmss(left)} left` : 'Time’s up'} · </b> : null}
          {t.body.needs.map(proofText).join(' · ') || (t.body.checklist.length ? `${t.body.checklist.length} to tick off` : '')}
        </span>
      </span>
      <TaskChip status={t.status} />
    </button>
  );
}

function CheckinCard({ data, reload }: { data: SceneData; reload: () => Promise<void> }) {
  const pod = usePod();
  const { scene } = data;
  const left = useCountdown(scene.paused_at ? null : scene.next_checkin_at, data.skew);
  const [open, setOpen] = useState(false);
  const due = left !== null && left <= 0;
  return (
    <section id="checkin" className={`card flex items-center justify-between gap-3 ${due ? 'border-stop/50 bg-stop-light' : ''}`}>
      <div>
        <p className="eyebrow text-lead">Check-in</p>
        <p className="font-medium">
          {scene.paused_at ? 'Paused' : left === null ? (scene.checkin_minutes ? `Every ${scene.checkin_minutes} minutes` : 'No more block ends today')
            : due ? `Due now: ${pod.title('lead')} is waiting` : scene.checkin_minutes ? `Next in ${mmss(left)}` : `End of this block, ${clock(scene.next_checkin_at!)}`}
        </p>
      </div>
      <button type="button" className={due ? 'btn-stop' : 'btn'} onClick={() => setOpen(true)}>Check in</button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Check in">
        <CheckinForm sceneId={scene.id} onDone={async () => { setOpen(false); await reload(); }} />
      </Sheet>
    </section>
  );
}

function CheckinForm({ sceneId, onDone }: { sceneId: string; onDone: () => Promise<void> }) {
  const pod = usePod();
  const [mood, setMood] = useState<string>('');
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  // Copy the files out before clearing the input (clearing empties its list).
  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    setFiles((f) => [...f, ...picked]);
  }

  async function send() {
    setBusy(true);
    setError('');
    try {
      const id = crypto.randomUUID();
      await api(`/api/scenes/${sceneId}/entries`, { body: { id, kind: 'checkin', bodyEnc: await pod.seal({ mood, text: text.trim() }, `entry:${id}`) } });
      for (const [i, f] of files.entries()) {
        setStatus(`Sending ${i + 1} of ${files.length}…`);
        await uploadMedia(f, { sceneId, entryId: id, key: pod.key });
      }
      await onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <span className="label">How are you?</span>
        <div className="flex flex-wrap gap-2">
          {MOODS.map((m) => <button key={m.id} type="button" className="chip" aria-pressed={mood === m.id} onClick={() => setMood(m.id)}>{m.label}</button>)}
        </div>
      </div>
      <textarea className="input" rows={3} placeholder="Where you are, what you’re doing…" aria-label="Check-in note" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="btn-quiet cursor-pointer px-3 text-sm">
          📷 Add a photo
          <input type="file" className="sr-only" accept="image/*,video/*" capture="environment" onChange={pick} />
        </label>
        <label className="btn-quiet cursor-pointer px-3 text-sm">
          🖼 Library
          <input type="file" className="sr-only" accept="image/*,video/*,audio/*" multiple onChange={pick} />
        </label>
        {files.length > 0 && <span className="text-sm text-ink-soft">{files.length} attached <button type="button" className="underline" onClick={() => setFiles([])}>clear</button></span>}
      </div>
      <ErrorText>{error}</ErrorText>
      <button type="button" className="btn w-full" disabled={busy || (!mood && !text.trim() && !files.length)} onClick={send}>{busy ? status || 'Sending…' : 'Send check-in'}</button>
    </div>
  );
}

function LeadCheckins({ data, reload }: { data: SceneData; reload: () => Promise<void> }) {
  const pod = usePod();
  const { scene } = data;
  const left = useCountdown(scene.paused_at ? null : scene.next_checkin_at, data.skew);
  const [error, setError] = useState('');
  async function change(v: string) {
    setError('');
    try {
      await api(`/api/scenes/${scene.id}/checkins`, { method: 'PUT', body: v === 'blocks' ? { minutes: null, blocks: true } : { minutes: v ? Number(v) : null } });
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <section className="card space-y-3" id="checkin">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-lead">Check-ins</p>
          <LastCheckin entries={data.entries} />
          {left !== null && <p className={`text-sm ${left <= 0 ? 'font-semibold text-stop' : 'text-ink-soft'}`}>{left > 0 ? `Next due ${clock(scene.next_checkin_at!)}, in ${mmss(left)}` : `Due now; ${pod.title('follow')} has been asked.`}</p>}
        </div>
      </div>
      <select className="input" aria-label="How often" value={scene.checkin_minutes ?? (scene.checkin_blocks ? 'blocks' : '')} onChange={(e) => change(e.target.value)}>
        {scene.checkin_at.length > 0 && <option value="blocks">At the end of each block</option>}
        {CHECKIN_CHOICES.map((m) => <option key={m} value={m}>Every {m} minutes</option>)}
        <option value="">No check-ins</option>
      </select>
      <ErrorText>{error}</ErrorText>
    </section>
  );
}

export function ArrivalCard({ data }: { data: SceneData }) {
  const pod = usePod();
  const { scene } = data;
  const left = useCountdown(scene.arrival_at, data.skew);
  const items = arrivalChecklist(pod.menu, data.plan);
  const [ticks, toggle] = useLocalTicks(`arrival:${scene.id}:${scene.arrival_at}`);
  if (left === null || left < -30 * 60) return null;
  return (
    <section id="arrival" className="card space-y-3 border-lead/50 bg-lead-light">
      <div className="text-center">
        <p className="eyebrow text-lead">{pod.title('lead')}</p>
        <p className="font-display text-4xl tabular-nums text-lead-dark" role="timer">{left > 0 ? mmss(left) : 'Arriving now'}</p>
        {left > 0 && <p className="text-sm text-lead-dark">until arrival</p>}
      </div>
      {items.length > 0 && <Checklist items={items} ticks={ticks} toggle={toggle} />}
    </section>
  );
}

export function Notes({ data, reload, title = 'Notes' }: { data: SceneData; reload: () => Promise<void>; title?: string }) {
  const entries = data.entries.filter((e) => !e.task_id && (e.kind === 'comment' || e.kind === 'checkin' || e.kind === 'praise'));
  const media = data.media.filter((m) => !m.task_id);
  return (
    <Section title={title} eyebrow="Between you">
      <div id="notes" className="card space-y-4">
        <Timeline entries={entries} media={media} reload={reload} empty="Nothing yet." />
        {data.scene.status !== 'closed' && <Composer sceneId={data.scene.id} onAdded={reload} />}
      </div>
    </Section>
  );
}

/** The end of the running part: the inspection, where the follow's work (a roleplay too) is scored and rewarded. */
function StartInspection({ data, reload }: { data: SceneData; reload: () => Promise<void> }) {
  const [error, setError] = useState('');
  const open = data.tasks.filter((t) => !['approved', 'skipped'].includes(t.status)).length;
  async function go() {
    if (!confirm(open ? `${open} ${open === 1 ? 'task isn’t' : 'tasks aren’t'} finished. Start the inspection anyway?` : 'Start the inspection?')) return;
    try {
      await api(`/api/scenes/${data.scene.id}/action`, { body: { action: 'inspect' } });
      await reload();
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <div className="space-y-2">
      <button type="button" className="btn w-full" onClick={go}>Start the inspection</button>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
