// Frames, filters and captions: a small manifest stored with an upload
// (events.uploads.overlay). The original is never changed; the gallery copy
// of a photo is re-rendered on the phone from original + manifest, and
// videos get the frame and filter at playback. Pure; runs on both sides.

export interface Overlay {
  v: 1;
  frame: FrameId;
  filter: FilterId;
  caption?: string;
}

// ── Filters: one definition, two renderers (CSS for previews, pixel math
// for the saved image, since older Safari has no canvas filter support). ──

type Op = { op: 'grayscale' | 'sepia' | 'saturate' | 'contrast' | 'brightness'; v: number };

export const FILTERS = {
  none: { name: 'Original', ops: [] as Op[] },
  warm: { name: 'Warm', ops: [{ op: 'sepia', v: 0.25 }, { op: 'saturate', v: 1.35 }, { op: 'contrast', v: 1.05 }] as Op[] },
  bw: { name: 'B&W', ops: [{ op: 'grayscale', v: 1 }, { op: 'contrast', v: 1.12 }] as Op[] },
  vintage: { name: 'Vintage', ops: [{ op: 'sepia', v: 0.5 }, { op: 'contrast', v: 0.92 }, { op: 'brightness', v: 1.06 }, { op: 'saturate', v: 0.85 }] as Op[] },
} as const;
export type FilterId = keyof typeof FILTERS;

export function filterCss(id: FilterId): string {
  const ops = FILTERS[id]?.ops ?? [];
  return ops.length ? ops.map((o) => `${o.op}(${o.v})`).join(' ') : 'none';
}

// 3x3 colour matrices from the CSS Filter Effects spec.
function matrix(o: Op): number[] {
  const v = o.v;
  switch (o.op) {
    case 'grayscale': {
      const a = 1 - Math.min(1, v);
      return [0.2126 + 0.7874 * a, 0.7152 - 0.7152 * a, 0.0722 - 0.0722 * a, 0.2126 - 0.2126 * a, 0.7152 + 0.2848 * a, 0.0722 - 0.0722 * a, 0.2126 - 0.2126 * a, 0.7152 - 0.7152 * a, 0.0722 + 0.9278 * a];
    }
    case 'sepia': {
      const a = 1 - Math.min(1, v);
      return [0.393 + 0.607 * a, 0.769 - 0.769 * a, 0.189 - 0.189 * a, 0.349 - 0.349 * a, 0.686 + 0.314 * a, 0.168 - 0.168 * a, 0.272 - 0.272 * a, 0.534 - 0.534 * a, 0.131 + 0.869 * a];
    }
    case 'saturate':
      return [0.213 + 0.787 * v, 0.715 - 0.715 * v, 0.072 - 0.072 * v, 0.213 - 0.213 * v, 0.715 + 0.285 * v, 0.072 - 0.072 * v, 0.213 - 0.213 * v, 0.715 - 0.715 * v, 0.072 + 0.928 * v];
    default:
      return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  }
}

/** Applies a filter to RGBA pixels in place, matching the CSS rendering. */
export function applyFilter(data: Uint8ClampedArray, id: FilterId): void {
  const ops = FILTERS[id]?.ops ?? [];
  if (!ops.length) return;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    for (const o of ops) {
      if (o.op === 'contrast') {
        r = (r - 127.5) * o.v + 127.5; g = (g - 127.5) * o.v + 127.5; b = (b - 127.5) * o.v + 127.5;
      } else if (o.op === 'brightness') {
        r *= o.v; g *= o.v; b *= o.v;
      } else {
        const m = matrix(o);
        const nr = m[0]! * r + m[1]! * g + m[2]! * b;
        const ng = m[3]! * r + m[4]! * g + m[5]! * b;
        const nb = m[6]! * r + m[7]! * g + m[8]! * b;
        r = nr; g = ng; b = nb;
      }
      r = Math.min(255, Math.max(0, r)); g = Math.min(255, Math.max(0, g)); b = Math.min(255, Math.max(0, b));
    }
    data[i] = r; data[i + 1] = g; data[i + 2] = b;
  }
}

// ── Frames: SVG drawn for the photo's own size, decoration kept to the edges
// and sized from the shorter side, so portrait and landscape both work. ──

export const FRAMES = {
  none: { name: 'No frame' },
  hearts: { name: 'Hearts' },
  floral: { name: 'Floral' },
  polaroid: { name: 'Polaroid' },
  married: { name: 'Just Married' },
  gold: { name: 'Gold' },
} as const;
export type FrameId = keyof typeof FRAMES;

const heart = (x: number, y: number, s: number, fill: string) =>
  `<path transform="translate(${x} ${y}) scale(${s / 24})" d="M12 21s-7.5-4.6-10-9.3C.3 8.4 2.2 4 6.3 4c2.3 0 3.9 1.3 5.7 3.5C13.8 5.3 15.4 4 17.7 4 21.8 4 23.7 8.4 22 11.7 19.5 16.4 12 21 12 21z" fill="${fill}" stroke="#fff" stroke-width="1.2"/>`;

