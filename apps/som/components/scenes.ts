'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client/api';
import { cleanPlan, type Plan } from '@/lib/plan';
import type { SceneStatus } from '@/lib/rules';
import { usePod } from './Pod';

export interface SceneListRow {
  id: string; status: SceneStatus; plan_enc: string; created_by: string; created_at: string; started_at: string | null; closed_at: string | null;
  paused_at: string | null; delete_votes: string[]; tasks: number; done: number; waiting: number;
  starts_at: string | null; ends_at: string | null; switched: boolean; roleplay: boolean; close_votes: string[]; offered_by: string | null; change_requested: boolean;
}
export type ListedScene = SceneListRow & { plan: Plan | null };

/** The pod's scenes, plans decrypted on this phone. */
export function useScenes(): { scenes: ListedScene[] | null; reload: () => Promise<void>; error: string } {
  const pod = usePod();
  const podRef = useRef(pod);
  podRef.current = pod;
  const podId = pod.pod.id;
  const [scenes, setScenes] = useState<ListedScene[] | null>(null);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    try {
      const r = await api<{ scenes: SceneListRow[] }>(`/api/pods/${podId}/scenes`);
      setScenes(await Promise.all(r.scenes.map(async (s) => ({ ...s, plan: await podRef.current.open(s.plan_enc, `plan:${s.id}`).then(cleanPlan).catch(() => null) }))));
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  }, [podId]);
  useEffect(() => { void reload(); }, [reload]);
  return { scenes, reload, error };
}

/** The plans of the last few scenes that ran (not this one), newest first. */
export function recentPlans(scenes: ListedScene[], exceptId: string, n = 5): Plan[] {
  return scenes
    .filter((s) => s.id !== exceptId && s.started_at && s.plan)
    .sort((a, b) => b.started_at!.localeCompare(a.started_at!))
    .slice(0, n)
    .map((s) => s.plan!);
}
