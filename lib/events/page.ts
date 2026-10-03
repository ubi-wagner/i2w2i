// What hosts write on their event's page: invitation wording, directions,
// a schedule and "good to know" notes. Stored as events.events.page (jsonb);
// this is the only shape the app writes or trusts. Pure.

export interface ScheduleItem { time: string; title: string; place: string }
export interface InfoItem { title: string; text: string }

export interface EventPage {
  /** Small line above the names: "With great joy". */
  kicker: string;
  /** Under the names: "invite you to celebrate their wedding". */
  inviteLine: string;
  /** Under the date: "at six o'clock in the evening". */
  timeLine: string;
  /** Last line: "Reception to follow". */
  footerLine: string;
  /** Street address for Directions. Shown only to people who can see the album. */
  address: string;
  schedule: ScheduleItem[];
  info: InfoItem[];
}

export const EMPTY_PAGE: EventPage = { kicker: '', inviteLine: '', timeLine: '', footerLine: '', address: '', schedule: [], info: [] };

/** Parts of the page anyone holding the album link may see (the invitation text, not where or when exactly). */
export const PUBLIC_PAGE_KEYS = ['kicker', 'inviteLine', 'timeLine', 'footerLine'] as const;

const line = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim().slice(0, max) : '');

/** Accepts anything (form JSON, a stored row) and returns a clean page. */
export function cleanPage(raw: unknown): EventPage {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v : []).filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object');
  return {
    kicker: line(r.kicker, 60),
    inviteLine: line(r.inviteLine, 120),
    timeLine: line(r.timeLine, 80),
    footerLine: line(r.footerLine, 80),
    address: line(r.address, 200),
    schedule: list(r.schedule)
      .map((s) => ({ time: line(s.time, 20), title: line(s.title, 80), place: line(s.place, 80) }))
      .filter((s) => s.title)
      .slice(0, 20),
    info: list(r.info)
      .map((s) => ({ title: line(s.title, 60), text: text(s.text, 600) }))
      .filter((s) => s.title || s.text)
      .slice(0, 12),
  };
}

/** Directions in the apps people actually use. */
export function mapLinks(address: string) {
  const q = encodeURIComponent(address);
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
    apple: `https://maps.apple.com/?daddr=${q}`,
    waze: `https://waze.com/ul?q=${q}&navigate=yes`,
    embed: `https://maps.google.com/maps?q=${q}&z=15&output=embed`,
  };
}

/** Wording from the invitation, offered as a one-tap start for weddings. */
export const WEDDING_WORDING: Pick<EventPage, 'kicker' | 'inviteLine' | 'timeLine' | 'footerLine'> = {
  kicker: 'With great joy',
  inviteLine: 'invite you to celebrate their wedding',
  timeLine: 'at four o’clock in the afternoon',
  footerLine: 'Reception to follow',
};
