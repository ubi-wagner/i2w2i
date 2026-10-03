import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/latin-600.css';
import '@fontsource/cormorant-garamond/latin-500-italic.css';
import '@fontsource/pinyon-script/latin-400.css';
import { dottedDate, splitNames, type ThemeId } from '@/lib/events/themes';

// An event's pages dressed in its theme: colours come from [data-theme] in
// globals.css; the drawings here are plain SVG (no images to load).

const GREENS = ['#4f7a4a', '#6d9a5c', '#3f6a45', '#86a96b'];

/** A fern frond growing up from (0,0), leaflets shrinking toward the tip. */
function Fern({ x, y, length, angle, bend = 0.25, color }: { x: number; y: number; length: number; angle: number; bend?: number; color: string }) {
  const n = 14;
  const pt = (t: number) => [bend * length * t * t, -length * t] as const;
  const [ex, ey] = pt(1);
  const leaves = Array.from({ length: n }, (_, i) => {
    const t = 0.12 + (i / n) * 0.86;
    const [px, py] = pt(t);
    const size = length * 0.16 * Math.pow(1 - t, 0.6) + 2;
    const side = i % 2 ? 1 : -1;
    const slope = (Math.atan2(-length, 2 * bend * length * t) * 180) / Math.PI; // stem direction
    return { px, py, size, rot: slope + side * 62 + 90 };
  });
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <path d={`M0 0 Q ${bend * length * 0.5} ${-length * 0.5} ${ex} ${ey}`} stroke={color} strokeWidth="1.4" fill="none" />
      {leaves.map((l, i) => (
        <ellipse key={i} cx={l.px} cy={l.py} rx={l.size} ry={l.size * 0.32} fill={color} transform={`rotate(${l.rot} ${l.px} ${l.py}) translate(${l.size * 0.9} 0)`} />
      ))}
    </g>
  );
}

function Mushroom({ x, y, h, cap = '#b8572f' }: { x: number; y: number; h: number; cap?: string }) {
  const w = h * 0.95;
  const top = y - h * 0.78;
  return (
    <g>
      <path d={`M${x - h * 0.1} ${y} Q${x - h * 0.13} ${top + h * 0.3} ${x - h * 0.07} ${top} L${x + h * 0.07} ${top} Q${x + h * 0.13} ${top + h * 0.3} ${x + h * 0.1} ${y} Z`} fill="#efe1c4" />
      <path d={`M${x - w / 2} ${top + 2} Q${x} ${top - h * 0.55} ${x + w / 2} ${top + 2} Q${x} ${top + h * 0.1} ${x - w / 2} ${top + 2} Z`} fill={cap} />
      <ellipse cx={x} cy={top + 2} rx={w * 0.42} ry={h * 0.05} fill="#e9c995" opacity="0.8" />
      <circle cx={x - w * 0.18} cy={top - h * 0.17} r={h * 0.04} fill="#f6e7c9" />
      <circle cx={x + w * 0.12} cy={top - h * 0.24} r={h * 0.03} fill="#f6e7c9" />
      <circle cx={x + w * 0.27} cy={top - h * 0.08} r={h * 0.025} fill="#f6e7c9" />
    </g>
  );
}

function Flower({ x, y, r = 3.2, color = '#8f93d8' }: { x: number; y: number; r?: number; color?: string }) {
  return (
    <g>
      {[0, 72, 144, 216, 288].map((a) => (
        <circle key={a} cx={x + Math.cos((a * Math.PI) / 180) * r} cy={y + Math.sin((a * Math.PI) / 180) * r} r={r * 0.85} fill={color} />
      ))}
      <circle cx={x} cy={y} r={r * 0.55} fill="#f2d572" />
    </g>
  );
}

/** Ferns, flowers and mushrooms rising from the bottom-left of a 260×260 box. */
function Sprig({ mushrooms = true }: { mushrooms?: boolean }) {
  return (
    <svg viewBox="-40 0 260 260" className="h-full w-full" aria-hidden="true">
      <Fern x={30} y={258} length={230} angle={8} bend={0.22} color={GREENS[0]!} />
      <Fern x={20} y={258} length={170} angle={-14} bend={-0.2} color={GREENS[2]!} />
      <Fern x={55} y={258} length={150} angle={34} bend={0.3} color={GREENS[1]!} />
      <Fern x={10} y={258} length={120} angle={-32} bend={-0.15} color={GREENS[3]!} />
      <Flower x={70} y={120} /> <Flower x={46} y={150} r={2.6} /> <Flower x={88} y={168} r={2.8} /> <Flower x={24} y={98} r={2.4} />
      {mushrooms && (
        <>
          <Mushroom x={92} y={258} h={58} />
          <Mushroom x={128} y={258} h={38} cap="#cf7a3c" />
          <Mushroom x={62} y={258} h={30} cap="#a6492a" />
        </>
      )}
    </svg>
  );
}

