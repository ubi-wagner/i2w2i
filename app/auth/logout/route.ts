import { endSession } from '@/lib/auth/session';

export async function POST() {
  await endSession();
  // Relative Location: behind Railway's proxy req.url carries the internal host.
  return new Response(null, { status: 303, headers: { Location: '/login' } });
}
