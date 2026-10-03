// How an event's pages look. Pure; the colours live in app/globals.css
// under [data-theme=…], the ornaments in components/events/ThemeFrame.tsx.

export type ThemeId = 'classic' | 'woodland' | 'garden';

export const THEMES: { id: ThemeId; name: string; blurb: string; swatch: [string, string, string] }[] = [
  { id: 'classic', name: 'Classic', blurb: 'Clean and simple', swatch: ['#fafaf9', '#7c3aed', '#1c1917'] },
  { id: 'woodland', name: 'Enchanted forest', blurb: 'Deep green, ferns, mushrooms and fireflies', swatch: ['#10231a', '#d4b06a', '#efe6d2'] },
  { id: 'garden', name: 'Garden', blurb: 'Ivory paper with a botanical sprig', swatch: ['#f8f6f0', '#6b7f5a', '#3d3a33'] },
];

export function isTheme(v: unknown): v is ThemeId {
  return THEMES.some((t) => t.id === v);
}

/**
 * Splits a title like "Cassie & Jordan’s Wedding" around its "&" or "and",
 * so the joining word can be set in script the way invitations do.
 */
export function splitNames(title: string): { before: string; joiner: string; after: string } | null {
  const m = /^(.+?)\s+(&|and)\s+(.+)$/i.exec(title.trim());
  if (!m) return null;
  return { before: m[1]!, joiner: m[2]!.toLowerCase(), after: m[3]! };
}

/** "10 · 17 · 26", the way the invitation writes it. */
export function dottedDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCMonth() + 1)} · ${p(d.getUTCDate())} · ${p(d.getUTCFullYear() % 100)}`;
}
