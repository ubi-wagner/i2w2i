import type { ClientInfo } from './client-info';

// A one-line, human description of a device from its user agent and what
// the browser reported. Best effort; the raw values are kept alongside.
export function describeDevice(ua: string | null | undefined, client?: ClientInfo | null): string {
  const s = ua ?? '';
  let device = 'Unknown device';
  let os = '';
  const ios = /(iPhone|iPad|iPod).*? OS (\d+)[_.](\d+)/.exec(s);
  const android = /Android (\d+(?:\.\d+)?)(?:;[^;)]*)*?;\s*([^;)]+?)\s*(?:Build|\))/.exec(s);
  if (ios) {
    device = ios[1]!;
    os = `iOS ${ios[2]}.${ios[3]}`;
  } else if (/Android/.test(s)) {
    const model = client?.model || android?.[2];
    device = model && model !== 'K' ? `Android (${model})` : 'Android';
    os = android ? `Android ${android[1]}` : '';
    if (client?.platformVersion) os = `Android ${client.platformVersion}`;
  } else if (/Macintosh/.test(s)) {
    // iPads ask for desktop sites but still report touch.
    device = (client?.touchPoints ?? 0) > 1 ? 'iPad' : 'Mac';
  } else if (/Windows/.test(s)) {
    device = 'Windows PC';
  } else if (/CrOS/.test(s)) {
    device = 'Chromebook';
  } else if (/Linux/.test(s)) {
    device = 'Linux';
  }
  const browser =
    /EdgA?\/(\d+)/.exec(s)?.[1] ? `Edge ${/EdgA?\/(\d+)/.exec(s)![1]}` :
    /SamsungBrowser\/(\d+)/.exec(s) ? `Samsung Internet ${/SamsungBrowser\/(\d+)/.exec(s)![1]}` :
    /CriOS\/(\d+)/.exec(s) ? `Chrome ${/CriOS\/(\d+)/.exec(s)![1]}` :
    /FxiOS\/(\d+)|Firefox\/(\d+)/.exec(s) ? 'Firefox' :
    /Chrome\/(\d+)/.exec(s) ? `Chrome ${/Chrome\/(\d+)/.exec(s)![1]}` :
    /Version\/(\d+).*Safari/.exec(s) ? `Safari ${/Version\/(\d+).*Safari/.exec(s)![1]}` :
    /Safari/.test(s) ? 'Safari' : '';
  // In-app browsers (scanned from Instagram, Facebook, ...) are worth knowing.
  const inApp = /Instagram/.test(s) ? 'Instagram app' : /FBAN|FBAV/.test(s) ? 'Facebook app' : /Snapchat/.test(s) ? 'Snapchat app' : '';
  return [device, os, inApp || browser].filter(Boolean).join(' · ');
}
