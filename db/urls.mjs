// Which connection string each part of the app uses.
//
//   owner (migrations, bootstrap): DATABASE_URL_OWNER, else DATABASE_URL
//   app   (the web server):        APP_DATABASE_URL, else DATABASE_URL with
//                                  its credentials swapped for i2w2i_app /
//                                  APP_DB_PASSWORD, else DATABASE_URL (dev)
//
// On Railway DATABASE_URL is the Postgres owner, which bypasses row-level
// security. Setting APP_DB_PASSWORD makes the server connect as i2w2i_app,
// a role that can't.
export const APP_ROLE = 'i2w2i_app';

export function ownerDatabaseUrl(env = process.env) {
  return env.DATABASE_URL_OWNER || env.DATABASE_URL;
}

export function appDatabaseUrl(env = process.env) {
  if (env.APP_DATABASE_URL) return env.APP_DATABASE_URL;
  const base = ownerDatabaseUrl(env);
  if (!base || !env.APP_DB_PASSWORD) return env.DATABASE_URL;
  const u = new URL(base);
  u.username = APP_ROLE;
  u.password = env.APP_DB_PASSWORD;
  return u.toString();
}

/** Passwords go into ALTER ROLE as a literal, so keep them to a safe alphabet. */
export function appPasswordProblem(pw) {
  if (!pw) return null;
  if (!/^[A-Za-z0-9_-]{24,128}$/.test(pw)) return 'APP_DB_PASSWORD must be 24-128 letters, digits, - or _';
  return null;
}
