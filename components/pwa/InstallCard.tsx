'use client';

import { useEffect, useState } from 'react';
import { isIOS, isStandalone } from '@/lib/pwa-client';
import { ShareIcon } from './NotifyToggle';

const DISMISSED = 'i2w2i-install-dismissed';

/** "Put i2w2i on your home screen", for people who aren't using the app icon yet. */
export function InstallCard() {
  const [mode, setMode] = useState<'hidden' | 'ios' | 'prompt'>('hidden');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISSED) === '1'; } catch { /* private mode */ }
    if (dismissed || isStandalone()) return;
    if (isIOS()) return setMode('ios');
    const ready = () => setMode(window.__i2w2iInstall ? 'prompt' : 'hidden');
    ready();
    window.addEventListener('i2w2i-installable', ready);
    return () => window.removeEventListener('i2w2i-installable', ready);
  }, []);

  if (mode === 'hidden') return null;
  const dismiss = () => {
    try { localStorage.setItem(DISMISSED, '1'); } catch { /* private mode */ }
    setMode('hidden');
  };
  const install = async () => {
    const p = window.__i2w2iInstall;
    if (!p) return;
    await p.prompt();
    const { outcome } = await p.userChoice;
    if (outcome === 'accepted') setMode('hidden');
  };

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-brand/30 bg-brand-light/60 p-4 text-sm text-stone-800">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-xl" />
      <div className="min-w-0 grow space-y-1">
        <p className="font-semibold">Put i2w2i on your home screen</p>
        {mode === 'prompt' ? (
          <p className="text-stone-600">One tap, and it opens like an app, straight to your albums.</p>
        ) : open ? (
          <ol className="list-decimal space-y-0.5 pl-5 text-stone-700">
            <li>Tap the Share button <ShareIcon /> at the bottom of Safari.</li>
            <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
            <li>From now on, open i2w2i from its icon.</li>
          </ol>
        ) : (
          <p className="text-stone-600">It opens like an app, straight to your albums.</p>
        )}
        <div className="flex gap-4 pt-1">
          {mode === 'prompt' ? (
            <button type="button" className="font-medium text-brand underline" onClick={install}>Add to home screen</button>
          ) : (
            !open && <button type="button" className="font-medium text-brand underline" onClick={() => setOpen(true)}>Show me how</button>
          )}
          <button type="button" className="text-stone-500 underline" onClick={dismiss}>Not now</button>
        </div>
      </div>
    </div>
  );
}
