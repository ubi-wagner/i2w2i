export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // Not awaited: a slow bucket API shouldn't delay the server becoming ready.
  import('./lib/server/storage').then((m) => m.ensureBucketCors()).catch((err) => console.error('[storage]', err));
  import('./lib/server/scheduler').then((m) => m.startScheduler()).catch((err) => console.error('[timers]', err));
}
