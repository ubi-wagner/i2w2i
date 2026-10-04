'use client';

import type { MenuSection, Proof, RateSection } from '../menu';
import { api } from './api';

export interface DemandIdea { group: string; label: string; param?: string; needs: Proof[]; minutes?: number }
export interface BuiltIns { sections: MenuSection[]; demands: DemandIdea[]; inventory: RateSection[] }

// The built-in ideas, demands and things to rate come from the server (pod members only), once per visit.
let loading: Promise<BuiltIns> | null = null;
export function loadIdeas(): Promise<BuiltIns> {
  loading ??= api<BuiltIns>('/api/ideas').catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

/** The built-in ideas for the menu. */
export async function loadBuiltInIdeas(): Promise<MenuSection[]> {
  return (await loadIdeas()).sections;
}

/** {lead} / {follow} → this pod's titles. */
export function putTitles(s: string, titles: { lead: string; follow: string }): string {
  return s.replace(/\{lead\}/g, titles.lead).replace(/\{follow\}/g, titles.follow);
}
