import { UPLOAD_URL_TTL } from '../storage';

// Review before anyone else sees an upload (migration 008). Pure helpers.

/** When the links being handed out now stop working (plus a minute of clock slack). */
export function writableUntil(now = Date.now()): Date {
  return new Date(now + (UPLOAD_URL_TTL + 60) * 1000);
}

/** Minutes until an upload can be approved, or 0 if it can be now. */
export function minutesUntilReviewable(writableUntil: Date | null, now = Date.now()): number {
  if (!writableUntil) return 0;
  const ms = writableUntil.getTime() - now;
  return ms > 0 ? Math.ceil(ms / 60_000) : 0;
}
