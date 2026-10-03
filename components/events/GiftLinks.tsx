import { qrSvg } from '@/lib/events/qr';

export interface LinkRow {
  id: string;
  kind: string;
  label: string;
  url: string;
}

const ICON: Record<string, string> = { venmo: '💸', paypal: '💳', cashapp: '💵', registry: '🎁', link: '🔗' };

/** Gift/payment links as buttons, each with a QR for scanning from another phone. */
export async function GiftLinks({ links, note }: { links: LinkRow[]; note?: string }) {
  if (!links.length) return null;
  const qrs = await Promise.all(links.map((l) => qrSvg(l.url)));
  return (
    <section id="gifts" className="mx-auto max-w-3xl scroll-mt-6 space-y-3" aria-label="Gifts">
      <h2 className="text-center text-lg font-semibold">Send a gift</h2>
      {note && <p className="mx-auto max-w-xl whitespace-pre-wrap text-center text-stone-600">{note}</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {links.map((l, i) => (
          <li key={l.id} className="card flex items-center gap-4 p-4">
            <div className="h-24 w-24 shrink-0 rounded-lg bg-white p-1.5 [&_svg]:h-full [&_svg]:w-full" style={{ backgroundColor: '#fff' }} dangerouslySetInnerHTML={{ __html: qrs[i]! }} />
            <div className="min-w-0 space-y-2">
              <p className="font-medium">{ICON[l.kind] ?? '🔗'} {l.label}</p>
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="btn py-1 text-sm">Open</a>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
