// Ideas: a big pool to build the menu from by tapping instead of typing.
// The built-in ideas below are deliberately everyday (chores, service,
// presentation, writing, rituals, aftercare); a couple's own, spicier ideas
// come in as an "ideas pack" file and live encrypted in their menu
// (menu.library), never in this repository. Pure.

import { cleanMenu, type Menu, type MenuGroup, type MenuItem, type MenuSection, type Proof, type SectionKind } from './menu';

type Idea = string | (Omit<MenuItem, 'id' | 'needs'> & { needs?: Proof[] });
const P = (count = 1, label?: string): Proof => ({ kind: 'photo', count, ...(label ? { label } : {}) });
const V = (count = 1, label?: string): Proof => ({ kind: 'video', count, ...(label ? { label } : {}) });
const A = (count = 1, label?: string): Proof => ({ kind: 'audio', count, ...(label ? { label } : {}) });
const T = (count = 1, label?: string): Proof => ({ kind: 'text', count, ...(label ? { label } : {}) });

const BUILT_IN: Record<SectionKind, Record<string, Idea[]>> = {
  presentation: {
    'Getting ready': ['Shower', 'Hair done', 'Outfit of your choosing'],
    'Hygiene & grooming': ['Shower, exfoliate, moisturise', 'Fresh shave', 'Nails trimmed and clean', 'Hair washed and styled', 'Teeth brushed, fresh breath', 'Wear the scent I like'],
    Clothing: ['An outfit I picked', 'Your best date-night outfit', 'A matching underwear set', 'Something in my favourite colour', 'Comfy loungewear', 'Dressed to go out', 'An apron for chores', 'Smart: shirt and tie, or a dress'],
    Accessories: ['The jewellery I gave you', 'A ribbon or clip in your hair', 'Watch on, phone away'],
    Makeup: ['Skincare only', 'A light, natural look', 'Lipstick in my favourite shade', 'Full glam'],
    Shoes: ['Barefoot', 'Slippers', 'Heels', 'Polished shoes'],
  },
  domain: {
    'Required evidence': [
      { label: 'Before & after photos of each room', needs: [P(2, 'before & after')] },
      { label: 'A photo of each finished room', needs: [P(1)] },
      { label: 'A short video walk-through when done', needs: [V(1, 'walk-through')] },
      { label: 'A message when each room is done', needs: [T(1)] },
      { label: 'A voice note saying what you did', needs: [A(1)] },
      { label: 'Close-ups of the detail work', needs: [P(3, 'close-ups')] },
      { label: 'A time-lapse while you clean', needs: [V(1, 'time-lapse')] },
    ],
    Standards: ['Dust every surface, top to bottom', 'Mirrors and glass streak-free', 'Floors vacuumed and mopped', 'Bins emptied and relined', 'Bed made with crisp corners', 'Clutter away, surfaces clear', 'Light switches and handles wiped', 'Fresh towels out'],
  },
  errands: {
    'Out and about': [
      { label: 'Grocery run', detail: 'From my list.', needs: [P(1, 'the receipt')] },
      { label: 'Pick up flowers', needs: [P(1)] },
      { label: 'Collect the dry cleaning', needs: [P(1)] },
      { label: 'Fill the car with fuel', needs: [P(1, 'the pump')] },
      { label: 'Wash the car, inside and out', needs: [P(2, 'before & after')] },
      { label: 'Post office run', needs: [P(1, 'the receipt')] },
      { label: 'Buy my favourite treat', needs: [P(1)] },
      { label: 'Pharmacy pick-up', needs: [P(1)] },
      { label: 'Pick up dinner', needs: [P(1)] },
      { label: 'A coffee exactly how I like it', needs: [P(1)] },
      { label: 'Buy a card and write in it', needs: [P(2, 'front & inside')] },
    ],
  },
  tasks: {
    Writing: [
      { label: 'Write a love note', needs: [T(1)] },
      { label: 'List 20 things you adore about me', needs: [T(20, 'things I adore')] },
      { label: 'Daily affirmations', needs: [T(10, 'affirmations'), A(1, 'read aloud')] },
      { label: 'Write a poem for me', needs: [T(1)] },
      { label: 'Reflect on today', needs: [T(1)] },
      { label: 'A gratitude list', needs: [T(5, 'gratitudes')] },
      { label: 'Describe our perfect day', needs: [T(1)] },
      { label: 'Write ___ lines by hand', param: 'how many', needs: [P(1, 'the page')] },
      { label: 'An apology or improvement note', needs: [T(1)] },
      { label: 'Journal: how serving makes you feel', needs: [T(1)] },
    ],
    'Voice & video': [
      { label: 'Read your writing aloud', needs: [A(1)] },
      { label: 'A good-morning message for me', needs: [A(1)] },
      { label: 'Sing me a song', needs: [V(1)] },
      { label: 'Tell me about your day', needs: [A(1)] },
      { label: 'A thank-you video', needs: [V(1)] },
    ],
    'Performance & pictures': [
      { label: 'Prepare a welcome-home comfort station', needs: [P(1)] },
      { label: 'Practise greeting me at the door', needs: [V(1)] },
      { label: 'Practise tray service and drink presentation', needs: [V(1)] },
      { label: 'Fold the laundry for inspection', needs: [P(1)] },
      { label: 'Iron my clothes for the week', needs: [P(1)] },
      { label: 'Set the table beautifully', needs: [P(1)] },
      { label: 'Cook a meal from my list', needs: [P(2, 'prep & plated')] },
      { label: 'Draw me a bath and set the mood', needs: [P(1)] },
      { label: 'Fresh sheets on the bed', needs: [P(1)] },
      { label: 'Plan our next date', needs: [T(1)] },
      { label: 'Outfit photos for your journal', needs: [P(3, 'outfits')] },
    ],
  },
  play: {
    'Moving & posing': [
      { label: 'A dance, on video', needs: [V(1)], minutes: 2 },
      { label: 'Strike three poses for me', needs: [P(3)] },
      { label: 'A selfie in your outfit', needs: [P(2)] },
      { label: 'Hold a plank for ___ seconds', param: 'seconds', needs: [V(1)] },
      { label: '20 squats, on video', needs: [V(1)] },
      { label: 'Stretch for ten minutes', needs: [P(1)], minutes: 10 },
    ],
    'Stillness & focus': [
      { label: 'Kneel quietly and reflect', needs: [T(1, 'what you thought about')], minutes: 10 },
      { label: 'Five minutes of breathing', needs: [A(1, 'how it went')], minutes: 5 },
      { label: 'Write me a flirty message', needs: [T(1)] },
      { label: 'A voice note telling me about your day', needs: [A(1)] },
      { label: 'A voice note telling me what you’re looking forward to', needs: [A(1)] },
    ],
  },
  arrival: {
    'The greeting': ['Meet at the door with a drink', 'Kneel at the door', 'Wait in the corner facing the wall', 'Head down, silent until spoken to', 'A hug and a kiss at the door', 'Hand me my slippers'],
    'The state': ['Blindfolded', 'Hands behind your back', 'Holding your report', 'Kneeling on a cushion', 'Dressed as I asked'],
    'The service': ['Take my coat and shoes', 'Run my bath', 'Pour my drink', 'Recite your poem', 'Present your finished tasks', 'Rub my feet', 'Dinner on the table'],
  },
  inspection: {
    Categories: [
      { label: 'Presentation', detail: 'Looks & hygiene' },
      { label: 'Task completion', detail: 'Evidence provided?' },
      { label: 'Quality of work', detail: 'Cleaning & writing' },
      { label: 'Attitude', detail: 'Respect & gratitude' },
      { label: 'Timeliness', detail: 'Countdowns kept' },
      { label: 'Communication', detail: 'Check-ins on time' },
      { label: 'Effort & creativity' },
    ],
  },
  outcomes: {
    Consequences: [
      'An extra chore', { label: 'Early night', param: 'mins early' }, { label: 'Write ___ lines', param: 'lines' }, { label: 'Corner time, ___ mins', param: 'mins' },
      { label: 'No phone for ___ hours', param: 'hours' }, 'Redo the task', 'A cold shower', { label: 'Kneel for ___ mins', param: 'mins' }, 'No dessert', 'Wear something silly tomorrow',
    ],
    Rewards: [
      'Movie pick', { label: 'Massage', param: 'mins' }, 'Breakfast in bed', 'Sleep in tomorrow', 'Pick dinner', 'A bubble bath together', 'A night off chores',
      'Cuddles on demand', 'Choose our next date', 'A small gift you’ve wanted',
    ],
  },
  service: {
    Service: [
      'Cook dinner', 'Cook dinner in uniform', { label: 'Foot rub', param: 'mins' }, { label: 'A foot & calf massage, ___ mins', param: 'mins' }, 'Run a bubble bath and wash my back', 'Curl up at my feet while we watch TV', 'Brush my hair',
      'Paint my nails', 'Read to me', 'Make my lunch for tomorrow', 'Tidy up after dinner', 'Lay out my clothes for tomorrow',
    ],
  },
  aftercare: {
    'Scene closure': ['Declare the scene closed', 'Take off the gear together', 'Remove makeup with soft wipes', 'Change into comfy clothes', 'Shower together', 'Put everything away together'],
    'Couple aftercare': ['Cuddle on the couch', 'Cuddle under a warm blanket', 'Words of affirmation about us', 'Water and a snack', 'Eat something together', 'Talk about the day as equals', 'Each share one thing you loved', 'Plan something fun together', 'An early night together', 'Check in with each other tomorrow morning'],
  },
};

