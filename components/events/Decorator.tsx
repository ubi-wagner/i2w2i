'use client';

import { useEffect, useMemo, useState } from 'react';
import { FILTERS, FRAMES, captionStyle, filterCss, frameSvg, type FilterId, type FrameId, type Overlay } from '@/lib/events/overlay';

// Frames, filters and a caption. Kept short on purpose (a few frames, a few
// filters) and skipping is one tap: half the guests are holding a drink.
export function Decorator({
  file,
  initial,
  onSave,
  onClose,
}: {
  file: File;
  initial?: Overlay | null;
  onSave: (o: Overlay) => void;
  onClose: () => void;
}) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const isVideo = file.type.startsWith('video/');
  const [frame, setFrame] = useState<FrameId>(initial?.frame ?? 'none');
  const [filter, setFilter] = useState<FilterId>(initial?.filter ?? 'none');
  const [caption, setCaption] = useState(initial?.caption ?? '');
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const svg = dims ? frameSvg(frame, dims.w, dims.h) : null;
  const cap = dims ? captionStyle(frame, dims.w, dims.h) : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white" role="dialog" aria-modal="true" aria-label="Decorate">
      <div className="flex items-center justify-between p-3">
        <button type="button" className="px-2 py-1" onClick={onClose}>Cancel</button>
        <span className="font-medium">Decorate</span>
        <button type="button" className="rounded-lg bg-white px-3 py-1 font-semibold text-stone-900" onClick={() => onSave({ v: 1, frame, filter, ...(caption.trim() ? { caption: caption.trim().slice(0, 80) } : {}) })}>
          Save
        </button>
      </div>
      <div className="flex min-h-0 grow items-center justify-center p-3">
        <div className="relative inline-block max-h-full max-w-full" style={dims ? { aspectRatio: `${dims.w} / ${dims.h}` } : undefined}>
          {isVideo ? (
            <video src={url} muted playsInline autoPlay loop className="block max-h-[60vh] max-w-full" style={{ filter: filterCss(filter) }}
              onLoadedMetadata={(e) => setDims({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="block max-h-[60vh] max-w-full" style={{ filter: filterCss(filter) }}
              onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
          )}
          {svg && <div className="pointer-events-none absolute inset-0 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />}
          {caption.trim() && cap && dims && (
            <span
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap px-2 font-semibold"
              style={{
                left: `${(cap.x / dims.w) * 100}%`, top: `${(cap.y / dims.h) * 100}%`, color: cap.color,
                fontSize: `min(4.5vw, 22px)`, background: cap.band ? 'rgba(0,0,0,0.45)' : undefined,
              }}
            >
              {caption.trim()}
            </span>
          )}
        </div>
      </div>
      <div className="space-y-3 p-3">
        <div className="flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label="Frame">
          {(Object.keys(FRAMES) as FrameId[]).map((f) => (
            <button key={f} type="button" role="radio" aria-checked={frame === f} onClick={() => setFrame(f)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${frame === f ? 'bg-white text-stone-900' : 'bg-white/15'}`}>
              {FRAMES[f].name}
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label="Filter">
          {(Object.keys(FILTERS) as FilterId[]).map((f) => (
            <button key={f} type="button" role="radio" aria-checked={filter === f} onClick={() => setFilter(f)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${filter === f ? 'bg-white text-stone-900' : 'bg-white/15'}`}>
              {FILTERS[f].name}
            </button>
          ))}
        </div>
        <input className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 placeholder:text-stone-400" value={caption}
          onChange={(e) => setCaption(e.target.value)} maxLength={80} placeholder="Add a caption (optional)" aria-label="Caption" />
        <p className="text-center text-xs text-stone-400">Your original is kept as taken; this only changes how it shows in the album.</p>
      </div>
    </div>
  );
}
