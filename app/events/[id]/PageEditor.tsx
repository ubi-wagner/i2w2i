'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { Icon, type ActionIcon } from '@/components/events/ActionBar';
import { EventHero, ThemeFrame } from '@/components/events/ThemeFrame';
import { cleanPage, mapLinks, WEDDING_WORDING, type EventPage, type InfoItem, type ScheduleItem } from '@/lib/events/page';
import { THEMES, type ThemeId } from '@/lib/events/themes';
import { updatePage, type PageInput } from '../actions';

interface Props {
  eventId: string;
  slug: string;
  hasGiftLinks: boolean;
  initial: Omit<PageInput, 'eventId' | 'page'> & { page: EventPage };
  /** The landing page (look, invitation, welcome) or the event info (directions, schedule, notes, gifts). */
  part: 'landing' | 'info';
}

type Draft = Props['initial'];

/**
 * What guests see, with a live preview of the page in its theme: the landing
 * page on one tab, the event info on another. Each saves the whole page in
 * one go (no form reset to fight with), starting from what's saved now.
 */
export function PageEditor({ eventId, slug, hasGiftLinks, initial, part }: Props) {
  const [d, setD] = useState<Draft>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [result, setResult] = useState<{ error?: string; message?: string }>({});
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(d) !== saved;

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setD((x) => ({ ...x, [k]: v })); setResult({}); };
  const setPage = <K extends keyof EventPage>(k: K, v: EventPage[K]) => { setD((x) => ({ ...x, page: { ...x.page, [k]: v } })); setResult({}); };

  function save() {
    start(async () => {
      const r = await updatePage({ ...d, eventId });
      setResult(r);
      if (!r.error) setSaved(JSON.stringify(d));
    });
  }

  function weddingWording() {
    setD((x) => ({
      ...x,
      page: {
        ...x.page,
        kicker: x.page.kicker || WEDDING_WORDING.kicker,
        inviteLine: x.page.inviteLine || WEDDING_WORDING.inviteLine,
        timeLine: x.page.timeLine || WEDDING_WORDING.timeLine,
        footerLine: x.page.footerLine || WEDDING_WORDING.footerLine,
      },
    }));
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-8">
        {part === 'landing' && <>
        <Group title="Look" hint="Used on the album, the join page and your printed cards.">
          <div className="grid gap-2 sm:grid-cols-3">
            {THEMES.map((t) => (
              <label key={t.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-stone-200 p-3 has-[:checked]:border-brand has-[:checked]:ring-2 has-[:checked]:ring-brand/30">
                <input type="radio" name="theme" value={t.id} checked={d.theme === t.id} onChange={() => set('theme', t.id)} className="sr-only" />
                <span className="flex shrink-0 overflow-hidden rounded-full border border-stone-300" aria-hidden="true">
                  {t.swatch.map((c) => <span key={c} className="h-6 w-3" style={{ backgroundColor: c }} />)}
                </span>
                <span className="text-sm"><b className="block">{t.name}</b><span className="text-stone-500">{t.blurb}</span></span>
              </label>
            ))}
          </div>
        </Group>

        <Group
          title="Invitation"
          hint="The top of the page, set like your invitation. Leave any line empty to skip it."
          aside={<button type="button" onClick={weddingWording} className="text-sm text-brand underline underline-offset-2">Use wedding wording</button>}
        >
          <Field id="kicker" label="Opening line" value={d.page.kicker} onChange={(v) => setPage('kicker', v)} placeholder="With great joy" max={60} />
          <Field id="title" label="Names / event name" value={d.title} onChange={(v) => set('title', v)} placeholder="Cassie & Jordan" max={120} hint="Write “Name & Name” and the “&” is set in script." />
          <Field id="invite_line" label="Line under the names" value={d.page.inviteLine} onChange={(v) => setPage('inviteLine', v)} placeholder="invite you to celebrate their wedding" max={120} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="starts_on">Date</label>
              <input className="input" id="starts_on" type="date" value={d.startsOn} onChange={(e) => set('startsOn', e.target.value)} />
            </div>
            <Field id="time_line" label="Time" value={d.page.timeLine} onChange={(v) => setPage('timeLine', v)} placeholder="at four o’clock in the afternoon" max={80} />
          </div>
          <Field id="location" label="Place" value={d.location} onChange={(v) => set('location', v)} placeholder="Strauss Creek Farm" max={200} />
          <Field id="footer_line" label="Last line" value={d.page.footerLine} onChange={(v) => setPage('footerLine', v)} placeholder="Reception to follow" max={80} />
        </Group>

        <Group title="Welcome message" hint="A few words under the invitation.">
          <textarea className="input" id="description" aria-label="Welcome message" rows={3} maxLength={2000} value={d.description} onChange={(e) => set('description', e.target.value)} placeholder="We’re so glad you’re here! Add your photos and videos from the day." />
        </Group>
        </>}

        {part === 'info' && <>
        <Group title="Directions" hint="Adds a Directions button that opens Google Maps, Apple Maps or Waze. Only people who can see the album get the address.">
          <Field id="address" label="Street address" value={d.page.address} onChange={(v) => setPage('address', v)} placeholder="1234 Farm Road, Cloverdale, CA 95425" max={200} />
          {d.page.address && (
            <a href={mapLinks(d.page.address).google} target="_blank" rel="noopener noreferrer" className="text-sm text-brand underline underline-offset-2">Check it on Google Maps ↗</a>
          )}
        </Group>

        <Group title="Schedule" hint="Adds a Schedule button. Times are written however you like.">
          <ScheduleRows items={d.page.schedule} onChange={(v) => setPage('schedule', v)} />
        </Group>

        <Group title="Good to know" hint="Dress code, parking, hotel, kids, anything guests ask about. Adds a “Good to know” button.">
          <InfoRows items={d.page.info} onChange={(v) => setPage('info', v)} />
        </Group>

        <Group title="Gifts" hint={hasGiftLinks ? 'Shown above your Venmo and registry links.' : 'Add Venmo or a registry under “Gifts & payments” below; this note shows above them.'}>
          <textarea className="input" id="gift_note" aria-label="Gift note" rows={2} maxLength={500} value={d.giftNote} onChange={(e) => set('giftNote', e.target.value)} placeholder="Your being here is the best gift. If you’d like to help us start our life together, thank you!" />
        </Group>
        </>}

        <div className="sticky bottom-0 z-10 -mx-6 flex flex-wrap items-center gap-3 border-t border-stone-200 bg-white/95 px-6 py-3 backdrop-blur">
          <button type="button" className="btn" disabled={pending || !dirty} onClick={save}>{pending ? 'Saving…' : part === 'landing' ? 'Save page' : 'Save event info'}</button>
          {result.error && <p className="text-sm text-red-600" role="alert">{result.error}</p>}
          {!result.error && (result.message && !dirty ? <p className="text-sm text-green-700" role="status">{result.message}</p> : dirty && <p className="text-sm text-amber-700">Unsaved changes</p>)}
          <Link href={`/album/${slug}`} className="ml-auto text-sm text-brand underline underline-offset-2">Open album</Link>
        </div>
      </div>

      <aside className="lg:sticky lg:top-14 lg:self-start" aria-label="Preview">
        <p className="mb-2 text-xs font-medium uppercase tracking-widest text-stone-500">Preview</p>
        <Preview d={d} hasGiftLinks={hasGiftLinks} />
      </aside>
    </div>
  );
}

