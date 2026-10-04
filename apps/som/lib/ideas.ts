// Ideas: a big pool to build the menu from by tapping instead of typing.
// Two sources: the built-in ideas (lib/ideas-data.ts, served only to pod
// members by /api/ideas, never shipped in the browser bundle) and the
// pod's own ideas (menu.library, from ideas packs; encrypted). Pure.

import { cleanMenu, type Menu, type MenuGroup, type MenuItem, type MenuSection, type SectionKind } from './menu';

const key = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Built-in ideas say {lead} and {follow}; this puts in the pod's own titles
 * ("Kiss {lead}’s feet" → "Kiss Captain Kay’s feet").
 */
export function withTitles(sections: MenuSection[], titles: { lead: string; follow: string }): MenuSection[] {
  const put = (s: string) => s.replace(/\{lead\}/g, titles.lead).replace(/\{follow\}/g, titles.follow);
  return sections.map((s) => ({
    ...s,
    groups: s.groups.map((g) => ({ ...g, title: put(g.title), items: g.items.map((i) => ({ ...i, label: put(i.label), ...(i.detail ? { detail: put(i.detail) } : {}) })) })),
  }));
}

export interface IdeaGroup { title: string; items: (MenuItem & { ours: boolean })[] }

/**
 * Ideas for one section: the couple's own first, then the built-in ones,
 * grouped by title, each idea once (by its wording).
 */
export function ideasFor(menu: Menu, kind: SectionKind, builtIn: MenuSection[]): IdeaGroup[] {
  const out: IdeaGroup[] = [];
  const seen = new Set<string>();
  const add = (groups: MenuGroup[], ours: boolean) => {
    for (const g of groups) {
      let group = out.find((x) => key(x.title) === key(g.title));
      if (!group) out.push((group = { title: g.title, items: [] }));
      for (const it of g.items) {
        if (seen.has(key(it.label))) continue;
        seen.add(key(it.label));
        group.items.push({ ...it, ours });
      }
    }
  };
  add(menu.library.find((s) => s.kind === kind)?.groups ?? [], true);
  add(builtIn.find((s) => s.kind === kind)?.groups ?? [], false);
  return out.filter((g) => g.items.length);
}

/** Whether the menu already has this idea (by its wording) in that section. */
export function inMenu(menu: Menu, kind: SectionKind, label: string): boolean {
  const s = menu.sections.find((x) => x.kind === kind);
  return !!s?.groups.some((g) => g.items.some((i) => key(i.label) === key(label)));
}

/**
 * Adds an idea to the menu (into the group of the same name, made if
 * needed), or takes it out if it's already there. Returns a new menu.
 */
export function toggleIdea(menu: Menu, kind: SectionKind, groupTitle: string, idea: MenuItem, newId: () => string): Menu {
  const next = structuredClone(menu);
  const s = next.sections.find((x) => x.kind === kind)!;
  if (inMenu(menu, kind, idea.label)) {
    for (const g of s.groups) g.items = g.items.filter((i) => key(i.label) !== key(idea.label));
    return next;
  }
  let g = s.groups.find((x) => key(x.title) === key(groupTitle));
  if (!g) s.groups.push((g = { id: newId(), title: groupTitle, items: [] }));
  const { ours: _ours, ...item } = idea as MenuItem & { ours?: boolean };
  g.items.push({ ...structuredClone(item), id: newId() });
  return cleanMenu(next);
}

/** An ideas pack adds to the couple's own ideas: new groups and new wordings only. */
export function addIdeas(menu: Menu, sections: MenuSection[], newId: () => string): Menu {
  const next = structuredClone(menu);
  for (const incoming of sections) {
    const lib = next.library.find((x) => x.kind === incoming.kind)!;
    const have = new Set(lib.groups.flatMap((g) => g.items.map((i) => key(i.label))));
    for (const g of incoming.groups) {
      let target = lib.groups.find((x) => key(x.title) === key(g.title));
      for (const it of g.items) {
        if (have.has(key(it.label))) continue;
        have.add(key(it.label));
        if (!target) lib.groups.push((target = { id: newId(), title: g.title, items: [] }));
        target.items.push({ ...it, id: newId() });
      }
    }
  }
  return cleanMenu(next);
}

/** How many of the couple's own ideas there are. */
export function ownIdeaCount(menu: Menu): number {
  return menu.library.reduce((n, s) => n + s.groups.reduce((k, g) => k + g.items.length, 0), 0);
}

/** Takes one of the couple's own ideas out of their pool (built-in ones stay). */
export function removeIdea(menu: Menu, kind: SectionKind, label: string): Menu {
  const next = structuredClone(menu);
  const lib = next.library.find((x) => x.kind === kind)!;
  for (const g of lib.groups) g.items = g.items.filter((i) => key(i.label) !== key(label));
  lib.groups = lib.groups.filter((g) => g.items.length);
  return next;
}

/**
 * The menu is a pick from the pool plus the follow's own entries, so nothing
 * written is lost: an item that leaves the menu (by its id) and isn't in
 * the pool already goes into the couple's own ideas, in its group.
 */
export function keepRemoved(prev: Menu, next: Menu, newId: () => string, builtIn: MenuSection[]): Menu {
  const stillThere = new Set(next.sections.flatMap((s) => s.groups.flatMap((g) => g.items.map((i) => i.id))));
  const pool = new Set([...builtIn, ...next.library].flatMap((s) => s.groups.flatMap((g) => g.items.map((i) => `${s.kind}|${key(i.label)}`))));
  const gone: MenuSection[] = [];
  for (const s of prev.sections) {
    const groups = s.groups
      .map((g) => ({ ...g, items: g.items.filter((i) => !stillThere.has(i.id) && !pool.has(`${s.kind}|${key(i.label)}`)) }))
      .filter((g) => g.items.length);
    if (groups.length) gone.push({ ...s, groups });
  }
  return gone.length ? addIdeas(next, gone, newId) : next;
}

