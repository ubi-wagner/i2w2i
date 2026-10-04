'use client';

import { useEffect } from 'react';

/** Registers the service worker (notifications only; it caches nothing). */
export function AppSetup() {
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  }, []);
  return null;
}
