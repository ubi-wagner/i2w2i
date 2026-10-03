import Link from 'next/link';
import { peekLink } from '@/lib/auth/links';
import { continueWithLink } from './actions';

export const metadata = { title: 'Welcome' };

// Email scanners pre-fetch links, so opening the page never signs anyone in;
// the button press (a POST) does.
export default async function LinkPage({ searchParams }: { searchParams: Promise<{ token?: string; expired?: string }> }) {
  const { token } = await searchParams;
  const link = token ? await peekLink(token) : null;
  const first = link?.display_name.split(' ')[0];
  const isNew = link && !link.has_password;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <p className="mb-6 text-3xl font-bold text-brand">i2w2i</p>
      <div className="card w-full max-w-sm space-y-4 text-center">
        {link && token ? (
          <form action={continueWithLink} className="space-y-4">
            <input type="hidden" hidden name="token" value={token} />
            <h1 className="text-xl font-semibold">{isNew ? `Welcome, ${first}!` : `Hi ${first}`}</h1>
            <p className="text-stone-600">
              {isNew
                ? `${link.inviter ? `${link.inviter} invited you to` : 'You’ve been invited to'} the family’s private photo albums. Next you’ll choose a password.`
                : 'This link signs you in once, so you can choose a new password.'}
            </p>
            <button className="btn w-full">Continue</button>
          </form>
        ) : (
          <>
            <h1 className="text-xl font-semibold">This link has already been used</h1>
            <p className="text-stone-600">Sign-in links work once and expire after a while. Sign in with your username and password instead, or ask the person who added you (or Eric) to reset your password.</p>
            <Link href="/login" className="btn w-full">Sign in with password</Link>
          </>
        )}
      </div>
    </main>
  );
}
