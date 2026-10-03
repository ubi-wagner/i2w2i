import { notFound } from 'next/navigation';
import { EventHero, ThemeFrame } from '@/components/events/ThemeFrame';
import { peekLink } from '@/lib/auth/links';
import { publicEvent } from '@/lib/events/session';
import { UsedLink, WelcomeForm } from './WelcomeForm';

export const metadata = { title: 'Welcome' };

// Where invite links made on an event's page land. Opening it signs no one
// in (message previews fetch links); choosing the password does.
export default async function EventWelcome({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ token?: string }> }) {
  const { slug } = await params;
  const { token } = await searchParams;
  const event = /^[a-z0-9][a-z0-9-]{1,60}$/.test(slug) ? await publicEvent(slug) : null;
  if (!event) notFound();
  const link = token ? await peekLink(token) : null;
  const first = link?.display_name.split(' ')[0];
  const isNew = Boolean(link && !link.has_password);

  return (
    <ThemeFrame theme={event.theme}>
      <main className="mx-auto max-w-md space-y-6 px-4 py-10">
        <EventHero theme={event.theme} title={event.title} startsOn={event.starts_on} location={event.location} />
        <div className="card space-y-4 text-center">
          {link && token ? (
            <>
              <h2 className="text-2xl font-semibold">{isNew ? `Welcome, ${first}!` : `Hi ${first}`}</h2>
              <p className="text-stone-700">
                {isNew
                  ? `${link.inviter ?? 'The hosts'} added you to ${event.title}. Choose a password and you’re in.`
                  : 'Choose a new password and you’re back in.'}
              </p>
              <WelcomeForm token={token} slug={slug} email={link.email} isNew={isNew} />
            </>
          ) : (
            <UsedLink slug={slug} />
          )}
        </div>
      </main>
    </ThemeFrame>
  );
}
