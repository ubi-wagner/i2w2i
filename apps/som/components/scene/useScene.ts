'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/client/api';
import type { MediaRow } from '@/lib/client/media';
import { cleanProofs } from '@/lib/menu';
import { cleanPlan, upgradePlan, type Plan, type TaskDraft } from '@/lib/plan';
import type { Role, SceneStatus, TaskStatus } from '@/lib/rules';
import { usePod, type Member } from '../Pod';

export interface SceneRow {
  id: string;
  pod_id: string;
  created_by: string;
  status: SceneStatus;
  plan_rev: number;
  plan_enc: string;
  checkin_minutes: number | null;
  next_checkin_at: string | null;
  /** Check-ins at the end of each block (minutes from the start), and whether they're on. */
  checkin_at: number[];
  checkin_blocks: boolean;
  arrival_at: string | null;
  paused_at: string | null;
  paused_by: string | null;
  started_at: string | null;
  closed_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  change_request: { by: string; startsAt: string | null; endsAt: string | null } | null;
  reply_enc: string | null;
  switched: boolean;
  offered_by: string | null;
  close_votes: string[];
  delete_votes: string[];
  created_at: string;
}

export interface TaskView {
  id: string;
  ord: number;
  status: TaskStatus;
  minutes: number | null;
  due_at: string | null;
  started_at: string | null;
  submitted_at: string | null;
  decided_at: string | null;
  body: TaskDraft;
}

export type EntryKind = 'comment' | 'writing' | 'checkin' | 'scores' | 'outcomes' | 'aftercare' | 'reflection' | 'praise';

export interface EntryView {
  id: string;
  task_id: string | null;
  author_id: string;
  kind: EntryKind;
  private: boolean;
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
}

export interface SceneData {
  scene: SceneRow;
  role: Role;
  me: string;
  members: Member[];
  tasks: TaskView[];
  entries: EntryView[];
  media: MediaRow[];
  plan: Plan;
  /** The plan couldn't be opened on this phone: shown empty, and never saved over. */
  planBroken?: boolean;
  /** Server clock minus this phone's, for countdowns. */
  skew: number;
}

interface Raw {
  scene: SceneRow;
  role: Role;
  me: string;
  members: Member[];
  tasks: (Omit<TaskView, 'body'> & { body_enc: string })[];
  entries: (Omit<EntryView, 'body'> & { body_enc: string })[];
  media: MediaRow[];
  now: string;
}

function taskBody(t: TaskDraft): TaskDraft {
  return { ...t, checklist: Array.isArray(t.checklist) ? t.checklist : [], needs: cleanProofs(t.needs) };
}

/** A task this phone couldn't decrypt: shown as such, never breaking the page. */
const UNREADABLE: TaskDraft = { kind: 'tasks', title: 'A task this phone couldn’t open', details: 'It may have been made with a different key. Try your other phone, or unlock this one again.', checklist: [], needs: [] };

/** Loads a scene, decrypts it on the phone, and keeps it fresh while it's on screen. */
export function useScene(id: string) {
  const pod = usePod();
  const [data, setData] = useState<SceneData | null>(null);
  const [error, setError] = useState('');
  const cache = useRef(new Map<string, unknown>());
  const menuRef = useRef(pod.menu);
  menuRef.current = pod.menu;

  const open = useCallback(async <T,>(payload: string, context: string): Promise<T> => {
    const k = `${context}|${payload.slice(-24)}`;
    if (!cache.current.has(k)) cache.current.set(k, await pod.open<T>(payload, context));
    return cache.current.get(k) as T;
  }, [pod]);

  const load = useCallback(async () => {
    try {
      const r = await api<Raw>(`/api/scenes/${id}`);
      // Each piece opens on its own: one that can't be read never hides the rest.
      const [plan, tasks, entries] = await Promise.all([
        // A plan from before blocks comes over whole (rooms, story, own task: see upgradePlan).
        open(r.scene.plan_enc, `plan:${id}`).then((raw) => upgradePlan(menuRef.current, raw)).catch(() => null),
        Promise.all(r.tasks.map(async ({ body_enc, ...t }) => ({ ...t, body: await open<TaskDraft>(body_enc, `task:${t.id}`).then(taskBody).catch(() => UNREADABLE) }))),
        Promise.all(r.entries.map(async ({ body_enc, ...e }) => ({ ...e, body: await open(body_enc, `entry:${e.id}`).catch(() => null) }))),
      ]);
      setData({ scene: r.scene, role: r.role, me: r.me, members: r.members, tasks, entries, media: r.media, plan: plan ?? cleanPlan({}), ...(plan ? {} : { planBroken: true }), skew: new Date(r.now).getTime() - Date.now() });
      setError('');
    } catch (err) {
      // Deleted (by both of you) while open: say so rather than "offline".
      setError(err instanceof ApiError && err.status === 404 ? 'Not found' : err instanceof ApiError && err.status === 0 ? 'offline' : (err as Error).message);
    }
  }, [id, open]);

  useEffect(() => {
    void load();
    const tick = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = setInterval(tick, 4000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load]);

  return { data, error, reload: load };
}

/** Seconds left until `at`, ticking every second (server-clock corrected). */
export function useCountdown(at: string | null, skew = 0): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!at) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [at]);
  if (!at) return null;
  return Math.round((new Date(at).getTime() - (now + skew)) / 1000);
}

export function mmss(s: number): string {
  const a = Math.abs(s);
  const h = Math.floor(a / 3600);
  const m = Math.floor((a % 3600) / 60);
  const sec = a % 60;
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(sec).padStart(2, '0')}`;
}
