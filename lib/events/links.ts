// Gift and payment links shown on an album. Handles become https URLs;
// anything else must already be an https URL. Pure, no I/O.

export type LinkKind = 'venmo' | 'paypal' | 'cashapp' | 'registry' | 'link';

export const LINK_KINDS: { kind: LinkKind; label: string; placeholder: string }[] = [
  { kind: 'venmo', label: 'Venmo', placeholder: '@cassie-b or venmo link' },
  { kind: 'paypal', label: 'PayPal', placeholder: 'paypal.me name or link' },
  { kind: 'cashapp', label: 'Cash App', placeholder: '$cashtag or link' },
  { kind: 'registry', label: 'Gift registry', placeholder: 'https://… registry link' },
  { kind: 'link', label: 'Other link', placeholder: 'https://…' },
];

function httpsUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && u.hostname.includes('.') && raw.length <= 500 ? u.toString() : null;
  } catch {
    return null;
  }
}

export function linkUrl(kind: LinkKind, input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  if (/^https:\/\//i.test(v)) return httpsUrl(v);
  if (/^http:\/\//i.test(v)) return null;
  const handle = v.replace(/^[@$]/, '');
  if (!/^[A-Za-z0-9_.-]{1,40}$/.test(handle)) return kind === 'registry' || kind === 'link' ? httpsUrl(`https://${v}`) : null;
  switch (kind) {
    case 'venmo':
      return `https://venmo.com/u/${handle}`;
    case 'paypal':
      return `https://paypal.me/${handle}`;
    case 'cashapp':
      return `https://cash.app/$${handle}`;
    default:
      return httpsUrl(`https://${v}`);
  }
}

export function defaultLabel(kind: LinkKind, url: string): string {
  const k = LINK_KINDS.find((x) => x.kind === kind)!;
  if (kind === 'venmo' || kind === 'paypal' || kind === 'cashapp') {
    const handle = url.split('/').pop() ?? '';
    return `${k.label} ${kind === 'venmo' ? '@' : ''}${handle}`;
  }
  return k.label;
}
