'use client';

import { useEffect, useState } from 'react';
import { isIOS, isStandalone, pushSupported, resync, turnOff, turnOn } from '@/lib/pwa-client';

type State = 'checking' | 'needs-install' | 'unsupported' | 'denied' | 'off' | 'on';

/**
 * Notifications on this phone. On iPhone they only work from the home-screen
 * app, so there it explains that first.
 */
export function NotifyToggle({ purpose }: { purpose: string }) {
  const [state, setState] = useState<State>('checking');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!pushSupported()) {
      setState(isIOS() && !isStandalone() ? 'needs-install' : 'unsupported');
      return;
    }
    if (Notification.permission === 'denied') return setState('denied');
    resync().then((on) => setState(on ? 'on' : 'off')).catch(() => setState('off'));
  }, []);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setNote('');
    try {
      await fn();
    } catch (err) {
      setNote((err as Error).message || 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const on = () => run(async () => setState(await turnOn()));
  const off = () => run(async () => { await turnOff(); setState('off'); });
  const test = () => run(async () => {
    const r = await fetch('/api/push/test', { method: 'POST' });
    const j = (await r.json()) as { sent?: number; error?: string };
    setNote(j.error ?? (j.sent ? 'Sent. It should appear in a moment.' : 'Nothing was sent. Try turning notifications off and on again.'));
  });

  if (state === 'checking') return null;
  return (
    <div className="space-y-2 text-sm" aria-live="polite">
      {state === 'needs-install' && (
        <p className="text-stone-600">
          On iPhone, notifications come through the home-screen app. Tap the Share button <ShareIcon /> at the bottom of Safari, then
          <b> Add to Home Screen</b>. Open i2w2i from the new icon, sign in, and turn notifications on here.
        </p>
      )}
      {state === 'unsupported' && <p className="text-stone-600">This browser can’t show notifications. Try Chrome or Safari on your phone.</p>}
      {state === 'denied' && <p className="text-stone-600">Notifications are blocked for i2w2i. Allow them in your phone’s settings for this app, then reload.</p>}
      {state === 'off' && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn" disabled={busy} onClick={on}>Turn on notifications</button>
          <span className="text-stone-600">{purpose}</span>
        </div>
      )}
      {state === 'on' && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="font-medium text-green-700">✓ Notifications are on for this phone</span>
          <button type="button" className="text-brand underline" disabled={busy} onClick={test}>Send a test</button>
          <button type="button" className="text-stone-500 underline" disabled={busy} onClick={off}>Turn off</button>
        </div>
      )}
      {note && <p className="text-stone-600" role="status">{note}</p>}
    </div>
  );
}

export function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="inline h-4 w-4 align-text-bottom" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-label="Share">
      <path d="M12 3v12M8 7l4-4 4 4M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
    </svg>
  );
}