export function frameSvg(id: FrameId, w: number, h: number): string | null {
  const s = Math.min(w, h);
  const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
  switch (id) {
    case 'hearts': {
      const k = s * 0.07;
      const spots: [number, number, number, string][] = [
        [0.03, 0.03, 1, '#e11d48'], [0.1, 0.02, 0.6, '#f472b6'], [0.02, 0.11, 0.7, '#fb7185'],
        [0.97, 0.97, 1, '#e11d48'], [0.9, 0.98, 0.6, '#f472b6'], [0.98, 0.89, 0.7, '#fb7185'],
        [0.97, 0.03, 0.8, '#f472b6'], [0.03, 0.97, 0.8, '#fb7185'],
      ];
      return open + spots.map(([fx, fy, sc, c]) => heart(fx * w - (k * sc) / 2, fy * h - (k * sc) / 2, k * sc, c)).join('') + '</svg>';
    }
    case 'floral': {
      const r = s * 0.09;
      const flower = (cx: number, cy: number, c: string) =>
        [0, 72, 144, 216, 288].map((a) => `<ellipse cx="${cx}" cy="${cy - r * 0.45}" rx="${r * 0.28}" ry="${r * 0.45}" fill="${c}" transform="rotate(${a} ${cx} ${cy})" opacity="0.92"/>`).join('') +
        `<circle cx="${cx}" cy="${cy}" r="${r * 0.18}" fill="#fde68a"/>`;
      const leaf = (cx: number, cy: number, a: number) => `<ellipse cx="${cx}" cy="${cy}" rx="${r * 0.6}" ry="${r * 0.22}" fill="#65a30d" opacity="0.85" transform="rotate(${a} ${cx} ${cy})"/>`;
      return open +
        leaf(r * 1.4, r * 0.7, 20) + leaf(r * 0.7, r * 1.5, 70) + flower(r * 0.9, r * 0.9, '#f9a8d4') + flower(r * 2.0, r * 0.6, '#fbcfe8') +
        leaf(w - r * 1.4, h - r * 0.7, 20) + leaf(w - r * 0.7, h - r * 1.5, 70) + flower(w - r * 0.9, h - r * 0.9, '#f9a8d4') + flower(w - r * 2.0, h - r * 0.6, '#fbcfe8') +
        '</svg>';
    }
    case 'polaroid': {
      const side = s * 0.045;
      const bottom = s * 0.17;
      return open + `<path fill="#fffdf8" fill-rule="evenodd" d="M0 0H${w}V${h}H0Z M${side} ${side}V${h - bottom}H${w - side}V${side}Z"/></svg>`;
    }
    case 'married': {
      const band = s * 0.16;
      const fs = band * 0.55;
      return open +
        `<rect x="0" y="${h - band}" width="${w}" height="${band}" fill="#000" opacity="0.35"/>` +
        `<text x="${w / 2}" y="${h - band / 2 + fs * 0.35}" text-anchor="middle" font-family="'Snell Roundhand','Brush Script MT','Segoe Script',cursive" font-size="${fs}" fill="#fff">Just Married</text>` +
        heart(w / 2 - fs * 3.6, h - band / 2 - fs * 0.35, fs * 0.7, '#f43f5e') + heart(w / 2 + fs * 2.9, h - band / 2 - fs * 0.35, fs * 0.7, '#f43f5e') +
        '</svg>';
    }
    case 'gold': {
      const m = s * 0.03;
      const m2 = s * 0.045;
      const c = s * 0.06;
      const corner = (x: number, y: number, sx: number, sy: number) =>
        `<path d="M${x} ${y + sy * c}Q${x} ${y} ${x + sx * c} ${y}" stroke="#d4af37" stroke-width="${s * 0.008}" fill="none"/><circle cx="${x + sx * c * 0.35}" cy="${y + sy * c * 0.35}" r="${s * 0.008}" fill="#d4af37"/>`;
      return open +
        `<rect x="${m}" y="${m}" width="${w - 2 * m}" height="${h - 2 * m}" fill="none" stroke="#d4af37" stroke-width="${s * 0.012}"/>` +
        `<rect x="${m2}" y="${m2}" width="${w - 2 * m2}" height="${h - 2 * m2}" fill="none" stroke="#f5e7a1" stroke-width="${s * 0.004}"/>` +
        corner(m2, m2, 1, 1) + corner(w - m2, m2, -1, 1) + corner(m2, h - m2, 1, -1) + corner(w - m2, h - m2, -1, -1) +
        '</svg>';
    }
    default:
      return null;
  }
}

/** Where the caption goes, and in what colour, for a frame. */
export function captionStyle(id: FrameId, w: number, h: number): { x: number; y: number; size: number; color: string; band: boolean } {
  const s = Math.min(w, h);
  if (id === 'polaroid') return { x: w / 2, y: h - s * 0.075, size: s * 0.055, color: '#292524', band: false };
  if (id === 'married') return { x: w / 2, y: h - s * 0.2, size: s * 0.05, color: '#ffffff', band: false };
  return { x: w / 2, y: h - s * 0.06, size: s * 0.05, color: '#ffffff', band: true };
}

/** Validates a manifest from a client. Returns a clean copy, or null. */
export function cleanOverlay(raw: unknown): Overlay | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const frame = String(o.frame ?? 'none') as FrameId;
  const filter = String(o.filter ?? 'none') as FilterId;
  if (!(frame in FRAMES) || !(filter in FILTERS)) return null;
  const caption = typeof o.caption === 'string' ? o.caption.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  return { v: 1, frame, filter, ...(caption ? { caption } : {}) };
}

export function isPlain(o: Overlay | null): boolean {
  return !o || (o.frame === 'none' && o.filter === 'none' && !o.caption);
}
