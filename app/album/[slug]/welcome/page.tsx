import { redirect } from 'next/navigation';

// Event invites used to be one-time links to this page. New people now get a
// username and password instead; a link already handed out (they last 7
// days) still works through the general sign-in link page.
export default async function EventWelcome({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  redirect(token ? `/auth/link?token=${encodeURIComponent(token)}` : '/login');
}
