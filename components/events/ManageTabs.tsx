'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface ManageTab { href: string; label: string; badge?: number }

/**
 * The manage pages' tabs: one page per part of the event, so nobody has to
 * scroll through everything to find the one thing they came to do.
 */
export function ManageTabs({ tabs }: { tabs: ManageTab[] }) {
  const path = usePathname();
  // The longest matching href wins, so "/events/x" (Overview) isn't current on "/events/x/photos".
  const current = tabs.filter((t) => path === t.href || path.startsWith(`${t.href}/`)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav aria-label="Manage" className="sticky top-0 z-20 -mx-4 overflow-x-auto border-b border-stone-200 bg-stone-50/95 px-4 backdrop-blur">
      <ul className="flex gap-1 whitespace-nowrap text-sm">
        {tabs.map((t) => {
          const on = t.href === current;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={on ? 'page' : undefined}
                className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-3 ${on ? 'border-brand font-semibold text-brand-dark' : 'border-transparent text-stone-600 hover:text-brand'}`}
              >
                {t.label}
                {t.badge ? <span className="rounded-full bg-amber-400 px-1.5 text-xs font-semibold text-amber-950">{t.badge}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
