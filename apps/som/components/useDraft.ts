'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Something being typed, kept for this tab (sessionStorage) so a screen that
 * changes underneath it (the partner closes the scene, a status moves on)
 * doesn't lose it. `clear` once it's sent. Works (unsaved) where storage
 * isn't available.
 */
export function useDraft<T>(key: string, initial: T): [T, (v: T | ((x: T) => T)) => void, () => void] {
  const storeKey = `draft:${key}`;
  const empty = useRef(JSON.stringify(initial));
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(storeKey);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      const json = JSON.stringify(value);
      if (json === empty.current) sessionStorage.removeItem(storeKey);
      else sessionStorage.setItem(storeKey, json);
    } catch { /* private mode or full: the draft just isn't kept */ }
  }, [storeKey, value]);
  const clear = useCallback(() => {
    try { sessionStorage.removeItem(storeKey); } catch { /* nothing kept */ }
    setValue(JSON.parse(empty.current) as T);
  }, [storeKey]);
  return [value, setValue, clear];
}
