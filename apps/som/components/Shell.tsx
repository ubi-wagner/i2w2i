'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PodGate } from './Pod';

const NAV = [
  ['/', 'Scenes'],
  ['/menu', 'Menu'],
  ['/us', 'Us'],
  ['/settings', 'Settings'],
] as const;

/** Every signed-in page: the pod gate, a slim header and the page. */
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-paper-raised/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2.5">
          <Link href="/" className="font-display text-xl font-bold tracking-wide text-lead">S·O·M</Link>
          <nav className="flex gap-0.5 text-sm sm:gap-1">
            {NAV.map(([href, label]) => {
              const on = href === '/' ? path === '/' || path.startsWith('/scene') : path.startsWith(href);
              return (
                <Link key={href} href={href} aria-current={on ? 'page' : undefined} aria-label={label} className={`rounded-full px-2.5 py-1.5 sm:px-3 ${on ? 'bg-lead text-white' : 'text-ink-soft'}`}>
                  {/* Small phones: a gear for Settings, so everything fits. */}
                  {href === '/settings' ? <><span className="sm:hidden" aria-hidden>⚙︎</span><span className="hidden sm:inline">{label}</span></> : label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-5">
        <PodGate>{children}</PodGate>
      </main>
    </>
  );
}
