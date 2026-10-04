'use client';

import { useState } from 'react';
import { api } from '@/lib/client/api';
import { proofText } from '@/lib/menu';
import { proofProgress } from '@/lib/plan';
import { taskTransition, type TaskAction } from '@/lib/rules';
import { usePod } from '../Pod';
import { ErrorText, Sheet } from '../ui';
import { DemandForm, PraiseForm } from './Lead';
import { Composer } from './Composer';
import { Checklist, KIND_ICON, kindTitle, ProofMeter, TaskChip, Timeline, useLocalTicks, useProofCounts } from './parts';
import { mmss, useCountdown, type SceneData, type TaskView } from './useScene';

/** One task: what to do, the proof so far, the conversation about it, and the buttons that move it on. */
export function TaskSheet({ task, data, reload }: { task: TaskView; data: SceneData; reload: () => Promise<void> }) {
  const pod = usePod();
  const { scene, role } = data;
  const t = task.body;
  const follows = data.members.filter((m) => m.role === 'follow').map((m) => m.account_id);
  const entries = data.entries.filter((e) => e.task_id === task.id);
  const media = data.media.filter((m) => m.task_id === task.id);
  const counts = useProofCounts(entries, media, follows);
  const [ticks, toggle] = useLocalTicks(task.id);
  const ticking = useCountdown(task.status === 'started' && !scene.paused_at ? task.due_at : null, data.skew);
  // While paused the clock stands still at what was left when it stopped.
  const left = task.status === 'started' && task.due_at && scene.paused_at
    ? Math.round((new Date(task.due_at).getTime() - new Date(scene.paused_at).getTime()) / 1000)
    : ticking;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [returning, setReturning] = useState(false);
  const [why, setWhy] = useState('');
  const [extra, setExtra] = useState<'praise' | 'demand' | null>(null);
  const live = scene.status === 'active' && !scene.paused_at;
  const can = (a: TaskAction) => live && Boolean(taskTransition(task.status, a, role));
  const textProof = t.needs.filter((n) => n.kind === 'text');
  const textWant = textProof.reduce((a, n) => a + n.count, 0);
  const missing = proofProgress(t.needs, counts).filter((p) => p.have < p.want);

  async function act(action: TaskAction) {
    if (action === 'submit' && missing.length) {
      const list = missing.map((p) => proofText({ kind: p.kind, count: p.want - p.have })).join(', ');
      if (!confirm(`Still to send: ${list}. Send for review anyway?`)) return;
    }
    setBusy(true);
    setError('');
    try {
      if (action === 'return' && why.trim()) {
        const id = crypto.randomUUID();
        await api(`/api/scenes/${scene.id}/entries`, { body: { id, kind: 'comment', taskId: task.id, bodyEnc: await pod.seal({ text: why.trim() }, `entry:${id}`) } });
      }
      await api(`/api/scenes/${scene.id}/tasks/${task.id}`, { body: { action } });
      setReturning(false);
      setWhy('');
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-ink-soft">{KIND_ICON[t.kind]} {kindTitle(t.kind)}</span>
        <TaskChip status={task.status} />
      </div>

      {left !== null && (
        <div className={`rounded-2xl px-4 py-3 text-center ${left > 0 ? 'bg-lead-light text-lead-dark' : 'bg-stop-light text-stop'}`} role="timer">
          <span className="font-display text-4xl tabular-nums">{left > 0 ? mmss(left) : 'Time’s up'}</span>
          {left > 0 && <span className="block text-sm">{scene.paused_at ? 'left (paused)' : 'left'}</span>}
        </div>
      )}

      {t.details && <p className="whitespace-pre-wrap">{t.details}</p>}
      {t.checklist.length > 0 && <Checklist items={t.checklist} ticks={ticks} toggle={toggle} disabled={role !== 'follow'} />}

      {t.needs.length > 0 && (
        <div className="space-y-1.5">
          <p className="eyebrow text-follow">Proof</p>
          <ProofMeter needs={t.needs} counts={counts} />
        </div>
      )}

      <Timeline entries={entries} media={media} reload={reload} empty={role === 'follow' ? 'Nothing sent yet.' : `Nothing from ${pod.title('follow')} yet.`} />

      {scene.status !== 'closed' && (role === 'lead' || !['approved', 'skipped'].includes(task.status)) && (
        <Composer
          sceneId={scene.id}
          taskId={task.id}
          kind={role === 'follow' && t.writing && scene.status === 'active' ? 'writing' : 'comment'}
          placeholder={role === 'lead' ? 'A note for this task…' : t.writing ? 'Write it here…' : 'Add a note…'}
          list={role === 'follow' && textWant > 1 && scene.status === 'active' ? { label: textProof.find((n) => n.label)?.label ?? 'notes', left: Math.max(0, textWant - counts.text) } : undefined}
          onAdded={reload}
        />
      )}

      <ErrorText>{error}</ErrorText>
      {scene.paused_at && scene.status === 'active' && <p className="text-sm font-medium text-stop">Paused: tasks wait until the scene is resumed.</p>}

      {returning ? (
        <div className="space-y-2 rounded-2xl bg-warn-light p-3">
          <label className="label" htmlFor="why">What to fix (optional)</label>
          <div className="flex flex-wrap gap-2">
            {REDO.map((r) => <button key={r} type="button" className="chip" aria-pressed={why === r} onClick={() => setWhy(r)}>{r}</button>)}
          </div>
          <textarea id="why" className="input" rows={2} value={why} onChange={(e) => setWhy(e.target.value)} maxLength={2000} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-quiet" onClick={() => setReturning(false)}>Cancel</button>
            <button type="button" className="btn" disabled={busy} onClick={() => act('return')}>Send it back</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          {can('skip') && <button type="button" className="btn-quiet" disabled={busy} onClick={() => act('skip')}>Skip it</button>}
          {can('reopen') && <button type="button" className="btn-quiet" disabled={busy} onClick={() => act('reopen')}>Reopen</button>}
          {can('return') && <button type="button" className="btn-quiet" disabled={busy} onClick={() => setReturning(true)}>Send back</button>}
          {role === 'lead' && scene.status === 'active' && !scene.paused_at && (
            <button type="button" className="btn-quiet" disabled={busy} onClick={() => setExtra('demand')}>Ask for more</button>
          )}
          {can('approve') && <button type="button" className="btn-quiet" disabled={busy} onClick={() => setExtra('praise')}>Approve + praise</button>}
          {can('approve') && <button type="button" className="btn" disabled={busy} onClick={() => act('approve')}>Approve ✓</button>}
          {can('start') && (task.status !== 'returned' || Boolean(t.minutes)) && (
            <button type="button" className="btn-quiet" disabled={busy} onClick={() => act('start')}>{t.minutes ? `${task.status === 'returned' ? 'Restart' : 'Start'} the ${t.minutes}-minute timer` : 'Start'}</button>
          )}
          {can('submit') && <button type="button" className="btn-follow" disabled={busy} onClick={() => act('submit')}>Send for review</button>}
        </div>
      )}
      {role === 'follow' && task.status === 'submitted' && <p className="text-right text-sm text-ink-soft">With {pod.title('lead')} for review.</p>}
      <Sheet open={extra === 'praise'} onClose={() => setExtra(null)} title="Approve with praise">
        <PraiseForm data={data} taskId={task.id} approve onDone={async () => { setExtra(null); await reload(); }} />
      </Sheet>
      <Sheet open={extra === 'demand'} onClose={() => setExtra(null)} title="Ask for more" wide>
        <DemandForm data={data} about={t.title} onDone={async () => { setExtra(null); await reload(); }} />
      </Sheet>
    </div>
  );
}

/** One-tap reasons for sending something back. */
const REDO = ['Redo it, properly', 'A better photo: closer, more light', 'Show your face', 'More effort', 'Longer video', 'Again, slower'];
