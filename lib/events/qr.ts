import 'server-only';
import QRCode from 'qrcode';
import { appUrl } from '../auth/links';
import { qrToken } from './codes';

export function albumUrl(slug: string): string {
  return `${appUrl()}/album/${slug}`;
}

/**
 * A one-time sign-in link (from issueLink) re-pointed at this event's own
 * welcome page, so people invited to an event land in its look, not the
 * family dashboard. Same token, same single use.
 */
export function eventInviteUrl(link: string, slug: string): string {
  const token = new URL(link).searchParams.get('token') ?? '';
  return `${albumUrl(slug)}/welcome?token=${encodeURIComponent(token)}`;
}

export function qrLink(slug: string, accessCodeId: string, version: number): string {
  return `${albumUrl(slug)}?t=${qrToken(accessCodeId, version)}`;
}

export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, color: { dark: '#1c1917', light: '#ffffff' } });
}
