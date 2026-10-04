import { redirect } from 'next/navigation';
import { currentAccount } from '@/lib/server/auth';
import { safeNext } from '@/lib/usernames';
import { LoginForm } from './LoginForm';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await currentAccount()) redirect(next);
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <p className="text-center font-display text-5xl font-bold tracking-wide text-lead">S·O·M</p>
        <div className="card"><LoginForm next={next} /></div>
      </div>
    </main>
  );
}
