import { EventHero, ThemeFrame } from './ThemeFrame';
import type { ThemeId } from '@/lib/events/themes';

export type PosterSize = 'letter' | 'a4';

/**
 * A full-page poster for the venue (an easel by the door, the bar, the
 * guest book table): the event in its theme, a big QR and how to use it.
 * One page, whichever paper size is picked.
 */
export function PrintPoster({
  theme, headline, title, startsOn, location, qr, size, children, after,
}: {
  theme: ThemeId; headline: string; title: string; startsOn: Date | null; location: string; qr: string;
  size: PosterSize; children?: React.ReactNode; after?: React.ReactNode;
}) {
  const page = size === 'a4' ? '210mm 297mm' : '8.5in 11in';
  return (
    // Compact: no ferns under the poster, which would spill onto a second sheet.
    <ThemeFrame theme={theme} compact>
      {/* The paper size and no margins; the poster draws its own. */}
      <style>{`@page { size: ${page}; margin: 0; } @media print { html, body { height: auto; } }`}</style>
      <main className="mx-auto max-w-2xl px-4 py-8 print:max-w-none print:p-0">
        {/* The paper's shape on paper and wide screens; on a phone it just grows to fit. */}
        <div
          className={`card relative mx-auto flex flex-col items-center justify-between gap-6 overflow-hidden px-6 py-8 text-center sm:px-8 sm:py-10 print:rounded-none print:border-0 print:shadow-none ${size === 'a4' ? 'sm:aspect-[210/297] print:aspect-[210/297]' : 'sm:aspect-[8.5/11] print:aspect-[8.5/11]'}`}
        >
          <p className="font-display text-4xl leading-tight text-brand-dark sm:text-5xl">{headline}</p>
          <div className="w-full"><EventHero theme={theme} title={title} startsOn={startsOn} location={location} /></div>
          {/* Always dark on white (whatever the theme does to colours), so every phone camera can read it. */}
          <div className="w-[80%] rounded-2xl p-4 shadow-sm sm:w-[62%]" style={{ backgroundColor: '#fff' }} dangerouslySetInnerHTML={{ __html: qr }} />
          <ol className="grid w-full grid-cols-3 gap-3 text-sm">
            {['Open your phone’s camera', 'Point it at the code', 'Tap the link that pops up'].map((s, i) => (
              <li key={s} className="rounded-xl px-2 py-3" style={{ backgroundColor: 'rgb(255 255 255 / 0.88)', color: '#292524' }}>
                <span className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-brand font-semibold text-white">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <div className="space-y-1 text-stone-700">{children}</div>
        </div>
        {after}
      </main>
    </ThemeFrame>
  );
}
