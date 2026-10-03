'use client';

import { useState } from 'react';
import { filterCss, frameSvg, type Overlay } from '@/lib/events/overlay';

/** Videos aren't re-encoded: the frame and filter are drawn over them at playback. */
export function FramedVideo({ src, poster, overlay, className }: { src: string; poster?: string | null; overlay: Overlay | null; className?: string }) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const svg = overlay && dims ? frameSvg(overlay.frame, dims.w, dims.h) : null;
  return (
    <span className="relative inline-block max-h-full max-w-full" onClick={(e) => e.stopPropagation()}>
      <video src={src} poster={poster ?? undefined} controls autoPlay playsInline className={className} style={overlay ? { filter: filterCss(overlay.filter) } : undefined}
        onLoadedMetadata={(e) => setDims({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })} />
      {svg && <span className="pointer-events-none absolute inset-0 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />}
      {overlay?.caption && <span className="pointer-events-none absolute bottom-[12%] left-1/2 -translate-x-1/2 rounded bg-black/45 px-2 font-semibold text-white">{overlay.caption}</span>}
    </span>
  );
}
