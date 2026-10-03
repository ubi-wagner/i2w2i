'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    /** Chrome's "install this app" prompt, kept for the install card. */
    __i2w2iInstall?: Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
  }
}

/** Registers the service worker and keeps Chrome's install prompt for later. */
export function AppSetup() {
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    const keep = (e: Event) => {
      e.preventDefault();
      window.__i2w2iInstall = e as Window['__i2w2iInstall'];
      window.dispatchEvent(new Event('i2w2i-installable'));
    };
    window.addEventListener('beforeinstallprompt', keep);
    return () => window.removeEventListener('beforeinstallprompt', keep);
  }, []);
  return null;
}
