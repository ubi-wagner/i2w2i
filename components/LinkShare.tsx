'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * A one-time link to hand to someone: copy it into a text, or let them scan
 * it from your screen. There's no email, so this is how invites and
 * password resets travel.
 */
export function LinkShare({ link, name, note }: { link: string; name?: string; note?: string }) {
  const [svg, setSvg] = useState('');
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  useEffect(() => {
    QRCode.toString(link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then(setSvg).catch(() => setSvg(''));
  }, [link]);

  return (
    <div className="space-y-2 rounded-lg bg-stone-100 p-3 text-sm" role="status">
      <p>{note ?? `Send ${name ?? 'them'} this link, or let them scan the QR from your screen. It works once, for 7 days.`}</p>
      <div className="flex gap-2">
        <input readOnly value={link} className="input bg-white font-mono text-xs" onFocus={(e) => e.currentTarget.select()} aria-label="One-time link" />
        <button type="button" className="btn-secondary shrink-0" onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true))}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className="btn-secondary shrink-0" onClick={() => setShowQr((v) => !v)} aria-expanded={showQr}>QR</button>
      </div>
      {showQr && svg && <div className="mx-auto w-56 rounded-lg bg-white p-2" aria-label="QR code for the link" dangerouslySetInnerHTML={{ __html: svg }} />}
    </div>
  );
}
