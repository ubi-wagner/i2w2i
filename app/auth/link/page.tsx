import Link from 'next/link';
import { peekLink } from '@/lib/auth/links';
import { continueWithLink } from './actions';

export const metadata = { title: 'Sign in' };

// Email scanners pre-fetch links, so opening the page never signs anyone in;
// the button press (a POST) does.
export default async function LinkPage({ searchParams }: { searchParams: Promise<{ token?: string; expired?: string }> }) {
  const { token } = await searchParams;
  const link = token ? await peekLink(token) : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm text-center">
        {link && token ? (
          <form action={continueWithLink} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <h1 className="text-xl font-semibold">
              {link.purpose === 'invite' ? `Welcome, ${link.display_name}!` : `Hi ${link.display_name}`}
            </h1>
            <p className="text-stone-600">{link.purpose === 'invite' ? 'You’ve been invited to i2w2i.' : 'Ready to sign in?'}</p>
            <button className="btn w-full">Continue</button>
          </form>
        ) : (
          <div className="space-y-4">
            <h1 className="text-xl font-semibold">This link has expired</h1>
            <p className="text-stone-600">Sign-in links work once and only for a short time.</p>
            <Link href="/login" className="btn w-full">Get a new link</Link>
          </div>
        )}
      </div>
    </main>
  );
}
