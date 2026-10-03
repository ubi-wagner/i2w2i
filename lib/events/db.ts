import 'server-only';
import type postgres from 'postgres';
import { sql } from '../db';

/**
 * Who is asking, as Postgres row-level security sees it (db/migrations/003).
 * Every query against the events schema runs inside withCtx so the policies
 * apply; without it the app role sees nothing.
 */
export interface EventCtx {
  userId: string | null;
  admin: boolean;
  guest: { id: string; eventId: string; canUpload: boolean; canView: boolean } | null;
}

export const ANON: EventCtx = { userId: null, admin: false, guest: null };

export type Tx = postgres.TransactionSql<Record<string, unknown>>;

export async function withCtx<T>(ctx: EventCtx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`
      SELECT set_config('app.user_id',    ${ctx.userId ?? ''}, true),
             set_config('app.is_admin',   ${ctx.admin ? 'true' : ''}, true),
             set_config('app.guest_id',   ${ctx.guest?.id ?? ''}, true),
             set_config('app.event_id',   ${ctx.guest?.eventId ?? ''}, true),
             set_config('app.can_upload', ${ctx.guest?.canUpload ? 'true' : ''}, true),
             set_config('app.can_view',   ${ctx.guest?.canView ? 'true' : ''}, true)`;
    return fn(tx as unknown as Tx);
  }) as Promise<T>;
}
