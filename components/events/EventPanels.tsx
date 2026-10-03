import { CopyButton } from '@/components/CopyButton';
import { mapLinks, type InfoItem, type ScheduleItem } from '@/lib/events/page';

// What the action sheets show. Server-rendered, handed to ActionBar.

export function DirectionsPanel({ place, address }: { place: string; address: string }) {
  const l = mapLinks(address);
  return (
    <div className="space-y-4">
      <div>
        {place && <p className="font-display text-2xl">{place}</p>}
        <p className="text-stone-600">{address}</p>
      </div>
      <iframe src={l.embed} title={`Map of ${place || address}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="aspect-[4/3] w-full rounded-2xl border border-stone-200 bg-stone-100" />
      <a href={l.google} target="_blank" rel="noopener noreferrer" className="btn w-full py-3">Directions in Google Maps</a>
      <div className="grid grid-cols-2 gap-2">
        <a href={l.apple} target="_blank" rel="noopener noreferrer" className="btn-secondary">Apple Maps</a>
        <a href={l.waze} target="_blank" rel="noopener noreferrer" className="btn-secondary">Waze</a>
      </div>
      <CopyButton text={[place, address].filter(Boolean).join(', ')} label="Copy address" />
    </div>
  );
}

export function SchedulePanel({ items, date }: { items: ScheduleItem[]; date: Date | null }) {
  return (
    <div className="space-y-4">
      {date && <p className="text-sm uppercase tracking-widest text-stone-500">{date.toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' })}</p>}
      <ol className="space-y-5 border-l border-brand/40 pl-6">
        {items.map((i, n) => (
          <li key={n} className="relative">
            <span className="absolute -left-[1.94rem] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-brand bg-stone-50" aria-hidden="true" />
            {i.time && <p className="font-display text-xl font-semibold tracking-wide text-brand">{i.time}</p>}
            <p className="text-lg font-medium">{i.title}</p>
            {i.place && <p className="text-sm text-stone-600">{i.place}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function InfoPanel({ items }: { items: InfoItem[] }) {
  return (
    <dl className="space-y-5">
      {items.map((i, n) => (
        <div key={n}>
          {i.title && <dt className="font-display text-xl font-semibold text-brand">{i.title}</dt>}
          {i.text && <dd className="whitespace-pre-wrap text-stone-700">{i.text}</dd>}
        </div>
      ))}
    </dl>
  );
}
