'use client';

import { useState } from 'react';

export function CopyText({ text, label = 'Copy link' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="flex w-full items-center gap-2">
      <input readOnly value={text} className="input bg-white py-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} aria-label="Link" />
      <button type="button" className="btn-secondary shrink-0 py-1 text-sm" onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true))}>
        {copied ? 'Copied' : label}
      </button>
    </span>
  );
}
