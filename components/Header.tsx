import Link from 'next/link';
import type { CurrentUser } from '@/lib/auth/session';

export function Header({ user }: { user: CurrentUser }) {
  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-lg font-bold text-brand">i2w2i</Link>
        <nav className="flex items-center gap-4 text-sm">
          {user.platform_role === 'admin' && <Link href="/admin" className="text-stone-600 hover:text-stone-900">People</Link>}
          <Link href="/account" className="text-stone-600 hover:text-stone-900">{user.display_name}</Link>
          <form action="/auth/logout" method="post">
            <button className="text-stone-600 hover:text-stone-900">Sign out</button>
          </form>
        </nav>
      </div>
    </header>
  );
}
