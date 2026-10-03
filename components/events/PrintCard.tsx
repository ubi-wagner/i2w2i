import { EventHero, ThemeFrame } from './ThemeFrame';
import type { ThemeId } from '@/lib/events/themes';

/** A printable card with a QR, dressed in the event's theme. */
export function PrintCard({
  theme, kicker, title, startsOn, location, qr, children, after,
}: {
  theme: ThemeId; kicker: string; title: string; startsOn: Date | null; location: string; qr: string;
  children: React.ReactNode; after?: React.ReactNode;
}) {
  return (
    <ThemeFrame theme={theme}>
      <main className="mx-auto max-w-md px-6 py-10 text-center print:py-0">
        <div className="card relative space-y-5 overflow-hidden p-8 print:border-stone-400">
          <p className="text-sm uppercase tracking-widest text-brand">{kicker}</p>
          <EventHero theme={theme} title={title} startsOn={startsOn} location={location} />
          {/* Always dark on white, so every phone camera can read it. */}
          <div className="mx-auto w-60 rounded-xl p-3" style={{ backgroundColor: '#fff' }} dangerouslySetInnerHTML={{ __html: qr }} />
          {children}
        </div>
        {after}
      </main>
    </ThemeFrame>
  );
}
