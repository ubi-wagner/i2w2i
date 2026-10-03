import Link from 'next/link';
import { Header } from '@/components/Header';
import { getCurrentUser } from '@/lib/auth/session';
import { HelpNav } from './HelpNav';

// Help is open to everyone, signed in or not: the people who need it most
// are the ones who can't get in yet.
export default async function HelpLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <>
      <div className="print:hidden">
        {user ? (
          <Header user={user} />
        ) : (
          <header className="border-b border-stone-200 bg-white">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
              <Link href="/" className="text-lg font-bold text-brand">i2w2i</Link>
              <Link href="/login" className="text-sm text-stone-600 hover:text-stone-900">Sign in</Link>
            </div>
          </header>
        )}
      </div>
      <main className="mx-auto max-w-4xl space-y-8 px-4 py-6 text-[17px] leading-relaxed [-webkit-print-color-adjust:exact] [print-color-adjust:exact] print:max-w-none print:px-0 print:py-0">
        <HelpNav />
        {children}
        <footer className="rounded-2xl bg-stone-100 px-5 py-4 text-base text-stone-700 break-inside-avoid">
          <b>Still stuck?</b> Text the person who invited you (or Eric). They can send you a new sign-in link in a minute.
          <span className="hidden print:block print:pt-1 print:text-sm print:text-stone-500">i2w2i.com/help</span>
        </footer>
      </main>
    </>
  );
}
