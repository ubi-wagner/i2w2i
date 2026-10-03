import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { safeNext } from '@/lib/access';
import { LoginForm } from './LoginForm';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await getCurrentUser()) redirect(next);
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-3xl font-bold text-brand">i2w2i</h1>
        <p className="mb-6 text-center text-stone-600">Family apps, in one place.</p>
        <div className="card"><LoginForm next={next} /></div>
      </div>
    </main>
  );
}
