import 'server-only';
import { cookies, headers } from 'next/headers';

export const DEVICE_COOKIE = 'i2w2i_device';

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
  deviceId: string | null;
  request: Record<string, string>;
}

// Headers worth keeping with an activity record. Client hints arrive from
// Chromium browsers (Accept-CH is sent in next.config.ts).
const KEEP = [
  'x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'accept-language', 'referer', 'origin',
  'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform', 'sec-ch-ua-platform-version', 'sec-ch-ua-model',
  'sec-ch-ua-full-version-list', 'dnt', 'sec-gpc', 'x-railway-request-id',
];

export async function requestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const request: Record<string, string> = {};
  for (const k of KEEP) {
    const v = h.get(k);
    if (v) request[k] = v.slice(0, 500);
  }
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
  return {
    ip,
    userAgent: h.get('user-agent')?.slice(0, 1000) ?? null,
    deviceId: (await cookies()).get(DEVICE_COOKIE)?.value ?? h.get('x-i2w2i-device') ?? null,
    request,
  };
}

/** Client info sent by the browser as JSON; kept small and shape-checked loosely. */
export function parseClient(raw: unknown): Record<string, unknown> | null {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const s = JSON.stringify(v);
    return s.length <= 4000 ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
