// The album slideshow's settings and play order. Pure, so the browser and
// the tests share it.
import type { GalleryItem } from './queries';

export type Every = 3 | 5 | 10;
export type Order = 'order' | 'shuffle';
export type Transition = 'fade' | 'none';
export type Border = 'none' | 'thin' | 'wide';
export interface SlideSettings { every: Every; order: Order; transition: Transition; border: Border }

export const SLIDE_DEFAULTS: SlideSettings = { every: 5, order: 'order', transition: 'fade', border: 'none' };

export const SLIDE_OPTIONS = {
  every: [[3, '3 seconds'], [5, '5 seconds'], [10, '10 seconds']],
  order: [['order', 'In order'], ['shuffle', 'Shuffle']],
  transition: [['fade', 'Fade'], ['none', 'No fade']],
  border: [['none', 'None'], ['thin', 'Thin'], ['wide', 'Wide']],
} as const satisfies { [K in keyof SlideSettings]: readonly (readonly [SlideSettings[K], string])[] };

/** Settings as saved on this device, with anything missing or unknown back to the default. */
export function cleanSettings(v: unknown): SlideSettings {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const pick = <K extends keyof SlideSettings>(k: K): SlideSettings[K] => {
    const hit = SLIDE_OPTIONS[k].find(([value]) => value === o[k]);
    return (hit ? hit[0] : SLIDE_DEFAULTS[k]) as SlideSettings[K];
  };
  return { every: pick('every'), order: pick('order'), transition: pick('transition'), border: pick('border') };
}

export function shuffled<T>(xs: readonly T[], rand = Math.random): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** The order to play the album's photos in (album order, or dealt at random). */
export function playOrder(ids: readonly string[], order: Order, rand = Math.random): string[] {
  return order === 'shuffle' ? shuffled(ids, rand) : [...ids];
}

/**
 * The next photo after `at` (or the one before, with step -1), and the order
 * to carry on with. Shuffle deals again after the last one, never starting
 * the new round with the photo on screen.
 */
export function advance(list: readonly string[], at: string | null, order: Order, step: 1 | -1 = 1, rand = Math.random): { list: string[]; next: string | null } {
  if (!list.length) return { list: [], next: null };
  const i = at === null ? -1 : list.indexOf(at);
  const j = i + step;
  if (j >= 0 && j < list.length) return { list: [...list], next: list[j]! };
  if (step < 0) return { list: [...list], next: list[list.length - 1]! };
  if (order !== 'shuffle') return { list: [...list], next: list[0]! };
  const dealt = shuffled(list, rand);
  if (dealt.length > 1 && dealt[0] === at) [dealt[0], dealt[1]] = [dealt[1]!, dealt[0]!];
  return { list: dealt, next: dealt[0]! };
}

/**
 * The album changed while the slideshow runs (photos approved, hidden or
 * taken out). Gone ones leave; in order, it follows the album; shuffled, new
 * photos come up right after the one on screen, so they're seen soon.
 */
export function mergeOrder(list: readonly string[], ids: readonly string[], order: Order, at: string | null, rand = Math.random): string[] {
  if (order !== 'shuffle') return [...ids];
  const have = new Set(ids);
  const kept = list.filter((id) => have.has(id));
  const known = new Set(list);
  const fresh = shuffled(ids.filter((id) => !known.has(id)), rand);
  if (!fresh.length) return kept;
  const i = at === null ? -1 : kept.indexOf(at);
  return [...kept.slice(0, i + 1), ...fresh, ...kept.slice(i + 1)];
}

/**
 * What goes up on the big screen: photos everyone looking at the album may
 * see. Never a waiting or hidden one, even when a host starts it (hosts see
 * those in their gallery). Videos are left out.
 */
export function toSlides(items: readonly Pick<GalleryItem, 'id' | 'kind' | 'src' | 'pending' | 'hidden'>[]): { id: string; src: string }[] {
  return items.filter((i) => i.kind === 'photo' && !i.pending && !i.hidden).map((i) => ({ id: i.id, src: i.src }));
}
