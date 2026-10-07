import Link from 'next/link';
import type { CurrentUser } from '@/lib/auth/session';

export function Header({ user }: { user: CurrentUser }) {
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-lg font-bold text-brand">i2w2i</Link>
        <nav className="flex items-center gap-3 text-sm text-stone-600 sm:gap-4">
          <Link href="/events" className="hover:text-stone-900">Events</Link>
          {user.platform_role === 'admin' && <Link href="/admin" className="hover:text-stone-900">Accounts</Link>}
          <Link href="/help" className="hover:text-stone-900">Help</Link>
          <Link href="/account" className="hover:text-stone-900" title="Your account">{user.display_name.split(' ')[0]}</Link>
          <form action="/auth/logout" method="post">
            <button className="hover:text-stone-900">Sign out</button>
          </form>
        </nav>
      </div>
    </header>
  );
}
