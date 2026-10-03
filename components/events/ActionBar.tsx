'use client';

import { useEffect, useRef, useState } from 'react';

export type ActionIcon = 'pin' | 'clock' | 'gift' | 'info';

export interface EventAction {
  key: string;
  label: string;
  title: string;
  icon: ActionIcon;
  panel: React.ReactNode;
}

const PATHS: Record<ActionIcon, React.ReactNode> = {
  pin: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.4" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  gift: <><rect x="3.5" y="8" width="17" height="4" rx="1" /><path d="M5.5 12v8.5h13V12M12 8v12.5M12 8C10.5 4.5 6.5 4.5 6.5 6.8 6.5 8 9 8 12 8Zm0 0c1.5-3.5 5.5-3.5 5.5-1.2C17.5 8 15 8 12 8Z" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.8v.2" /></>,
};

export function Icon({ name, className = 'h-5 w-5' }: { name: ActionIcon; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

/**
 * The event's quick actions (Directions, Schedule, Good to know, Gifts) as
 * buttons that open a sheet. The sheet is a native <dialog> inside the
 * page, so it keeps the event's theme.
 */
export function ActionBar({ actions }: { actions: EventAction[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!actions.length) return null;
  return (
    <>
      <nav aria-label="Event details" className="flex flex-wrap justify-center gap-2">
        {actions.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => setOpen(a.key)}
            className="inline-flex items-center gap-2 rounded-full border border-brand/40 bg-white px-4 py-2.5 text-sm font-medium text-brand-dark shadow-sm transition hover:border-brand hover:bg-brand-light active:scale-[0.98]"
          >
            <Icon name={a.icon} />
            {a.label}
          </button>
        ))}
      </nav>
      {actions.map((a) => (
        <Sheet key={a.key} title={a.title} icon={a.icon} open={open === a.key} onClose={() => setOpen(null)}>
          {a.panel}
        </Sheet>
      ))}
    </>
  );
}

function Sheet({ title, icon, open, onClose, children }: { title: string; icon: ActionIcon; open: boolean; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      document.documentElement.style.overflow = 'hidden';
    } else if (!open && d.open) d.close();
    return () => { document.documentElement.style.overflow = ''; };
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={() => { document.documentElement.style.overflow = ''; onClose(); }}
      // A tap on the dimmed backdrop closes it.
      onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
      className="m-0 mt-auto max-h-[88dvh] w-full max-w-none overflow-y-auto rounded-t-3xl border border-stone-200 bg-stone-50 p-0 text-stone-900 shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm sm:m-auto sm:max-w-lg sm:rounded-3xl"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-stone-200 bg-stone-50/95 px-5 py-4 backdrop-blur">
        <h2 className="flex items-center gap-2 font-display text-2xl font-semibold"><span className="text-brand"><Icon name={icon} className="h-6 w-6" /></span>{title}</h2>
        <button type="button" onClick={() => ref.current?.close()} className="flex h-10 w-10 items-center justify-center rounded-full text-2xl text-stone-500 hover:bg-stone-100" aria-label="Close">×</button>
      </div>
      <div className="px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">{children}</div>
    </dialog>
  );
}
