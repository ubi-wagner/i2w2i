#!/usr/bin/env node
// Runs at boot after migrations: connects exactly as the web server will and
// confirms that role can't bypass row-level security. In production a role
// that can (the Railway owner) refuses the boot, so RLS is never decorative.
import postgres from 'postgres';
import { appDatabaseUrl } from '../db/urls.mjs';

const sql = postgres(appDatabaseUrl(), { max: 1, onnotice: () => {} });
try {
  const [r] = await sql`SELECT current_user AS name, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
  const bypass = r.rolsuper || r.rolbypassrls;
  if (bypass && process.env.NODE_ENV === 'production') {
    console.error(`[db-role] the server would connect as ${r.name}, which bypasses row-level security. Set APP_DB_PASSWORD.`);
    process.exitCode = 1;
  } else {
    console.log(`[db-role] server connects as ${r.name}${bypass ? ' (bypasses RLS; dev only)' : ''}`);
  }
} catch (err) {
  console.error('[db-role] could not connect as the app role:', err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