function Preview({ d, hasGiftLinks }: { d: Draft; hasGiftLinks: boolean }) {
  const page = useMemo(() => cleanPage(d.page), [d.page]);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(d.startsOn) ? new Date(`${d.startsOn}T00:00:00Z`) : null;
  const buttons: [ActionIcon, string][] = [
    ...(page.address ? [['pin', 'Directions'] as [ActionIcon, string]] : []),
    ...(page.schedule.length ? [['clock', 'Schedule'] as [ActionIcon, string]] : []),
    ...(page.info.length ? [['info', 'Good to know'] as [ActionIcon, string]] : []),
    ...(hasGiftLinks ? [['gift', 'Send a gift'] as [ActionIcon, string]] : []),
  ];
  return (
    <div className="mx-auto h-[620px] w-full max-w-[340px] overflow-y-auto rounded-[2.2rem] border-[10px] border-stone-800 bg-stone-800 shadow-xl">
      <div className="min-h-full overflow-hidden rounded-[1.6rem]">
        <ThemeFrame theme={d.theme as ThemeId} compact>
          <div className="min-h-[600px] space-y-5 px-4 py-6 text-[0.8rem]">
            <div style={{ zoom: 0.8 }}>
              <EventHero theme={d.theme as ThemeId} title={d.title || 'Your names'} startsOn={date} location={d.location} lines={page} />
            </div>
            {d.description && <p className={`whitespace-pre-wrap text-center text-stone-700 ${d.theme === 'classic' ? '' : 'font-display text-base italic'}`}>{d.description}</p>}
            {buttons.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5">
                {buttons.map(([icon, label]) => (
                  <span key={label} className="inline-flex items-center gap-1.5 rounded-full border border-brand/40 bg-white px-3 py-1.5 text-xs font-medium text-brand-dark">
                    <Icon name={icon} className="h-4 w-4" />{label}
                  </span>
                ))}
              </div>
            )}
            <div className="rounded-2xl border-2 border-dashed border-brand/40 bg-brand-light/50 px-3 py-4 text-center font-semibold text-brand-dark">Add photos &amp; videos</div>
            <div className="grid grid-cols-3 gap-1">
              {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="aspect-square rounded bg-stone-200" />)}
            </div>
          </div>
        </ThemeFrame>
      </div>
    </div>
  );
}

