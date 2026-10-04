// The built-in ideas: everyday ones and common kink and BDSM activities.
// Served only to signed-in pod members by /api/ideas, so this module must
// never be imported by anything that runs in the browser (CI checks the
// client bundle for it: scripts/check-bundle.mjs). {lead} and {follow} are
// replaced with each pod's own titles on the phone. Keep these generic:
// a couple's own menu and ideas are imported in the app, never committed.

import { cleanMenu, type MenuItem, type MenuSection, type Proof, type SectionKind } from './menu';

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

// Common kink and BDSM activities. Solo play carries its safety notes in
// the details; the app's check-ins and pause back them up.
const SAFE_TIE = 'Quick-release cuffs, or loose enough to slip out of. Safety shears in reach. Never anything around the neck, and no gag while tied alone.';
const KINK: Record<SectionKind, Record<string, Idea[]>> = {
  presentation: {
    'Lingerie & underthings': ['Lace panties', 'A thong', 'Babydoll or chemise', 'Bodysuit or teddy', 'Garter belt and stockings', 'Fishnet stockings', 'Corset, laced tight', 'Satin slip', 'Bra with breast forms'],
    'Uniforms & outfits': [
      'French maid uniform with apron and headband', 'Pleated skirt and knee socks', 'A frilly dress with a petticoat', 'Latex or PVC', 'Leather harness', 'Nurse uniform',
      'Secretary: pencil skirt, blouse and heels', 'Nightwear chosen by {lead}', { label: 'An outfit chosen by {lead}', needs: [P(2, 'front & back')] },
    ],
    'Gear worn': [
      'Collar, locked', 'Leather wrist and ankle cuffs', { label: 'Chastity device, key with {lead}', needs: [P(1, 'locked')] }, { label: 'Butt plug', needs: [P(1)] },
      'Bell on the collar', 'Ankle chain', { label: 'Nipple clamps under your clothes', detail: '15 minutes at a time at most, then off for a while.' },
    ],
    'Feminization': [
      'Smooth all over (full shave)', 'Wig styled: bob, long or pigtails', 'False lashes', { label: 'Lipstick in ___', param: 'colour' }, { label: 'Nails painted ___', param: 'colour' },
      'High heels (4 inches or more)', { label: 'A word of {lead}’s choosing on your thigh in lipstick', needs: [P(1)] },
    ],
    'Posture & manners': ['Heels on the whole time', 'Hands clasped behind your back when standing', 'Eyes down unless spoken to', 'Every answer ends in “{lead}”', 'Curtsy when you enter a room', 'Ask permission before sitting'],
  },
  domain: {
    'Required evidence': [
      { label: 'Clean in uniform, on video', needs: [V(1)] },
      { label: 'Scrub the floor on hands and knees', needs: [P(2, 'before & after')] },
      { label: 'Clean wearing the plug', needs: [P(1)] },
      { label: 'Clean in heels the whole time', needs: [V(1, 'walk-through in heels')] },
      { label: 'Kneel and present each finished room', needs: [P(1)] },
      { label: 'A written inspection report for each room', needs: [T(1)] },
      { label: 'Clean while locked in chastity', needs: [P(1)] },
    ],
  },
  errands: {
    Discreet: [
      { label: 'Lingerie under your clothes while you’re out', needs: [P(1)] },
      { label: 'Chastity on for the errands', needs: [P(1)] },
      { label: 'The plug in while grocery shopping', needs: [P(1, 'the receipt')] },
      { label: 'Buy lingerie for yourself in {lead}’s colour', needs: [P(2, 'receipt & item')] },
      { label: 'Buy {lead} flowers and present them kneeling', needs: [P(1)] },
      { label: 'Buy a new toy for {lead} to use on you', needs: [P(1)] },
    ],
    'Bolder (legal, discreet, nobody involved who hasn’t agreed)': [
      { label: 'A collar or choker in public', needs: [P(1)] },
      { label: 'Painted nails in public', needs: [P(1)] },
      { label: 'Shop for lingerie in person', needs: [P(1, 'the receipt')] },
      { label: 'Stockings under your trousers all day', needs: [P(1)] },
    ],
  },
  tasks: {
    Writing: [
      { label: 'Lines: “I belong to {lead}”, ___ times', param: 'how many', needs: [P(1, 'the page')] },
      { label: 'Lines: “I obey the first time”, ___ times', param: 'how many', needs: [P(1, 'the page')] },
      { label: 'Write out the house rules from memory', needs: [T(1)] },
      { label: 'Your fantasies list', needs: [T(10, 'fantasies')] },
      { label: 'Confess something you haven’t told {lead}', needs: [T(1)] },
      { label: 'A thank-you letter for the last scene', needs: [T(1)] },
      { label: 'What you’ll do to earn release', needs: [T(1)] },
      { label: 'An erotic story starring {lead} and {follow}', needs: [T(1)] },
      { label: 'Grade your own performance today, and why', needs: [T(1)] },
      { label: 'Your limits and wishes list, updated', needs: [T(1)] },
    ],
    'Voice & video': [
      { label: 'Recite the rules on video, kneeling', needs: [V(1)] },
      { label: 'Beg for permission, on video', needs: [V(1)] },
      { label: 'Thank {lead} for your chastity', needs: [A(1)] },
      { label: 'A devotion message for {lead}', needs: [A(1)] },
      { label: 'Confess a fantasy out loud', needs: [A(1)] },
    ],
    'Practice & protocol': [
      { label: 'Kneel properly: back straight, knees apart, palms up', needs: [P(1)], minutes: 5 },
      { label: 'Practise the presenting position', needs: [P(1)] },
      { label: 'Walk in heels: ten lengths of the hall', needs: [V(1)] },
      { label: 'Practise curtsies', needs: [V(1)] },
      { label: 'Serve a drink on a tray, kneeling', needs: [V(1)] },
      { label: 'Memorise a new rule and recite it', needs: [A(1)] },
      { label: 'A posing set', needs: [P(5, 'poses')] },
      { label: 'Makeup practice: one full look', needs: [P(2, 'before & after')] },
    ],
  },
  play: {
    'Self-impact': [
      { label: 'Spank yourself ___ times per cheek, counting aloud', param: 'how many', needs: [V(1)], detail: 'Hand, hairbrush, wooden spoon or paddle. Buttocks and upper thighs only; never the lower back, spine, kidneys or joints. Warm up gently; stop if anything goes numb.' },
      { label: 'Paddle: ___ strokes, thanking {lead} for each', param: 'how many', needs: [V(1)], detail: 'Buttocks and upper thighs only.' },
      { label: 'Crop or slapper to the thighs: ___ strokes', param: 'how many', needs: [V(1)], detail: 'Fronts and sides of the thighs; stay off the knees.' },
      { label: 'Hairbrush spanking until pink', needs: [P(1, 'the result')] },
      { label: 'Warm-up: 50 light hand spanks', needs: [V(1)] },
      { label: 'Ruler to the palms: ___ strokes', param: 'how many', needs: [V(1)] },
      { label: 'Show {lead} the marks', needs: [P(2)] },
    ],
    'Self-bondage, done safely': [
      { label: 'Wrists cuffed in front for the play break', needs: [P(1)], minutes: 15, detail: SAFE_TIE },
      { label: 'Ankles tied together while you clean a room', needs: [P(1)], detail: SAFE_TIE },
      { label: 'Hands taped in front with bondage tape', needs: [P(1)], minutes: 10, detail: 'Bondage tape only (it sticks to itself, not to skin). Safety shears in reach.' },
      { label: 'Spreader bar between the ankles', needs: [P(1)], minutes: 15, detail: SAFE_TIE },
      { label: 'Frog tie: each ankle to its thigh', needs: [P(1)], minutes: 10, detail: 'Check circulation every few minutes: cold, tingling or numb means untie now.' },
      { label: 'A simple self-tied chest harness', needs: [P(2, 'front & back')], detail: 'Keep rope off the neck and throat.' },
      { label: 'Kneel with wrists tied to ankles in front', needs: [P(1)], minutes: 5, detail: SAFE_TIE },
      { label: 'Learn one new tie', needs: [P(2)], detail: 'Practise on a thigh or a pillow first. Keep rope off the neck.' },
    ],
    Sensation: [
      { label: 'Ice cubes on nipples and thighs', needs: [V(1)] },
      { label: 'Wax from a low-temperature candle on the thighs', needs: [V(1)], detail: 'Body-safe low-temperature wax only, from about a foot up; test on your wrist first.' },
      { label: 'Clothespins on the chest or thighs for ___ minutes', param: 'mins', needs: [P(1)], detail: '10 to 15 minutes at most.' },
      { label: 'Nipple clamps for ___ minutes', param: 'mins', needs: [P(1)], detail: '15 minutes at most; taking them off stings more than wearing them.' },
      { label: 'A pinwheel along the inner thighs', needs: [V(1)] },
      { label: 'Feather tease, no touching yourself', needs: [V(1)], minutes: 5 },
      { label: 'A cold shower for ___ minutes', param: 'mins', needs: [A(1)] },
    ],
    'Edging & denial': [
      { label: 'Edging: 15 minutes on camera without release', needs: [V(1)], minutes: 15 },
      { label: 'Edge ___ times, stopping each time', param: 'how many', needs: [V(1)] },
      { label: 'Edge, then a cold shower', needs: [A(1)] },
      { label: 'Denial check-in: still locked, still grateful', needs: [P(1)] },
      { label: 'A ruined orgasm on {lead}’s count', needs: [V(1)] },
      { label: 'Count down from 100 while edging; stop at zero', needs: [V(1)] },
      { label: 'Beg for release and accept the answer', needs: [V(1)] },
    ],
    Toys: [
      { label: 'Wear the plug for ___ minutes while doing chores', param: 'mins', needs: [P(1)] },
      { label: 'Oral practice on a toy', needs: [P(3)], minutes: 10 },
      { label: 'Ride a toy for {lead}', needs: [V(1)] },
      { label: 'A vibrator held in place, hands behind your back', needs: [V(1)], minutes: 10 },
      { label: 'Plug training: the next size up', needs: [P(1)] },
    ],
    'Positions & endurance': [
      { label: 'Kneel in position for ___ minutes', param: 'mins', needs: [P(1)] },
      { label: 'Corner time in uniform', needs: [P(1)], minutes: 15 },
      { label: 'Wall sit in heels', needs: [V(1)], minutes: 2 },
      { label: 'Present position, held', needs: [P(1)], minutes: 5 },
      { label: 'Crawl to fetch {lead}’s slippers', needs: [V(1)] },
      { label: 'Nose to a coin on the wall', needs: [V(1)], minutes: 5 },
    ],
    'Tributes & worship': [
      { label: 'Kiss {lead}’s photo and give thanks', needs: [V(1)] },
      { label: 'Worship {lead}’s shoes', needs: [V(1)] },
      { label: 'A slow strip in full uniform', needs: [V(1)], minutes: 2 },
      { label: 'A gratitude video while performing for {lead}', needs: [V(1)] },
      { label: 'Confess a fantasy on video', needs: [V(1)] },
      { label: 'An orgasm tribute dedicated to {lead}', needs: [V(1)] },
      { label: 'Cleanup tribute, on video', needs: [V(1)] },
    ],
  },
  arrival: {
    'The greeting': ['Kneel and kiss {lead}’s feet', 'Present the crop or paddle on your palms', 'Offer your collar for {lead} to put on', 'Hand {lead} the chastity key', 'Recite your rules on your knees'],
    'The state': ['Display position: kneeling, hands behind your head', 'Gagged (ball or cloth)', 'Locked, plugged and in uniform', 'Wrists cuffed in front', 'Play-break marks on show'],
    'The service': ['Kneel as a footstool', 'Hold the drink tray', 'Massage {lead}’s feet with lotion', 'Prepare to shower or dress {lead}', 'Wait for permission to speak'],
  },
  inspection: {
    Categories: [
      { label: 'Obedience', detail: 'Done the first time?' },
      { label: 'Presentation details', detail: 'Makeup, heels, posture' },
      { label: 'Proof quality', detail: 'Clear photos, whole videos' },
      { label: 'Protocol', detail: 'Titles, eyes down, manners' },
      { label: 'Enthusiasm' },
    ],
  },
  outcomes: {
    Consequences: [
      { label: 'Spanking by {lead}: ___ strokes', param: 'how many' }, { label: 'Self-spanking on video: ___ per cheek, counted', param: 'how many' },
      { label: 'Clothespins for ___ minutes', param: 'mins' }, { label: 'Corner time in uniform, ___ minutes', param: 'mins' }, { label: 'Plug for ___ hours', param: 'hours' },
      { label: 'Chastity for ___ days', param: 'days' }, { label: 'No release for ___ days', param: 'days' }, 'A ruined orgasm only', 'An extra edging session, no release',
      'The punishment outfit all evening', { label: 'Kneel on the hard floor for ___ minutes', param: 'mins', detail: '10 minutes at most; a thin towel if the knees complain.' }, 'An apology essay',
      { label: 'Hot wax or ice on sensitive areas' },
    ],
    Rewards: [
      'A full, heavily praised orgasm', 'Out of chastity for the evening', 'Sleep in {lead}’s bed', '{lead} uses a strap-on or toy on you', 'Oral worship for {lead} (no touching)',
      '{lead} uses a vibrator while you watch', 'An oiled, full-body massage for {lead}', 'A fun spanking, not a punishment', 'You choose the next play break', 'A new piece of lingerie',
    ],
  },
  service: {
    Service: ['A pedicure for {lead}, polish included', 'Lotion massage after {lead}’s shower', 'Be a footstool while {lead} watches TV', 'Serve dinner on your knees', 'Hand-wash {lead}’s lingerie', 'Bath attendant: wash {lead}’s hair and back'],
  },
  aftercare: {
    'Scene closure': ['Off with the cuffs, collar and gear; check skin and circulation', 'Arnica or lotion on any marks', 'Clean the toys together', 'Unlock (or not) and clean up', '{lead} unhooks the corset and removes the collar'],
    'Couple aftercare': ['Look at the marks together tomorrow', 'Talk through limits: anything to change?', 'Go over the safeword and the pause button again', 'Three things you each loved about tonight', 'A next-day check-in, out of role', '{lead} affirms your real relationship out loud'],
  },
};

