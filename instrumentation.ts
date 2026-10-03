export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // Not awaited: a slow bucket API shouldn't delay the server becoming ready.
  import('./lib/storage').then((m) => m.ensureBucketCors()).catch((err) => console.error('[storage]', err));
  import('./lib/housekeeping').then((m) => m.startHousekeeping()).catch((err) => console.error('[housekeeping]', err));
}
