'use client';

import { useState } from 'react';

export function CopyButton({ text, label, className = 'btn-secondary w-full' }: { text: string; label: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={className} onClick={() => navigator.clipboard.writeText(text).then(() => setDone(true), () => {})}>
      {done ? 'Copied ✓' : label}
    </button>
  );
}
