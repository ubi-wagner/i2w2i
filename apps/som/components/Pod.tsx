'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { PassphraseWrapped } from '@/lib/crypto';
import { decryptJson, encryptJson } from '@/lib/crypto';
import { api, ApiError } from '@/lib/client/api';
import { loadKey } from '@/lib/client/keystore';
import { readPod, type PodSettings } from '@/lib/client/vault';
import { cleanMenu, type Menu } from '@/lib/menu';
import type { Role } from '@/lib/rules';
import { Setup } from './Setup';
import { Unlock, WaitingForKey } from './Unlock';
import { Spinner } from './ui';

export interface Account { id: string; username: string; display_name: string; is_admin: boolean }
export interface Member { account_id: string; role: Role; display_name: string; username: string; has_key: boolean; invited: boolean }
export interface PodRow { id: string; role: Role; settings_enc: string; menu_enc: string; menu_rev: number; key_backup: PassphraseWrapped | null; invite: boolean; members: Member[] }

export interface PodCtx {
  account: Account;
  pod: PodRow;
  role: Role;
  key: CryptoKey;
  menu: Menu;
  settings: PodSettings;
  members: Member[];
  /** "Captain Kay" / "Sunny": the titles from the menu. */
  title: (role: Role) => string;
  /** A member's title in this pod (or their name). */
  nameOf: (accountId: string) => string;
  refresh: () => Promise<void>;
  saveMenu: (menu: Menu) => Promise<void>;
  seal: (value: unknown, context: string) => Promise<string>;
  open: <T>(payload: string, context: string) => Promise<T>;
}

const Ctx = createContext<PodCtx | null>(null);
export function usePod(): PodCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePod outside PodGate');
  return c;
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'setup'; account: Account }
  | { kind: 'waiting'; account: Account; pod: PodRow }
  | { kind: 'unlock'; account: Account; pod: PodRow }
  | { kind: 'ready'; account: Account; pod: PodRow; key: CryptoKey; menu: Menu; settings: PodSettings };

/**
 * Everything inside needs an unlocked pod. Without one this shows, as
 * needed: setting up a pod, waiting for a partner's key link, or unlocking
 * this phone with the vault passphrase.
 */
export function PodGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    try {
      const me = await api<{ account: Account; pods: PodRow[] }>('/api/me');
      const pod = me.pods[0];
      if (!pod) return setState({ kind: 'setup', account: me.account });
      if (!pod.key_backup) return setState({ kind: 'waiting', account: me.account, pod });
      const key = await loadKey(pod.id);
      if (!key) return setState({ kind: 'unlock', account: me.account, pod });
      try {
        const { settings, menu } = await readPod(key, pod.id, pod.settings_enc, pod.menu_enc);
        setState({ kind: 'ready', account: me.account, pod, key, menu, settings });
      } catch {
        // A key from an old pod on this phone: unlock again.
        setState({ kind: 'unlock', account: me.account, pod });
      }
    } catch (err) {
      setState({ kind: 'error', message: err instanceof ApiError ? err.message : 'Couldn’t load. Check your connection and try again.' });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (state.kind === 'loading') return <Spinner />;
  if (state.kind === 'error') {
    return (
      <div className="card mx-auto mt-10 max-w-md space-y-3 text-center">
        <p>{state.message}</p>
        <button type="button" className="btn" onClick={() => { setState({ kind: 'loading' }); void load(); }}>Try again</button>
      </div>
    );
  }
  if (state.kind === 'setup') return <Setup account={state.account} onDone={load} />;
  if (state.kind === 'waiting') return <WaitingForKey />;
  if (state.kind === 'unlock') return <Unlock pod={state.pod} onDone={load} />;
  return <Ready state={state} reload={load}>{children}</Ready>;
}

function Ready({ state, reload, children }: { state: Extract<State, { kind: 'ready' }>; reload: () => Promise<void>; children: React.ReactNode }) {
  const [pod, setPod] = useState(state.pod);
  const [menu, setMenu] = useState(state.menu);
  const key = state.key;

  const refresh = useCallback(async () => {
    const me = await api<{ pods: PodRow[] }>('/api/me');
    const p = me.pods.find((x) => x.id === pod.id);
    if (!p) return reload();
    setPod(p);
    setMenu(cleanMenu(await decryptJson(key, p.menu_enc, `menu:${p.id}`)));
  }, [key, pod.id, reload]);

  const saveMenu = useCallback(async (next: Menu) => {
    const clean = cleanMenu(next);
    try {
      const r = await api<{ rev: number }>(`/api/pods/${pod.id}/menu`, { method: 'PUT', body: { menuEnc: await encryptJson(key, clean, `menu:${pod.id}`), rev: pod.menu_rev } });
      setPod((p) => ({ ...p, menu_rev: r.rev }));
      setMenu(clean);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        await refresh();
        throw new Error('Your partner changed the menu at the same time. Theirs is showing now; make your change again.');
      }
      throw err;
    }
  }, [key, pod.id, pod.menu_rev, refresh]);

  const title = useCallback((role: Role) => menu.titles[role], [menu.titles]);
  const nameOf = useCallback((id: string) => {
    const m = pod.members.find((x) => x.account_id === id);
    if (!m) return 'Someone';
    const sameRole = pod.members.filter((x) => x.role === m.role).length;
    return sameRole === 1 ? menu.titles[m.role] : m.display_name;
  }, [pod.members, menu.titles]);

  const value: PodCtx = {
    account: state.account,
    pod,
    role: pod.role,
    key,
    menu,
    settings: state.settings,
    members: pod.members,
    title,
    nameOf,
    refresh,
    saveMenu,
    seal: (v, c) => encryptJson(key, v, c),
    open: (p, c) => decryptJson(key, p, c),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
