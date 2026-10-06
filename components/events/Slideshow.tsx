'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  SLIDE_DEFAULTS, SLIDE_OPTIONS, advance, cleanSettings, mergeOrder, playOrder,
  type SlideSettings,
} from '@/lib/events/slideshow';
import { Icon, PILL, Sheet } from './ActionBar';

/** A photo for the slideshow: its gallery copy. */
export interface Slide { id: string; src: string }

const KEY = 'i2w2i.slideshow';
/** How often a running slideshow looks for newly approved photos. */
const REFRESH_MS = 30_000;
const FADE_MS = 1000;

function loadSettings(): SlideSettings {
  try {
    return cleanSettings(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return SLIDE_DEFAULTS;
  }
}

function saveSettings(s: SlideSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: just this time */ }
}

/** Ready to show at once (decoded), or given up on after a while so the show never stalls. */
function preload(src: string | undefined): Promise<void> {
  if (!src) return Promise.resolve();
  const img = new Image();
  img.src = src;
  return Promise.race([img.decode().catch(() => {}), new Promise<void>((r) => setTimeout(r, 8000))]);
}

/**
 * “Slideshow” for an album: pick how it plays, then the photos fill the
 * screen. A tap anywhere or Esc goes back to the album. Only photos everyone
 * may see belong in `slides` (approved, not hidden): it's for the big screen.
 */
export function Slideshow({ slides, title }: { slides: Slide[]; title: string }) {
  const [asking, setAsking] = useState(false);
  const [playing, setPlaying] = useState<SlideSettings | null>(null);
  const [settings, setSettings] = useState<SlideSettings>(SLIDE_DEFAULTS);
  useEffect(() => setSettings(loadSettings()), []);
  if (!slides.length) return null;

  function start() {
    saveSettings(settings);
    setAsking(false);
    // Asked for in the tap itself, which browsers require. Phones without it
    // (iPhone) get the whole window instead.
    const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
    else root.webkitRequestFullscreen?.();
    setPlaying(settings);
  }

  return (
    <>
      <button type="button" className={PILL} onClick={() => setAsking(true)}>
        <Icon name="play" />
        Slideshow
      </button>
      <Sheet title="Slideshow" icon="play" open={asking} onClose={() => setAsking(false)}>
        <div className="space-y-4">
          <p className="text-stone-600">{title}: {slides.length} {slides.length === 1 ? 'photo' : 'photos'}, full screen (videos are skipped). Photos approved while it plays join in.</p>
          <Choice legend="Change every" name="every" options={SLIDE_OPTIONS.every} value={settings.every} onChange={(every) => setSettings({ ...settings, every })} />
          <Choice legend="Order" name="order" options={SLIDE_OPTIONS.order} value={settings.order} onChange={(order) => setSettings({ ...settings, order })} />
          <Choice legend="Between photos" name="transition" options={SLIDE_OPTIONS.transition} value={settings.transition} onChange={(transition) => setSettings({ ...settings, transition })} />
          <Choice legend="Border" name="border" options={SLIDE_OPTIONS.border} value={settings.border} onChange={(border) => setSettings({ ...settings, border })} />
          <button type="button" className="btn w-full py-3 text-lg" onClick={start}>Start slideshow</button>
          <p className="text-center text-sm text-stone-500">To stop, tap the screen or press Esc.</p>
        </div>
      </Sheet>
      {playing && createPortal(<Player slides={slides} settings={playing} onDone={() => setPlaying(null)} />, document.body)}
    </>
  );
}

