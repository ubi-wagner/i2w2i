'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/client/api';
import { loadIdeas } from '@/lib/client/ideas';
import { newId, type RateSection } from '@/lib/menu';
import { ABOUT, cleanProfile, emptyProfile, lovedByAll, matches, ratedCount, rateSections, rateSectionsToText, SCALE, SCORES, textToRateSections, type Match, type Profile, type Score } from '@/lib/profile';
import { usePod } from './Pod';
import { Collapsible, ErrorText, Section, Sheet, Spinner } from './ui';

interface Row { account_id: string; body_enc: string; rev: number; updated_at: string }
export interface Loaded { profile: Profile; rev: number; /** Saved, but this phone couldn't open it: never overwrite it from here. */ broken?: boolean }

/** Each member's profile, decrypted on this phone (bound to whose it is, so rows can't be swapped). */
export function useProfiles(): {
  profiles: Record<string, Loaded> | null;
  reload: () => Promise<Record<string, Loaded> | null>;
  /** Changes your own profile and saves it (on top of a newer copy if another phone saved first). */
  update: (fn: (p: Profile) => void) => Promise<void>;
  error: string;
} {
  const pod = usePod();
  const [profiles, setProfiles] = useState<Record<string, Loaded> | null>(null);
  const [error, setError] = useState('');
  // The pod's functions change on every render; only another pod means loading again.
  const podRef = useRef(pod);
  podRef.current = pod;
  const latest = useRef<Record<string, Loaded> | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const podId = pod.pod.id;
  const reload = useCallback(async () => {
    try {
      const r = await api<{ profiles: Row[] }>(`/api/pods/${podId}/profiles`);
      const out: Record<string, Loaded> = {};
      for (const row of r.profiles) {
        const body = await podRef.current.open(row.body_enc, `profile:${podId}:${row.account_id}`).catch(() => null);
        out[row.account_id] = { rev: row.rev, profile: cleanProfile(body), ...(body === null ? { broken: true } : {}) };
      }
      latest.current = out;
      setProfiles(out);
      setError('');
      return out;
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  }, [podId]);
  useEffect(() => { void reload(); }, [reload]);

  const update = useCallback((fn: (p: Profile) => void) => {
    // One save at a time, each on top of the last.
    const run = queue.current.catch(() => {}).then(async () => {
      const me = podRef.current.account.id;
      for (let attempt = 0; ; attempt++) {
        const cur = latest.current?.[me];
        if (cur?.broken) throw new Error('Your saved profile couldn’t be opened on this phone, so it isn’t changed from here.');
        const next = structuredClone(cur?.profile ?? emptyProfile());
        fn(next);
        try {
          const r = await api<{ rev: number }>(`/api/pods/${podId}/profiles`, {
            method: 'PUT', body: { bodyEnc: await podRef.current.seal(next, `profile:${podId}:${me}`), rev: cur?.rev ?? 0 },
          });
          latest.current = { ...(latest.current ?? {}), [me]: { profile: next, rev: r.rev } };
          setProfiles(latest.current);
          return;
        } catch (err) {
          if (!(err instanceof ApiError && err.status === 409) || attempt) throw err;
          await reload();
        }
      }
    });
    queue.current = run;
    return run;
  }, [podId, reload]);
  return { profiles, reload, update, error };
}

/** The things to rate: the built-in list (from the server, pod members only) and the pod's own. */
function useRateSections(): RateSection[] | null {
  const pod = usePod();
  const [builtIn, setBuiltIn] = useState<RateSection[] | null>(null);
  useEffect(() => { void loadIdeas().then((i) => setBuiltIn(i.inventory)).catch(() => setBuiltIn([])); }, []);
  return useMemo(() => (builtIn ? rateSections(builtIn, pod.menu.inventory, pod.menu.builtInInventory) : null), [builtIn, pod.menu.inventory, pod.menu.builtInInventory]);
}

/**
 * Profiles: each of you fills in your own (notes in your own words, and how
 * much you like each thing, giving and receiving); you can read each
 * other's; and Together shows where you meet.
 */
export function Profiles() {
  const pod = usePod();
  const { profiles, reload, error } = useProfiles();
  const sections = useRateSections();
  const partner = pod.members.find((m) => m.account_id !== pod.account.id);
  const [tab, setTab] = useState<'me' | 'them' | 'us'>('me');
  // Your own, as you edit it (saved a moment later).
  const [live, setLive] = useState<Profile | null>(null);
  const fetchMine = useCallback(async () => (await reload())?.[pod.account.id], [reload, pod.account.id]);
  if (!profiles || !sections) return error ? <ErrorText>{error}</ErrorText> : <Spinner />;
  const mine = profiles[pod.account.id];
  const theirs = partner ? profiles[partner.account_id] : undefined;
  const them = partner ? pod.nameOf(partner.account_id) : 'Your partner';

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <p className="eyebrow text-follow">Likes, limits and notes</p>
        <h1 className="font-display text-3xl text-lead-dark">Us</h1>
        <p className="text-sm text-ink-soft">Each of you fills in your own. {them} can read yours, and you theirs; nobody else can, not even the server.</p>
      </header>
      <div className="grid grid-cols-3 gap-2" role="tablist">
        {([['me', 'Me'], ['them', them], ['us', 'Together']] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className="chip justify-center truncate" aria-pressed={tab === k} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {/* Kept mounted while another tab shows, so an edit is never cut off before it saves. */}
      <div hidden={tab !== 'me'}>
        <MyProfile initial={mine} sections={sections} onChange={setLive} fetchMine={fetchMine} />
      </div>
      {tab === 'them' && (theirs ? <TheirProfile name={them} profile={theirs.profile} sections={sections} /> : <p className="card text-ink-soft">{them} hasn’t filled in their profile yet.</p>)}
      {tab === 'us' && <Together name={them} mine={live ?? mine?.profile} theirs={theirs?.profile} sections={sections} />}
    </div>
  );
}

function MyProfile({ initial, sections, onChange, fetchMine }: { initial?: Loaded; sections: RateSection[]; onChange: (p: Profile) => void; fetchMine: () => Promise<Loaded | undefined> }) {
  const pod = usePod();
  const [p, setP] = useState<Profile>(initial?.profile ?? emptyProfile());
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [unrated, setUnrated] = useState(false);
  const rev = useRef(initial?.rev ?? 0);
  const [retry, setRetry] = useState(0);
  const edits = useRef(0);
  const saving = useRef<Promise<void> | null>(null);
  const latest = useRef(p);
  latest.current = p;

  const save = useCallback(async () => {
    while (saving.current) await saving.current;
    const upTo = edits.current;
    if (!upTo) return;
    const run = (async () => {
      setStatus('saving');
      try {
        const r = await api<{ rev: number }>(`/api/pods/${pod.pod.id}/profiles`, { method: 'PUT', body: { bodyEnc: await pod.seal(latest.current, `profile:${pod.pod.id}:${pod.account.id}`), rev: rev.current } });
        rev.current = r.rev;
        if (edits.current === upTo) { edits.current = 0; setStatus('saved'); }
      } catch (err) {
        setStatus('error');
        if (err instanceof ApiError && err.status === 409) {
          // Saved from elsewhere too (loves and dislikes, another phone): keep theirs, put your notes and ratings on top.
          const fresh = await fetchMine().catch(() => undefined);
          if (fresh && !fresh.broken) {
            rev.current = fresh.rev;
            setP((x) => ({ ...fresh.profile, about: x.about, ratings: x.ratings }));
            edits.current += 1;
            setError('');
            return;
          }
        }
        setError(`Not saved: ${(err as Error).message} Trying again…`);
        setTimeout(() => setRetry((n) => n + 1), 4000);
      }
    })();
    saving.current = run;
    await run;
    saving.current = null;
  }, [pod, fetchMine]);

  useEffect(() => { onChange(p); }, [p, onChange]);

  useEffect(() => {
    if (!edits.current) return;
    const t = setTimeout(() => void save(), 700);
    return () => clearTimeout(t);
  }, [p, save, retry]);

  // Leaving the page or the app: save now rather than lose the last tap.
  useEffect(() => {
    const flush = () => { if (edits.current) void save(); };
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [save]);

  const edit = (fn: (x: Profile) => void) => {
    if (initial?.broken) return;
    setP((x) => { const c = structuredClone(x); fn(c); return c; });
    edits.current += 1;
    setStatus('idle');
    setError('');
  };
  const rate = (id: string, way: 'give' | 'recv', n: Score) => edit((x) => {
    const r = { ...(x.ratings[id] ?? {}) };
    if (r[way] === n) delete r[way];
    else r[way] = n;
    if (r.give === undefined && r.recv === undefined) delete x.ratings[id];
    else x.ratings[id] = r;
  });
  const total = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className="space-y-5">
      {initial?.broken && <p className="card border-stop/40 text-sm text-stop">Your saved profile couldn’t be opened on this phone, so editing is off here (nothing is overwritten). Try your other phone, or unlock this one again.</p>}
      <p className="text-sm text-ink-soft" role="status">{status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : status === 'error' ? 'Not saved' : 'Changes save themselves'}</p>
      <ErrorText>{error}</ErrorText>
      <Section title="About me" eyebrow="In my words">
        <div className="card space-y-3">
          {ABOUT.map((a) => (
            <div key={a.key}>
              <label className="label" htmlFor={`about-${a.key}`}>{a.label}</label>
              <textarea id={`about-${a.key}`} className="input" rows={2} maxLength={2000} value={p.about[a.key]} onChange={(e) => edit((x) => { x.about[a.key] = e.target.value; })} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="What I like" eyebrow="Giving and getting" action={<span className="text-sm text-ink-soft">{ratedCount(sections, p)} of {total}</span>}>
        <div className="card space-y-2 text-sm">
          <p>{SCORES.map((n) => `${n} ${SCALE[n]}`).join(' · ')}</p>
          <p className="text-ink-soft">“Give” is doing it to {pod.members.length > 1 ? 'them' : 'your partner'}; “Get” is having it done to you. Tap a number again to clear it.</p>
          <button type="button" className="chip" aria-pressed={unrated} onClick={() => setUnrated(!unrated)}>Only what I haven’t rated</button>
        </div>
        {sections.map((s) => {
          const items = unrated ? s.items.filter((i) => !p.ratings[i.id]) : s.items;
          const done = s.items.filter((i) => p.ratings[i.id]).length;
          return (
            <Collapsible key={s.id} id={s.id} title={s.title} open={open} setOpen={setOpen} summary={`${done}/${s.items.length}`}>
              {!items.length && <p className="text-sm text-ink-soft">All rated.</p>}
              {items.map((i) => (
                <div key={i.id} className="space-y-1.5 border-b border-line pb-3 last:border-0 last:pb-0">
                  <p className="font-medium">{i.label}</p>
                  {(['give', 'recv'] as const).map((way) => (
                    <div key={way} className="flex items-center gap-1.5" role="radiogroup" aria-label={`${i.label}: ${way === 'give' ? 'give' : 'get'}`}>
                      <span className="w-9 shrink-0 text-xs text-ink-soft">{way === 'give' ? 'Give' : 'Get'}</span>
                      {SCORES.map((n) => (
                        <button key={n} type="button" role="radio" aria-checked={p.ratings[i.id]?.[way] === n} aria-pressed={p.ratings[i.id]?.[way] === n} title={SCALE[n]}
                          className={`chip h-9 w-9 justify-center px-0 ${n === 0 && p.ratings[i.id]?.[way] === 0 ? 'border-stop bg-stop-light text-stop' : ''}`} onClick={() => rate(i.id, way, n)}>{n}</button>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </Collapsible>
          );
        })}
      </Section>
      <OurList />
    </div>
  );
}

/** The pod's own things to rate (saved with the menu), and whether to use the built-in list too. */
function OurList() {
  const pod = usePod();
  const [label, setLabel] = useState('');
  const [asText, setAsText] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const own = pod.menu.inventory;
  const count = own.reduce((n, s) => n + s.items.length, 0);

  async function saveList(inventory: RateSection[], builtInInventory = pod.menu.builtInInventory, done = 'Saved.') {
    setError('');
    try {
      await pod.saveMenu((m) => ({ ...m, inventory, builtInInventory }));
      setMsg(done);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  async function add() {
    const l = label.trim();
    if (!l) return;
    const ours = own.find((s) => s.title === 'Ours');
    const next = ours
      ? own.map((s) => (s === ours ? { ...s, items: [...s.items, { id: newId(), label: l }] } : s))
      : [...own, { id: newId(), title: 'Ours', items: [{ id: newId(), label: l }] }];
    await saveList(next, undefined, `Added “${l}”.`);
    setLabel('');
  }
  async function importFile(file: File) {
    const { sections, warnings } = textToRateSections(`${rateSectionsToText(own)}\n${await file.text()}`, own);
    const added = sections.reduce((n, s) => n + s.items.length, 0) - count;
    if (added <= 0) return setError(warnings[0] ?? 'Nothing new in that file. Write it as “## Section” and “- Something to rate”.');
    if (!confirm(`Add ${added} things to rate from “${file.name}”?${warnings.length ? ` (${warnings.length} lines not understood are left out.)` : ''}`)) return;
    await saveList(sections, undefined, `Added ${added}.`);
  }

  return (
    <Section title="Our own list" eyebrow="Add to it" action={<span className="text-sm text-ink-soft">{count}</span>}>
      <div className="card space-y-3">
        <p className="text-sm text-ink-soft">Things to rate that aren’t in the built-in list. Both of you see them.</p>
        <div className="flex gap-2">
          <input className="input" aria-label="Something to rate" placeholder="Something to rate" value={label} maxLength={160} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add(); }} />
          <button type="button" className="btn shrink-0" disabled={!label.trim()} onClick={add}>Add</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-quiet" onClick={() => { setText(rateSectionsToText(own)); setAsText(true); }}>Edit as text</button>
          <label className="btn-quiet cursor-pointer">
            Import a list
            <input type="file" accept=".txt,.md,text/plain,text/markdown" className="sr-only" aria-label="Import a list" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f); }} />
          </label>
          <button type="button" className="chip" aria-pressed={pod.menu.builtInInventory} onClick={() => saveList(own, !pod.menu.builtInInventory)}>Include the built-in list</button>
        </div>
        <ErrorText>{error}</ErrorText>
        {msg && <p className="text-sm text-ok" role="status">{msg}</p>}
      </div>
      <Sheet open={asText} onClose={() => setAsText(false)} title="Our list as text" wide>
        {asText && (() => {
          const parsed = textToRateSections(text, own);
          return (
            <div className="space-y-3">
              <textarea className="input min-h-[50dvh] font-mono text-base sm:text-[13px]" aria-label="Our list as text" value={text} spellCheck={false} onChange={(e) => setText(e.target.value)} />
              <p className="text-sm text-ink-soft" role="status">{parsed.sections.reduce((n, s) => n + s.items.length, 0)} things in {parsed.sections.length} {parsed.sections.length === 1 ? 'section' : 'sections'}</p>
              {parsed.warnings.length > 0 && <ul className="list-disc pl-5 text-sm text-warn">{parsed.warnings.slice(0, 6).map((w) => <li key={w}>{w}</li>)}</ul>}
              <button type="button" className="btn w-full" onClick={async () => { await saveList(parsed.sections); setAsText(false); }}>Use this</button>
            </div>
          );
        })()}
      </Sheet>
    </Section>
  );
}

function scoreText(n: Score | undefined): string {
  return n === undefined ? '–' : `${n} ${SCALE[n]}`;
}

function TheirProfile({ name, profile, sections }: { name: string; profile: Profile; sections: RateSection[] }) {
  const about = ABOUT.filter((a) => profile.about[a.key]);
  const words = about.filter((a) => a.key !== 'hard' && a.key !== 'signals'); // the limits are shown first, above
  const rated = ratedCount(sections, profile);
  return (
    <div className="space-y-5">
      {(profile.about.hard || profile.about.signals) && (
        <section className="card space-y-2 border-stop/40 bg-stop-light" aria-label="Limits">
          {profile.about.hard && <div><p className="eyebrow text-stop">Hard limits</p><p className="whitespace-pre-wrap">{profile.about.hard}</p></div>}
          {profile.about.signals && <div><p className="eyebrow text-stop">Safeword and signals</p><p className="whitespace-pre-wrap">{profile.about.signals}</p></div>}
        </section>
      )}
      <Section title={`About ${name}`} eyebrow="In their words">
        <div className="card space-y-3">
          {words.length ? words.map((a) => (
            <div key={a.key}><p className="eyebrow text-follow">{a.label}</p><p className="whitespace-pre-wrap">{profile.about[a.key]}</p></div>
          )) : <p className="text-sm text-ink-soft">{about.length ? `Nothing else written yet.` : `${name} hasn’t written anything yet.`}</p>}
        </div>
      </Section>
      <Section title="What they like" eyebrow={`${rated} rated`}>
        {!rated && <p className="card text-sm text-ink-soft">{name} hasn’t rated anything yet.</p>}
        {sections.map((s) => {
          const rated = s.items.filter((i) => profile.ratings[i.id]);
          if (!rated.length) return null;
          return (
            <div key={s.id} className="card space-y-2">
              <p className="eyebrow text-follow">{s.title}</p>
              {rated.map((i) => (
                <div key={i.id} className="border-b border-line pb-2 last:border-0 last:pb-0">
                  <p className="font-medium">{i.label}</p>
                  <p className="text-sm text-ink-soft">Give: {scoreText(profile.ratings[i.id]!.give)} · Get: {scoreText(profile.ratings[i.id]!.recv)}</p>
                </div>
              ))}
            </div>
          );
        })}
      </Section>
    </div>
  );
}

function Together({ name, mine, theirs, sections }: { name: string; mine?: Profile; theirs?: Profile; sections: RateSection[] }) {
  const pod = usePod();
  const [showNo, setShowNo] = useState(false);
  if (!mine || !theirs) return <p className="card text-ink-soft">This fills in once you’ve both rated some things.</p>;
  const m = matches(sections, mine, theirs);
  const loved = lovedByAll(pod.menu.roleplays, [mine, theirs]);
  const row = (x: Match) => (
    <li key={`${x.id}-${x.way}`} className="border-b border-line py-2 last:border-0">
      <p className="font-medium">{x.label}</p>
      <p className="text-sm text-ink-soft">{x.way === 'give' ? `You give (${x.mine}) → ${name} gets (${x.theirs})` : `${name} gives (${x.theirs}) → you get (${x.mine})`}</p>
    </li>
  );
  return (
    <div className="space-y-5">
      <Section title="You both want" eyebrow={`${m.yes.length}`}>
        <div className="card">{m.yes.length ? <ul aria-label="You both want">{m.yes.map(row)}</ul> : <p className="text-sm text-ink-soft">Nothing yet where you’re both a 3 or more.</p>}</div>
      </Section>
      {loved.length > 0 && (
        <Section title="Roleplays you both love" eyebrow={`🎭 ${loved.length}`}>
          <div className="card"><ul aria-label="Roleplays you both love">{loved.map((r) => <li key={r.id} className="border-b border-line py-2 last:border-0">❤️ {r.title}</li>)}</ul></div>
        </Section>
      )}
      <Section title="Worth talking about" eyebrow={`${m.talk.length}`}>
        <div className="card">{m.talk.length ? <ul aria-label="Worth talking about">{m.talk.map(row)}</ul> : <p className="text-sm text-ink-soft">Where one of you is keen and the other’s a maybe.</p>}</div>
      </Section>
      <Section title="Off the table" eyebrow={`${m.no.length}`}>
        <div className="card space-y-2">
          <p className="text-sm text-ink-soft">A 0 from either of you. No need to ask.</p>
          {m.no.length > 0 && (showNo ? <ul aria-label="Off the table">{m.no.map(row)}</ul> : <button type="button" className="btn-quiet" onClick={() => setShowNo(true)}>Show {m.no.length}</button>)}
        </div>
      </Section>
    </div>
  );
}

/** The scene's follow's limits, for the lead building it. */
export function LimitsNote({ accountId, name }: { accountId: string | undefined; name: string }) {
  const { profiles } = useProfiles();
  const p = accountId ? profiles?.[accountId]?.profile : undefined;
  if (!p || (!p.about.hard && !p.about.soft)) return null;
  return (
    <section className="card space-y-1 border-stop/40 bg-stop-light text-sm" aria-label={`${name}’s limits`}>
      {p.about.hard && <p><span className="font-semibold text-stop">{name}’s hard limits:</span> {p.about.hard}</p>}
      {p.about.soft && <p><span className="font-semibold">Ask first:</span> {p.about.soft}</p>}
    </section>
  );
}
