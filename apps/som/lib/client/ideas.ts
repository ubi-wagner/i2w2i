'use client';

import type { MenuSection } from '../menu';
import { api } from './api';

// The built-in ideas come from the server (pod members only), once per visit.
let loading: Promise<MenuSection[]> | null = null;
export function loadBuiltInIdeas(): Promise<MenuSection[]> {
  loading ??= api<{ sections: MenuSection[] }>('/api/ideas').then((r) => r.sections).catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}