let builtInCache: MenuSection[] | null = null;
/** The built-in ideas as menu sections. */
export function builtInIdeas(): MenuSection[] {
  builtInCache ??= makeBuiltIn();
  return builtInCache;
}

function makeBuiltIn(): MenuSection[] {
  const raw = {
    sections: Object.entries(BUILT_IN).map(([kind, groups]) => ({
      kind,
      groups: Object.entries(groups).map(([title, items]) => ({ title, items: items.map((i) => (typeof i === 'string' ? { label: i } : i)) })),
    })),
  };
  return cleanMenu(raw).sections;
}

const key = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

export interface IdeaGroup { title: string; items: (MenuItem & { ours: boolean })[] }

/**
 * Ideas for one section: the couple's own first, then the built-in ones,
 * grouped by title, each idea once (by its wording).
 */
export function ideasFor(menu: Menu, kind: SectionKind, builtIn: MenuSection[] = builtInIdeas()): IdeaGroup[] {
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
export function keepRemoved(prev: Menu, next: Menu, newId: () => string): Menu {
  const stillThere = new Set(next.sections.flatMap((s) => s.groups.flatMap((g) => g.items.map((i) => i.id))));
  const pool = new Set([...builtInIdeas(), ...next.library].flatMap((s) => s.groups.flatMap((g) => g.items.map((i) => `${s.kind}|${key(i.label)}`))));
  const gone: MenuSection[] = [];
  for (const s of prev.sections) {
    const groups = s.groups
      .map((g) => ({ ...g, items: g.items.filter((i) => !stillThere.has(i.id) && !pool.has(`${s.kind}|${key(i.label)}`)) }))
      .filter((g) => g.items.length);
    if (groups.length) gone.push({ ...s, groups });
  }
  return gone.length ? addIdeas(next, gone, newId) : next;
}

