import { redirect } from 'next/navigation';
import { Header } from '@/components/Header';
import { requireApp } from '@/lib/apps';
import { NewEventForm } from './NewEventForm';

export const metadata = { title: 'New event' };

export default async function NewEventPage() {
  const { user } = await requireApp('events');
  if (user.platform_role === 'member') redirect('/events');
  return (
    <>
      <Header user={user} />
      <main className="mx-auto max-w-xl px-4 py-8">
        <div className="card space-y-4">
          <h1 className="text-xl font-semibold">New event</h1>
          <NewEventForm />
        </div>
      </main>
    </>
  );
}
