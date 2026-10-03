import { requireApp } from '@/lib/apps';

export const metadata = { title: 'Couples' };

// Hidden (404) for anyone without an explicit grant; see lib/apps.ts.
export default async function CouplesHome() {
  await requireApp('couples');
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Couples</h1>
      <p className="mt-2 text-stone-600">Not built yet.</p>
    </main>
  );
}