/** The built-in ideas as menu sections, with {lead} / {follow} where the pod's titles go. */
export function builtInIdeas(): MenuSection[] {
  const raw = {
    sections: (Object.keys(BUILT_IN) as SectionKind[]).map((kind) => {
      // Everyday first, then kink; a group in both gets both lists.
      const groups: Record<string, Idea[]> = { ...BUILT_IN[kind] };
      for (const [title, items] of Object.entries(KINK[kind])) groups[title] = [...(groups[title] ?? []), ...items];
      return { kind, groups: Object.entries(groups).map(([title, items]) => ({ title, items: items.map((i) => (typeof i === 'string' ? { label: i } : i)) })) };
    }),
  };
  return cleanMenu(raw).sections;
}

/**
 * Quick demands the lead can send while a scene runs: tap, adjust, send.
 * Most come with a short countdown that starts right away.
 */
export interface DemandIdea { group: string; label: string; param?: string; needs: Proof[]; minutes?: number }
const D = (group: string, label: string, needs: Proof[], minutes?: number, param?: string): DemandIdea => ({ group, label, needs, ...(minutes ? { minutes } : {}), ...(param ? { param } : {}) });

export function demandIdeas(): DemandIdea[] {
  return [
    D('Right now', 'A photo, right now', [P(1)], 5),
    D('Right now', 'A video, right now', [V(1)], 5),
    D('Right now', 'A voice note, right now', [A(1)], 5),
    D('Right now', 'Show me where you are and what you’re wearing', [P(2)], 5),
    D('Right now', 'Check in: how are you doing?', [T(1)], 5),
    D('Redo', 'Redo it, properly', [P(1)], 30),
    D('Redo', 'A better photo: closer, more light', [P(2)], 10),
    D('Redo', 'Show me the detail you missed', [P(1)], 10),
    D('Correction', 'Self-spank ___ per cheek, counting aloud', [V(1)], 5, 'how many'),
    D('Correction', 'Kneel for ___ minutes, then report', [P(1), T(1)], 15, 'mins'),
    D('Correction', 'Corner time, ___ minutes', [P(1)], 15, 'mins'),
    D('Correction', 'Write “I obey the first time” ___ times', [P(1, 'the page')], 20, 'how many'),
    D('Correction', 'Clothespins for ___ minutes', [P(1)], 15, 'mins'),
    D('Devotion', 'Lick ___ clean, on video', [V(1)], 5, 'what'),
    D('Devotion', 'Kiss {lead}’s photo and give thanks', [V(1)], 5),
    D('Devotion', 'Tell me why you belong to {lead}', [A(1)], 10),
    D('Devotion', 'Edge once, then stop and report', [V(1), T(1)], 10),
    D('Devotion', 'Change into ___ and show me', [P(2)], 15, 'what'),
    D('Devotion', 'A pose for {lead}', [P(3)], 5),
  ];
}

