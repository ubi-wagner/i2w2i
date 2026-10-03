import 'server-only';
import QRCode from 'qrcode';
import { appUrl } from '../auth/links';
import { qrToken } from './codes';

export function albumUrl(slug: string): string {
  return `${appUrl()}/album/${slug}`;
}

export function qrLink(slug: string, accessCodeId: string, version: number): string {
  return `${albumUrl(slug)}?t=${qrToken(accessCodeId, version)}`;
}

export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, color: { dark: '#1c1917', light: '#ffffff' } });
}
