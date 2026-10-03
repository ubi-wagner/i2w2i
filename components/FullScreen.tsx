'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * A full-screen layer for the lightbox and the decorator: rendered at the end
 * of <body> (so nothing on the page can sit above or show through it), with a
 * solid backdrop and page scrolling locked while it's open.
 */
export function FullScreen({ label, children }: { label: string; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label={label}>
      {children}
    </div>,
    document.body,
  );
}
