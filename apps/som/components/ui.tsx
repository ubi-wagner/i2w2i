'use client';

import { useEffect, useRef } from 'react';

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-ink-soft" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-lead" />
      {label}
    </div>
  );
}

export function ErrorText({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="text-sm text-stop" role="alert">{children}</p>;
}

/** A bottom sheet on phones, a centred dialog on wider screens (native <dialog>). */
export function Sheet({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      // A sheet opened inside this one (a photo in a task) closes on its own:
      // React hands its close event up the tree, so check whose it is.
      onClose={(e) => { if (e.target === ref.current) onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className={`m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-3xl border border-line bg-paper p-0 text-ink shadow-2xl backdrop:bg-black/50 sm:m-auto sm:rounded-3xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-line bg-paper-raised px-5 py-3">
        <h2 className="font-display text-xl">{title}</h2>
        <button type="button" onClick={onClose} className="rounded-full px-2 py-1 text-2xl leading-none text-ink-soft" aria-label="Close">×</button>
      </div>
      <div className="max-h-[calc(92dvh-56px)] overflow-y-auto px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{open && children}</div>
    </dialog>
  );
}

export function Section({ title, eyebrow, children, action }: { title: string; eyebrow?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          {eyebrow && <p className="eyebrow text-follow">{eyebrow}</p>}
          <h2 className="font-display text-2xl text-lead-dark">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function timeAgo(d: string | Date): string {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function clock(d: string | Date): string {
  return new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