function Choice<V extends string | number>({ legend, name, options, value, onChange }: {
  legend: string; name: string; options: readonly (readonly [V, string])[]; value: V; onChange: (v: V) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, label]) => (
          <label key={String(v)} className="cursor-pointer">
            <input type="radio" className="peer sr-only" name={name} value={String(v)} checked={v === value} onChange={() => onChange(v)} />
            <span className="inline-block rounded-full border border-stone-300 bg-white px-3.5 py-1.5 text-stone-700 peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40">{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Player({ slides, settings, onDone }: { slides: Slide[]; settings: SlideSettings; onDone: () => void }) {
  const router = useRouter();
  const ids = slides.map((s) => s.id);
  const [list, setList] = useState(() => playOrder(ids, settings.order));
  const [current, setCurrent] = useState<string | null>(() => list[0] ?? null);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [hint, setHint] = useState(true);
  const byId = new Map(slides.map((s) => [s.id, s]));

  // The timer reads these, so a refresh doesn't restart the count.
  const live = useRef({ list, current, byId });
  live.current = { list, current, byId };

  const exiting = useRef(false);
  function exit() {
    if (exiting.current) return;
    exiting.current = true;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    onDone();
  }

  function go(step: 1 | -1) {
    const { list: l, current: at } = live.current;
    const { list: nextList, next } = advance(l, at, settings.order, step);
    if (!next || next === at) return;
    if (nextList.join() !== l.join()) setList(nextList);
    setLeaving(settings.transition === 'fade' ? at : null);
    setCurrent(next);
  }

  // The album changed (new photos approved, some hidden): play what's there now.
  const key = ids.join();
  useEffect(() => {
    setList((l) => mergeOrder(l, key ? key.split(',') : [], settings.order, live.current.current));
  }, [key, settings.order]);
  useEffect(() => {
    if (current !== null && !list.includes(current)) go(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  // Next photo every few seconds, once it's ready; the one after is fetched meanwhile.
  useEffect(() => {
    if (list.length < 2) return;
    let stop = false;
    const upcoming = advance(list, current, settings.order).next;
    void preload(upcoming ? byId.get(upcoming)?.src : undefined);
    const t = setTimeout(async () => {
      const { list: l, current: at, byId: m } = live.current;
      await preload(m.get(advance(l, at, settings.order).next ?? '')?.src);
      if (!stop) go(1);
    }, settings.every * 1000);
    return () => { stop = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, list.length > 1, settings.every]);

  // Newly approved photos join in.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(t);
  }, [router]);

  // Esc, or leaving full screen any other way, ends it; arrows step through.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exit();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    let wasFull = Boolean(document.fullscreenElement);
    const onFull = () => {
      if (document.fullscreenElement) wasFull = true;
      else if (wasFull) exit();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFull);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('fullscreenchange', onFull); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the screen on, and the page still, while it plays.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let ended = false;
    const keepAwake = () => {
      navigator.wakeLock?.request('screen').then((l) => {
        // Granted after it already closed: let go straight away.
        if (ended) l.release().catch(() => {});
        else lock = l;
      }, () => {});
    };
    const onVisible = () => { if (document.visibilityState === 'visible') keepAwake(); };
    keepAwake();
    document.addEventListener('visibilitychange', onVisible);
    // On <body>: the sheet that started it unlocks <html> as it closes.
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => setHint(false), 3000);
    return () => {
      ended = true;
      clearTimeout(t);
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
      document.body.style.overflow = '';
    };
  }, []);

  const shown = current ? byId.get(current) : undefined;
  const gone = leaving && leaving !== current ? byId.get(leaving) : undefined;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Slideshow"
      data-slides={list.length}
      data-border={settings.border}
      data-transition={settings.transition}
      className="fixed inset-0 z-[100] cursor-none select-none overflow-hidden"
      style={{ backgroundColor: '#000' }}
      onClick={exit}
    >
      {gone && <Frame key={`out-${gone.id}`} slide={gone} border={settings.border} />}
      {shown && (
        <Frame
          key={shown.id}
          slide={shown}
          border={settings.border}
          current
          fade={settings.transition === 'fade' && Boolean(gone)}
          onShown={() => setLeaving(null)}
        />
      )}
      <p
        className="pointer-events-none absolute inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] flex justify-center transition-opacity duration-1000"
        style={{ opacity: hint ? 1 : 0 }}
      >
        <span className="rounded-full px-4 py-1.5 text-sm" style={{ backgroundColor: 'rgb(0 0 0 / 0.7)', color: '#fff' }}>Tap the screen or press Esc to go back</span>
      </p>
    </div>
  );
}

const BORDERS = {
  none: { pad: '0', room: '0px' },
  thin: { pad: '0.6vmin', room: '6vmin' },
  wide: { pad: '2.6vmin', room: '14vmin' },
} as const;

function Frame({ slide, border, current = false, fade = false, onShown }: {
  slide: Slide; border: SlideSettings['border']; current?: boolean; fade?: boolean; onShown?: () => void;
}) {
  const b = BORDERS[border];
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={fade ? { animation: `slide-in ${FADE_MS}ms ease-in-out both` } : undefined}
      onAnimationEnd={onShown}
    >
      <div style={border === 'none' ? undefined : { backgroundColor: '#fff', padding: b.pad, boxShadow: '0 1vmin 4vmin rgb(0 0 0 / 0.6)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={slide.src}
          alt=""
          data-current={current ? '' : undefined}
          className="block object-contain"
          style={{ maxWidth: `calc(100vw - ${b.room})`, maxHeight: `calc(100dvh - ${b.room})` }}
          draggable={false}
        />
      </div>
    </div>
  );
}
