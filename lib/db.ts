import 'server-only';
import postgres from 'postgres';
import { appDatabaseUrl } from '@/db/urls.mjs';

declare global {
  // Reused across hot reloads in dev so we don't leak connections.
  var __i2w2iSql: postgres.Sql | undefined;
}

function connect() {
  const url = appDatabaseUrl();
  if (!url) throw new Error('DATABASE_URL is not set');
  return postgres(url, { max: Number(process.env.DB_POOL_MAX ?? 10), onnotice: () => {} });
}

/** Lazily connects so `next build` works without a database. */
export const sql: postgres.Sql = new Proxy((() => {}) as unknown as postgres.Sql, {
  get(_t, prop) {
    const real = (globalThis.__i2w2iSql ??= connect());
    const value = Reflect.get(real, prop);
    return typeof value === 'function' ? value.bind(real) : value;
  },
  apply(_t, _this, args) {
    globalThis.__i2w2iSql ??= connect();
    return Reflect.apply(globalThis.__i2w2iSql as unknown as (...a: unknown[]) => unknown, undefined, args);
  },
});