function Group({ title, hint, aside, children }: { title: string; hint?: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <legend className="text-base font-semibold">{title}</legend>
        {aside}
      </div>
      {hint && <p className="-mt-1 text-sm text-stone-500">{hint}</p>}
      {children}
    </fieldset>
  );
}

function Field({ id, label, value, onChange, placeholder, max, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; max: number; hint?: string }) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input className="input" id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={max} />
      {hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
    </div>
  );
}

function move<T>(xs: T[], i: number, by: number): T[] {
  const j = i + by;
  if (j < 0 || j >= xs.length) return xs;
  const out = [...xs];
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}

function RowTools({ i, n, onMove, onRemove, what }: { i: number; n: number; onMove: (by: number) => void; onRemove: () => void; what: string }) {
  return (
    <div className="flex shrink-0 items-center gap-1 text-stone-500">
      <button type="button" className="h-8 w-8 rounded-full hover:bg-stone-100 disabled:opacity-30" disabled={i === 0} onClick={() => onMove(-1)} aria-label={`Move ${what} ${i + 1} up`}>↑</button>
      <button type="button" className="h-8 w-8 rounded-full hover:bg-stone-100 disabled:opacity-30" disabled={i === n - 1} onClick={() => onMove(1)} aria-label={`Move ${what} ${i + 1} down`}>↓</button>
      <button type="button" className="h-8 w-8 rounded-full text-lg hover:bg-stone-100" onClick={onRemove} aria-label={`Remove ${what} ${i + 1}`}>×</button>
    </div>
  );
}

function ScheduleRows({ items, onChange }: { items: ScheduleItem[]; onChange: (v: ScheduleItem[]) => void }) {
  const edit = (i: number, k: keyof ScheduleItem, v: string) => onChange(items.map((x, n) => (n === i ? { ...x, [k]: v } : x)));
  return (
    <div className="space-y-2">
      {items.map((s, i) => (
        <div key={i} className="flex items-start gap-2 rounded-xl border border-stone-200 p-2">
          <div className="grid grow gap-2 sm:grid-cols-[6.5rem_1.5fr_1fr]">
            <input className="input" aria-label={`Time ${i + 1}`} value={s.time} onChange={(e) => edit(i, 'time', e.target.value)} placeholder="4:00 PM" maxLength={20} />
            <input className="input" aria-label={`What ${i + 1}`} value={s.title} onChange={(e) => edit(i, 'title', e.target.value)} placeholder="Ceremony" maxLength={80} />
            <input className="input" aria-label={`Where ${i + 1}`} value={s.place} onChange={(e) => edit(i, 'place', e.target.value)} placeholder="The meadow (optional)" maxLength={80} />
          </div>
          <RowTools i={i} n={items.length} what="item" onMove={(by) => onChange(move(items, i, by))} onRemove={() => onChange(items.filter((_, n) => n !== i))} />
        </div>
      ))}
      {items.length < 20 && (
        <button type="button" className="btn-secondary py-1.5 text-sm" onClick={() => onChange([...items, { time: '', title: '', place: '' }])}>+ Add to schedule</button>
      )}
    </div>
  );
}

function InfoRows({ items, onChange }: { items: InfoItem[]; onChange: (v: InfoItem[]) => void }) {
  const edit = (i: number, k: keyof InfoItem, v: string) => onChange(items.map((x, n) => (n === i ? { ...x, [k]: v } : x)));
  return (
    <div className="space-y-2">
      {items.map((s, i) => (
        <div key={i} className="flex items-start gap-2 rounded-xl border border-stone-200 p-2">
          <div className="grid grow gap-2">
            <input className="input" aria-label={`Topic ${i + 1}`} value={s.title} onChange={(e) => edit(i, 'title', e.target.value)} placeholder="Dress code" maxLength={60} />
            <textarea className="input" aria-label={`Details ${i + 1}`} rows={2} value={s.text} onChange={(e) => edit(i, 'text', e.target.value)} placeholder="Cocktail attire. The ceremony is on the grass, so flats are wise." maxLength={600} />
          </div>
          <RowTools i={i} n={items.length} what="note" onMove={(by) => onChange(move(items, i, by))} onRemove={() => onChange(items.filter((_, n) => n !== i))} />
        </div>
      ))}
      {items.length < 12 && (
        <button type="button" className="btn-secondary py-1.5 text-sm" onClick={() => onChange([...items, { title: '', text: '' }])}>+ Add a note</button>
      )}
    </div>
  );
}
