'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const PAGES = [
  ['/help', 'Help'],
  ['/help/start', 'Getting started'],
  ['/help/hosting', 'Running an event'],
  ['/help/faq', 'Questions'],
] as const;

/** Tabs between the help pages, and a button that prints (or saves as PDF) the one you're on. */
export function HelpNav() {
  const path = usePathname();

  // Answers folded away in <details> would print as bare questions, so
  // printing opens them all and puts them back afterwards. This also covers
  // the browser's own Print menu, not just the button.
  useEffect(() => {
    let opened: HTMLDetailsElement[] = [];
    const before = () => {
      opened = [...document.querySelectorAll<HTMLDetailsElement>('main details:not([open])')];
      for (const d of opened) d.open = true;
    };
    const after = () => {
      for (const d of opened) d.open = false;
      opened = [];
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
      <nav aria-label="Help pages" className="-mx-1 flex flex-wrap gap-1">
        {PAGES.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            aria-current={path === href ? 'page' : undefined}
            className={`rounded-full px-3 py-1.5 text-sm ${path === href ? 'bg-brand text-white' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <button type="button" onClick={() => window.print()} className="btn-secondary gap-2 py-1.5 text-sm">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <path d="M6 14h12v7H6z" />
        </svg>
        Print or save as PDF
      </button>
    </div>
  );
}