function Moon() {
  return (
    <svg viewBox="-12 -12 24 24" className="mx-auto h-8 w-8" aria-hidden="true">
      <path d="M2 -10 A10 10 0 1 0 2 10 A8 10 0 1 1 2 -10 Z" fill="#e7c97f" transform="rotate(-25)" />
    </svg>
  );
}

// Fixed positions (no randomness, so server and browser agree).
const FIREFLIES = [
  [8, 12, 0], [22, 30, 2.1], [85, 9, 1.2], [92, 26, 3.3], [70, 18, 4.1], [15, 48, 1.7], [88, 52, 0.6],
  [35, 6, 2.8], [60, 40, 5.2], [5, 75, 3.9], [95, 80, 2.4], [50, 64, 4.6], [28, 88, 1.1], [75, 92, 3.0],
] as const;

export function ThemeFrame({ theme, children }: { theme: ThemeId; children: React.ReactNode }) {
  if (theme === 'classic') return <>{children}</>;
  return (
    <div data-theme={theme} className="theme-bg relative min-h-dvh overflow-hidden text-stone-900">
      {theme === 'woodland' && (
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {FIREFLIES.map(([left, top, delay], i) => (
            <span key={i} className="firefly" style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${delay}s` }} />
          ))}
        </div>
      )}
      <div className="relative">{children}</div>
      {theme === 'woodland' && (
        <div className="pointer-events-none relative mx-auto -mt-4 flex h-40 max-w-5xl justify-between" aria-hidden="true">
          <div className="h-full w-36 sm:w-44"><Sprig /></div>
          <div className="h-full w-36 -scale-x-100 sm:w-44"><Sprig /></div>
        </div>
      )}
    </div>
  );
}

function longDate(d: Date) {
  return d.toLocaleDateString(undefined, { timeZone: 'UTC', dateStyle: 'long' });
}

/** The event's name, date and place, set like its invitation. */
export function EventHero({ theme, title, startsOn, location }: { theme: ThemeId; title: string; startsOn: Date | null; location: string }) {
  const names = splitNames(title);
  if (theme === 'classic') {
    return (
      <header className="space-y-1 text-center">
        <p className="text-sm uppercase tracking-widest text-brand">{startsOn ? longDate(startsOn) : 'Album'}</p>
        <h1 className="font-serif text-3xl sm:text-4xl">{title}</h1>
        {location && <p className="text-stone-600">{location}</p>}
      </header>
    );
  }

  if (theme === 'garden') {
    return (
      <header className="relative space-y-3 pt-4 text-center">
        <div className="mx-auto h-28 w-24"><Sprig mushrooms={false} /></div>
        <h1 className="font-script text-5xl leading-tight text-stone-800 sm:text-6xl">
          {names ? <>{names.before} <span className="text-brand">{names.joiner}</span> {names.after}</> : title}
        </h1>
        {startsOn && <p className="font-display text-lg uppercase tracking-[0.3em] text-stone-600">{longDate(startsOn)}</p>}
        {location && <p className="font-display text-sm uppercase tracking-[0.25em] text-stone-500">{location}</p>}
      </header>
    );
  }

  // woodland
  return (
    <header className="relative px-2 pt-2 text-center">
      <div className="pointer-events-none absolute -left-12 -top-6 h-44 w-36 rotate-180 -scale-x-100 opacity-70 sm:-left-4" aria-hidden="true"><Sprig mushrooms={false} /></div>
      <div className="pointer-events-none absolute -right-12 -top-6 h-44 w-36 rotate-180 opacity-70 sm:-right-4" aria-hidden="true"><Sprig mushrooms={false} /></div>
      <div className="relative space-y-3">
        <Moon />
        <h1 className="font-display text-4xl font-medium uppercase leading-tight tracking-[0.12em] text-stone-900 sm:text-5xl">
          {names ? (
            <>
              <span className="block">{names.before}</span>
              <span className="block font-script text-5xl normal-case leading-none tracking-normal text-brand sm:text-6xl">{names.joiner}</span>
              <span className="block">{names.after}</span>
            </>
          ) : (
            title
          )}
        </h1>
        {startsOn && <p className="font-display text-3xl tracking-[0.2em] text-brand">{dottedDate(startsOn)}</p>}
        {location && <p className="font-display text-sm font-semibold uppercase tracking-[0.3em] text-stone-700">{location}</p>}
      </div>
    </header>
  );
}
