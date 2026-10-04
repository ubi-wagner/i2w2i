import 'server-only';
import postgres from 'postgres';

declare global {
  // Reused across hot reloads in dev so we don't leak connections.
  var __somSql: postgres.Sql | undefined;
}

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return postgres(url, { max: Number(process.env.DB_POOL_MAX ?? 10), onnotice: () => {} });
}

/** Lazily connects so `next build` works without a database. */
export const sql: postgres.Sql = new Proxy((() => {}) as unknown as postgres.Sql, {
  get(_t, prop) {
    const real = (globalThis.__somSql ??= connect());
    const value = Reflect.get(real, prop);
    return typeof value === 'function' ? value.bind(real) : value;
  },
  apply(_t, _this, args) {
    globalThis.__somSql ??= connect();
    return Reflect.apply(globalThis.__somSql as unknown as (...a: unknown[]) => unknown, undefined, args);
  },
});
