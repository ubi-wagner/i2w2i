import { qrSvg } from '@/lib/events/qr';

export interface LinkRow {
  id: string;
  kind: string;
  label: string;
  url: string;
}

const ICON: Record<string, string> = { venmo: '💸', paypal: '💳', cashapp: '💵', registry: '🎁', link: '🔗' };

/** Gift/payment links as buttons, each with a QR for scanning from another phone. */
export async function GiftLinks({ links }: { links: LinkRow[] }) {
  if (!links.length) return null;
  const qrs = await Promise.all(links.map((l) => qrSvg(l.url)));
  return (
    <section className="mx-auto max-w-3xl space-y-3" aria-label="Gifts">
      <h2 className="text-center text-lg font-semibold">Gifts</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {links.map((l, i) => (
          <li key={l.id} className="card flex items-center gap-4 p-4">
            <div className="h-20 w-20 shrink-0" dangerouslySetInnerHTML={{ __html: qrs[i]! }} />
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
