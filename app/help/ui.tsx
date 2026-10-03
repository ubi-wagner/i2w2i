// Building blocks for the help pages: plain, large type, and real screens
// (of a made-up demo event) beside each step. Everything prints cleanly.

export function Intro({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <header className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">{eyebrow}</p>
      <h1 className="text-3xl font-semibold leading-tight text-balance sm:text-4xl">{title}</h1>
      {children && <div className="max-w-2xl text-lg text-stone-600">{children}</div>}
    </header>
  );
}

export function Section({ id, eyebrow, title, lead, children }: { id: string; eyebrow?: string; title: string; lead?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 space-y-4 border-t border-stone-200 pt-8">
      <div className="space-y-2">
        {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">{eyebrow}</p>}
        <h2 className="text-2xl font-semibold text-balance sm:text-3xl">{title}</h2>
        {lead && <p className="max-w-2xl text-stone-600">{lead}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * One step. A single phone screen sits beside the text; several screens, or
 * a laptop screen (`wide`), go underneath it.
 */
export function Step({ n, title, shots = [], wide = false, children }: { n?: number; title: string; shots?: ShotProps[]; wide?: boolean; children: React.ReactNode }) {
  const beside = shots.length === 1 && !wide;
  return (
    <div className={`grid gap-5 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm break-inside-avoid sm:p-6 ${beside ? 'sm:grid-cols-[minmax(0,1fr)_230px]' : ''}`}>
      <div className="min-w-0 space-y-3">
        <h3 className="flex items-start gap-3 text-xl font-semibold leading-snug">
          {n !== undefined && (
            <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-base text-white">{n}</span>
          )}
          <span className={n !== undefined ? 'pt-0.5' : ''}>{n !== undefined && <span className="sr-only">Step {n}: </span>}{title}</span>
        </h3>
        <div className="space-y-3">{children}</div>
      </div>
      {shots.length > 0 && (
        <div className={beside ? '' : shots.length === 1 ? 'flex justify-center' : `grid grid-cols-2 items-start gap-4 ${shots.length > 3 ? 'sm:grid-cols-4' : ''}`}>
          {shots.map((s) => <Shot key={s.src} {...s} wide={s.wide ?? wide} />)}
        </div>
      )}
    </div>
  );
}

interface ShotProps { src: string; alt: string; caption?: string; wide?: boolean }

export function Shot({ src, alt, caption, wide = false }: ShotProps) {
  return (
    <figure className={`mx-auto w-full space-y-2 ${wide ? 'max-w-3xl' : 'max-w-[230px]'}`}>
      {/* Plain images, not lazy: lazy ones can be missing from a printout. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/help-img/${src}`} alt={alt} className="h-auto w-full rounded-xl border border-stone-200 shadow-md" />
      {caption && <figcaption className="text-center text-sm text-stone-500">{caption}</figcaption>}
    </figure>
  );
}

/** The words on a button or link, as they appear on screen. */
export function K({ children }: { children: React.ReactNode }) {
  return <span className="whitespace-nowrap rounded-md border border-stone-300 bg-stone-50 px-1.5 py-px text-[0.92em] font-medium text-stone-800">{children}</span>;
}

export function Tip({ warn = false, children }: { warn?: boolean; children: React.ReactNode }) {
  return <div className={`rounded-xl px-4 py-3 text-base ${warn ? 'border border-amber-200 bg-amber-50 text-amber-950' : 'bg-brand-light/70 text-stone-800'}`}>{children}</div>;
}

export function List({ ordered = false, children }: { ordered?: boolean; children: React.ReactNode }) {
  const cls = `space-y-1.5 pl-5 ${ordered ? 'list-decimal' : 'list-disc'} marker:text-stone-400`;
  return ordered ? <ol className={cls}>{children}</ol> : <ul className={cls}>{children}</ul>;
}

export function Question({ q, open = false, children }: { q: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group rounded-2xl border border-stone-200 bg-white px-5 py-4 shadow-sm break-inside-avoid">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
        {q}
        <span aria-hidden="true" className="mt-0.5 text-stone-400 transition group-open:rotate-45 print:hidden">+</span>
      </summary>
      <div className="mt-3 space-y-2 text-stone-700">{children}</div>
    </details>
  );
}
