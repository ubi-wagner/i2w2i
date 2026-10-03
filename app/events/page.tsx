import { Header } from '@/components/Header';
import { requireApp } from '@/lib/apps';

export const metadata = { title: 'Events' };

export default async function EventsHome() {
  const { user, role } = await requireApp('events');
  return (
    <>
      <Header user={user} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Events</h1>
        <p className="mt-2 text-stone-600">
          Coming next: create an event, invite people, collect photos by QR code, and publish pages.
          {role !== 'viewer' && user.platform_role !== 'member' && ' You’ll be able to create events here.'}
        </p>
      </main>
    </>
  );
}
