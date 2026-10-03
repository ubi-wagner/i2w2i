import Link from 'next/link';
import { Header } from '@/components/Header';
import { requireUser } from '@/lib/auth/session';
import { appsForUser } from '@/lib/apps';

export const metadata = { title: 'Your apps' };

export default async function Dashboard() {
  const user = await requireUser();
  const apps = await appsForUser(user);

  return (
    <>
      <Header user={user} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold">Hi {user.display_name.split(' ')[0]}</h1>
        {apps.length === 0 ? (
          <div className="card text-stone-600">No apps have been shared with you yet. Ask the family admin to add you.</div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {apps.map(({ app }) => (
              <li key={app.key}>
                <Link href={app.path} className="card block h-full transition hover:border-brand hover:shadow-md">
                  <h2 className="text-lg font-semibold">{app.name}</h2>
                  <p className="mt-1 text-sm text-stone-600">{app.description}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
