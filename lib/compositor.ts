// Browser-only: renders the gallery copy of a decorated photo from the
// original + manifest. Same size rules as plain previews (long edge 2048,
// which also keeps iOS under its canvas limit); re-encoding drops metadata.
import { PREVIEW_LONG_EDGE } from './events/limits';
import { applyFilter, captionStyle, frameSvg, isPlain, type Overlay } from './events/overlay';

function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  return img.decode().then(() => img);
}

export async function renderPreview(file: File, overlay: Overlay | null): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, PREVIEW_LONG_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: Boolean(overlay && overlay.filter !== 'none') })!;
    ctx.drawImage(img, 0, 0, w, h);
    if (overlay && !isPlain(overlay)) {
      if (overlay.filter !== 'none') {
        const px = ctx.getImageData(0, 0, w, h);
        applyFilter(px.data, overlay.filter);
        ctx.putImageData(px, 0, 0);
      }
      const svg = frameSvg(overlay.frame, w, h);
      if (svg) ctx.drawImage(await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`), 0, 0, w, h);
      if (overlay.caption) {
        const st = captionStyle(overlay.frame, w, h);
        ctx.font = `600 ${Math.round(st.size)}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const text = overlay.caption;
        if (st.band) {
          const tw = Math.min(w * 0.92, ctx.measureText(text).width + st.size * 1.2);
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          ctx.fillRect(st.x - tw / 2, st.y - st.size * 0.8, tw, st.size * 1.6);
        }
        ctx.fillStyle = st.color;
        ctx.fillText(text, st.x, st.y, w * 0.9);
      }
    }
    return await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.86));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
