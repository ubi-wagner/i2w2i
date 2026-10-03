import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CopyText } from '@/components/CopyText';
import { Header } from '@/components/Header';
import { Gallery } from '@/components/events/Gallery';
import { requireApp } from '@/lib/apps';
import { decryptCode } from '@/lib/events/codes';
import { withCtx } from '@/lib/events/db';
import { canManage, canOwn, eventForCtx, GALLERY_SQL_COLUMNS, toGallery, type UploadRow } from '@/lib/events/queries';
import { albumUrl, qrLink, qrSvg } from '@/lib/events/qr';
import { formatBytes } from '@/lib/events/rules';
import { userCtx } from '@/lib/events/session';
import { addMember, approveAllReady, changeAccessCode, moderateUpload, moderateUploads, removeGuest, removeLink, removeMember } from '../actions';
import { LinkForm } from './LinkForm';
import { HostInviteForm, SignInLinkButton } from './PeopleForms';
import { canIssueLink, type PlatformRole } from '@/lib/access';
import type { LinkRow } from '@/components/events/GiftLinks';
import { describeDevice } from '@/lib/device';
import { describeAction, eventActivity, namesByDevice, shortDevice, uploadDetails, type ActivityRow } from '@/lib/events/forensics';
import { CodeForm } from './CodeForm';
import { SettingsForm } from './SettingsForm';
import { PageEditor } from './PageEditor';
import { NotifyToggle } from '@/components/pwa/NotifyToggle';
import { cleanPage } from '@/lib/events/page';

export const metadata = { title: 'Manage event' };

interface Member { user_id: string; role: string; display_name: string; email: string; platform_role: PlatformRole; created_by: string | null; is_active: boolean }
interface Person { id: string; display_name: string; email: string }
interface GuestRow {
  id: string; display_name: string; via: string; created_at: Date; last_seen_at: Date; revoked_at: Date | null;
  label: string; uploads: number;
}
interface Code {
  id: string; label: string; code_enc: Buffer | null; qr_version: number; can_upload: boolean; can_view: boolean;
  code_revoked_at: Date | null; qr_revoked_at: Date | null; guests: number;
}

const ROLE = { owner: 'Co-host', curator: 'Helper', invitee: 'Guest' } as const;

export default async function ManageEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { user } = await requireApp('events');
  const ctx = userCtx(user);
  const found = await eventForCtx(ctx, id);
  if (!found) notFound();
  const { event, role } = found;
  if (!canManage(ctx, role)) redirect(`/album/${event.slug}`);
  const owner = canOwn(ctx, role);

  const { members, people, codes, uploads, guests, activity, links } = await withCtx(ctx, async (tx) => ({
    members: await tx<Member[]>`
      SELECT m.user_id, m.role, u.display_name, u.email, u.platform_role, u.created_by, u.is_active
        FROM events.members m JOIN core.users u ON u.id = m.user_id
       WHERE m.event_id = ${id}
       ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'curator' THEN 1 ELSE 2 END, u.display_name`,
    people: await tx<Person[]>`
      SELECT u.id, u.display_name, u.email FROM core.users u
       WHERE u.is_active AND NOT EXISTS (SELECT 1 FROM events.members m WHERE m.event_id = ${id} AND m.user_id = u.id)
       ORDER BY u.display_name`,
    codes: owner
      ? await tx<Code[]>`
          SELECT c.id, c.label, c.code_enc, c.qr_version, c.can_upload, c.can_view, c.code_revoked_at, c.qr_revoked_at,
                 (SELECT count(*)::int FROM events.guests g WHERE g.access_code_id = c.id) AS guests
            FROM events.access_codes c WHERE c.event_id = ${id} ORDER BY c.created_at`
      : [],
    uploads: await tx<UploadRow[]>`
      SELECT ${tx.unsafe(GALLERY_SQL_COLUMNS)} FROM events.uploads u
       WHERE u.event_id = ${id} AND u.status = 'ready' ORDER BY u.created_at DESC`,
    guests: await tx<GuestRow[]>`
      SELECT g.id, g.display_name, g.via, g.created_at, g.last_seen_at, g.revoked_at, c.label,
             (SELECT count(*)::int FROM events.uploads u WHERE u.uploader_guest_id = g.id AND u.status = 'ready') AS uploads
        FROM events.guests g JOIN events.access_codes c ON c.id = g.access_code_id
       WHERE g.event_id = ${id} ORDER BY g.created_at DESC`,
    activity: await eventActivity(tx, id),
    links: await tx<LinkRow[]>`SELECT id, kind, label, url FROM events.links WHERE event_id = ${id} ORDER BY sort_order, created_at`,
  }));
  const deviceNames = namesByDevice(activity);
  const lastByGuest = new Map<string, ActivityRow>();
  for (const a of activity) if (a.guest_id && !lastByGuest.has(a.guest_id)) lastByGuest.set(a.guest_id, a);

  const gallery = (await toGallery(uploads, ctx, { originals: true })).map((g) => ({ ...g, details: uploadDetails(activity, g.id, deviceNames) }));
  const qrLinks = codes.map((c) => (c.qr_revoked_at ? null : qrLink(event.slug, c.id, c.qr_version)));
  const qrs = await Promise.all(qrLinks.map((l) => (l ? qrSvg(l) : null)));
  const totalBytes = uploads.reduce((n, u) => n + Number(u.size_bytes), 0);
  // Not yet approved: nobody but the uploader and the hosts sees these.
  const queue = gallery.filter((g) => g.pending && !g.hidden);
  const readyNow = queue.filter((g) => !g.reviewInMinutes).length;
  const pg = cleanPage(event.page);
  const steps = [
    { href: '#page', label: 'Make the page yours: look, wording, directions, schedule', done: event.theme !== 'classic' || Boolean(pg.kicker || pg.address || pg.schedule.length) },
    { href: '#people', label: 'Add the people helping with this event', done: members.length > 1 },
    { href: '#codes', label: 'Make a guest code and print its QR card', done: codes.length > 0 },
    { href: '#photos', label: 'Add the first photos from the album page', done: uploads.length > 0 },
    { href: '#publishing', label: 'Publish the album when you’re ready', done: event.status === 'published' },
  ];
  const sections: [string, string][] = [
    ['#page', 'Page'], ['#publishing', 'Publishing'], ['#people', 'People'],
    ...(owner ? ([['#codes', 'Codes & QR'], ['#gifts', 'Gifts']] as [string, string][]) : []),
    ...(queue.length ? ([['#review', `To review (${queue.length})`]] as [string, string][]) : []),
    ['#guests', `Guests (${guests.length})`], ['#photos', `Photos (${uploads.length})`], ['#activity', 'Activity'],
  ];

  return (
    <>
      <Header user={user} />
      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/events" className="text-sm text-stone-500 hover:underline">← Events</Link>
            <h1 className="text-2xl font-semibold">{event.title}</h1>
          </div>
          <div className="flex gap-2">
            <Link href={`/events/${id}/card`} className="btn-secondary">Album card</Link>
            <Link href={`/album/${event.slug}`} className="btn-secondary">Open album</Link>
          </div>
          <div className="w-full"><CopyText text={albumUrl(event.slug)} label="Copy album link" /></div>
        </div>

        {queue.length > 0 && (
          <a href="#review" className="flex items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-amber-950 hover:border-amber-500">
            <span><b>{queue.length} new {queue.length === 1 ? 'photo is' : 'photos are'} waiting for your OK.</b> Nobody else sees {queue.length === 1 ? 'it' : 'them'} until you approve.</span>
            <span className="shrink-0 font-medium underline">Review</span>
          </a>
        )}

        <section aria-label="Notifications" className="rounded-2xl border border-stone-200 bg-white px-5 py-4">
          <NotifyToggle purpose="Get a notification on this phone when guests’ photos are waiting for your OK." />
        </section>

        {owner && steps.some((st) => !st.done) && (
          <section className="card space-y-2 border-brand/40 bg-brand-light/40">
            <h2 className="font-semibold">Getting this album ready</h2>
            <ol className="space-y-1 text-sm">
              {steps.map((st) => (
                <li key={st.href} className={st.done ? 'text-stone-400 line-through' : ''}>
                  <span className="mr-2">{st.done ? '✓' : '○'}</span>
                  {st.done ? st.label : <a href={st.href} className="text-brand-dark underline">{st.label}</a>}
                </li>
              ))}
            </ol>
            <p className="pt-1 text-sm text-stone-600">New to this? The <Link href="/help/hosting" className="text-brand-dark underline">step-by-step guide</Link> walks through each part.</p>
          </section>
        )}

        <nav aria-label="Sections" className="sticky top-0 z-20 -mx-4 overflow-x-auto border-b border-stone-200 bg-stone-50/95 px-4 py-2 backdrop-blur">
          <ul className="flex gap-4 whitespace-nowrap text-sm">
            {sections.map(([href, label]) => (
              <li key={href}><a href={href} className="text-stone-600 hover:text-brand">{label}</a></li>
            ))}
          </ul>
        </nav>

        <section id="page" className="scroll-mt-14 card space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Your event page</h2>
            <p className="text-sm text-stone-600">What guests see when they scan a card or open the album. Changes show in the preview as you type.</p>
          </div>
          <PageEditor
            eventId={event.id}
            slug={event.slug}
            hasGiftLinks={links.length > 0}
            initial={{
              title: event.title,
              startsOn: event.starts_on ? event.starts_on.toISOString().slice(0, 10) : '',
              location: event.location,
              description: event.description,
              theme: event.theme,
              giftNote: event.gift_note,
              page: cleanPage(event.page),
            }}
          />
        </section>

        <section id="publishing" className="scroll-mt-14 card space-y-4">
          <h2 className="text-lg font-semibold">Publishing</h2>
          <SettingsForm event={{ id: event.id, status: event.status, audience: event.audience, chat_enabled: event.chat_enabled }} />
        </section>

        <section id="people" className="scroll-mt-14 card space-y-4">
          <h2 className="text-lg font-semibold">People on this event</h2>
          <p className="text-sm text-stone-600"><b>Guests</b> see the album, add photos and join the group chat. <b>Helpers</b> can also hide photos. <b>Co-hosts</b> run everything on this page, like you.</p>
          <ul className="divide-y divide-stone-100">
            {members.map((m) => (
              <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{m.display_name}{m.user_id === user.id && <span className="text-stone-500"> (you)</span>} <span className="text-sm text-stone-500">{m.email}</span></span>
                <span className="flex items-center gap-3 text-sm">
                  {owner && m.user_id !== user.id ? (
                    <form action={addMember} className="flex items-center gap-1">
                      <input type="hidden" hidden name="event_id" value={id} />
                      <input type="hidden" hidden name="user_id" value={m.user_id} />
                      <select name="role" defaultValue={m.role} aria-label={`${m.display_name}’s role`} className="rounded-full border border-stone-200 bg-stone-100 px-2 py-0.5">
                        {Object.entries(ROLE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <button className="text-brand hover:underline">Save</button>
                    </form>
                  ) : (
                    <span className="rounded-full bg-stone-100 px-2 py-0.5">{ROLE[m.role as keyof typeof ROLE]}</span>
                  )}
                  {owner && m.user_id !== user.id && (
                    <form action={removeMember}>
                      <input type="hidden" hidden name="event_id" value={id} />
                      <input type="hidden" hidden name="user_id" value={m.user_id} />
                      <button className="text-stone-500 hover:underline">Remove</button>
                    </form>
                  )}
                </span>
                {owner && canIssueLink(user, { id: m.user_id, platform_role: m.platform_role, created_by: m.created_by, is_active: m.is_active }) && (
                  <SignInLinkButton userId={m.user_id} eventId={id} />
                )}
              </li>
            ))}
          </ul>
          {owner && <HostInviteForm eventId={id} />}
          {owner && (people.length ? (
            <form action={addMember} className="flex flex-wrap items-end gap-2">
              <input type="hidden" hidden name="event_id" value={id} />
              <div className="grow">
                <label className="label" htmlFor="user_id">Or add someone who already has an account</label>
                <select className="input" id="user_id" name="user_id" required>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.display_name} ({p.email})</option>)}
                </select>
              </div>
              <select name="role" className="input w-auto" defaultValue="invitee" aria-label="Role">
                <option value="invitee">Guest</option>
                <option value="curator">Helper</option>
                <option value="owner">Co-host</option>
              </select>
              <button className="btn">Add</button>
            </form>
          ) : (
            <p className="text-sm text-stone-500">Everyone with an account is already on this event.</p>
          ))}
        </section>

        {owner && (
          <section id="codes" className="scroll-mt-14 card space-y-4">
            <h2 className="text-lg font-semibold">Guest codes &amp; QR cards</h2>
            <p className="text-sm text-stone-600">
              Guests without an account go to <b>{albumUrl(event.slug)}</b> and type a code, or scan its QR. They give their name and can then add photos (and see the album, if the code allows).
            </p>
            <ul className="space-y-3">
              {codes.map((c, i) => {
                const typed = decryptCode(c.code_enc);
                return (
                  <li key={c.id} className="flex flex-wrap items-start gap-4 rounded-xl border border-stone-200 p-4">
                    {qrs[i] ? (
                      <div className="h-28 w-28 shrink-0" dangerouslySetInnerHTML={{ __html: qrs[i]! }} />
                    ) : (
                      <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded bg-stone-100 text-center text-xs text-stone-500">QR turned off</div>
                    )}
                    <div className="grow space-y-1 text-sm">
                      <p className="text-base font-semibold">
                        {typed ? <span className="font-mono">{typed}</span> : 'QR only'}
                        {c.label && <span className="ml-2 font-normal text-stone-500">{c.label}</span>}
                      </p>
                      <p className="text-stone-600">
                        {[c.can_upload && 'Can add photos', c.can_view && 'can see the album'].filter(Boolean).join(', ')} · {c.guests} guests joined
                      </p>
                      {c.code_revoked_at && typed && <p className="text-red-600">Typed code turned off</p>}
                      {qrLinks[i] && <CopyText text={qrLinks[i]!} />}
                      <div className="flex flex-wrap gap-3 pt-1">
                        {!c.qr_revoked_at && <Link className="text-brand hover:underline" href={`/events/${id}/codes/${c.id}`}>Print card</Link>}
                        {[
                          typed && !c.code_revoked_at && ['revoke_code', 'Turn off typed code'],
                          typed && c.code_revoked_at && ['restore_code', 'Turn typed code back on'],
                          !c.qr_revoked_at && ['revoke_qr', 'Turn off QR'],
                          ['reissue_qr', c.qr_revoked_at ? 'Make a new QR' : 'Replace QR (old cards stop working)'],
                        ].filter((x): x is [string, string] => Boolean(x)).map(([action, label]) => (
                          <form key={action} action={changeAccessCode}>
                            <input type="hidden" hidden name="event_id" value={id} />
                            <input type="hidden" hidden name="code_id" value={c.id} />
                            <input type="hidden" hidden name="action" value={action} />
                            <button className="text-stone-600 hover:underline">{label}</button>
                          </form>
                        ))}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <CodeForm eventId={id} />
          </section>
        )}

        {owner && (
          <section id="gifts" className="scroll-mt-14 card space-y-4">
            <h2 className="text-lg font-semibold">Gifts &amp; payments</h2>
            <p className="text-sm text-stone-600">Shown on the album with a QR code each, for Venmo, a registry and the like. Money never passes through i2w2i.</p>
            {links.length > 0 && (
              <ul className="divide-y divide-stone-100 text-sm">
                {links.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                    <span><b>{l.label}</b> <a className="text-brand underline" href={l.url} target="_blank" rel="noopener noreferrer">{l.url}</a></span>
                    <form action={removeLink}>
                      <input type="hidden" hidden name="event_id" value={id} />
                      <input type="hidden" hidden name="link_id" value={l.id} />
                      <button className="text-stone-500 hover:underline">Remove</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <LinkForm eventId={id} />
          </section>
        )}

        <section id="guests" className="scroll-mt-14 card space-y-4">
          <h2 className="text-lg font-semibold">Guests ({guests.length})</h2>
          {guests.length === 0 ? (
            <p className="text-sm text-stone-600">No guests have joined with a code or QR yet.</p>
          ) : (
            <ul className="divide-y divide-stone-100 text-sm">
              {guests.map((g) => {
                const last = lastByGuest.get(g.id);
                const others = last?.device_id ? [...(deviceNames.get(last.device_id) ?? [])].filter((n) => n !== g.display_name) : [];
                return (
                  <li key={g.id} className={`flex flex-wrap items-start justify-between gap-3 py-3 ${g.revoked_at ? 'opacity-50' : ''}`}>
                    <div className="space-y-0.5">
                      <p className="font-medium">{g.display_name} {g.revoked_at && <span className="text-red-600">(removed)</span>}</p>
                      <p className="text-stone-600">
                        via {g.via === 'qr' ? 'QR' : 'code'}{g.label ? ` (${g.label})` : ''} · joined {g.created_at.toLocaleString()} · {g.uploads} uploads
                      </p>
                      {last && (
                        <p className="text-stone-500">
                          {describeDevice(last.user_agent, last.client)} · device {shortDevice(last.device_id)}{last.ip ? ` · IP ${last.ip}` : ''}
                        </p>
                      )}
                      {others.length > 0 && <p className="text-amber-700">Same device also used: {others.join(', ')}</p>}
                    </div>
                    {!g.revoked_at && (
                      <form action={removeGuest} className="flex items-center gap-2">
                        <input type="hidden" hidden name="event_id" value={id} />
                        <input type="hidden" hidden name="guest_id" value={g.id} />
                        <label className="flex items-center gap-1 text-stone-600"><input type="checkbox" name="hide_uploads" /> hide their uploads</label>
                        <button className="text-red-700 hover:underline">Remove</button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {queue.length > 0 && (
          <section id="review" className="scroll-mt-14 card space-y-4 border-amber-300">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Waiting for your OK ({queue.length})</h2>
                <p className="text-sm text-stone-600">Only the person who added each one, and you hosts, can see these. Approve to add them to the album; hide or delete anything that shouldn’t be there.</p>
              </div>
              {readyNow > 0 && (
                <form action={approveAllReady}>
                  <input type="hidden" hidden name="event_id" value={id} />
                  <button className="btn bg-green-700 hover:bg-green-800">Approve {readyNow === queue.length ? 'all' : readyNow} {readyNow === 1 ? 'photo' : 'photos'}</button>
                </form>
              )}
            </div>
            {readyNow < queue.length && (
              <p className="text-sm text-amber-800">Some are still finishing on the guest’s phone and can be approved in a few minutes.</p>
            )}
            <Gallery
              items={queue}
              reviewQueue
              downloadUrl={`/album/${event.slug}/api/download`}
              moderation={{ eventId: id, action: moderateUpload, bulkAction: moderateUploads }}
              empty="Nothing waiting."
            />
          </section>
        )}

        <section id="photos" className="scroll-mt-14 card space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">Photos &amp; videos</h2>
            <p className="text-sm text-stone-600">{uploads.length} items · {formatBytes(totalBytes)}</p>
          </div>
          <Gallery
            items={gallery}
            downloadUrl={`/album/${event.slug}/api/download`}
            commentsSlug={event.slug}
            moderation={{ eventId: id, action: moderateUpload, bulkAction: moderateUploads }}
            empty="Nothing yet. Share a code or QR, or add some yourself from the album page."
          />
          <details className="text-sm text-stone-600">
            <summary className="cursor-pointer">Downloading everything</summary>
            <p className="mt-2">Each photo has a “Download original” link. For the whole album, use the bucket’s credentials from Railway with <code>rclone</code> or <code>aws s3 sync</code> on the folder <code>events/{id}/</code>; see docs/RAILWAY.md.</p>
          </details>
        </section>

        <section id="activity" className="scroll-mt-14 card space-y-3">
          <h2 className="text-lg font-semibold">Activity</h2>
          <p className="text-sm text-stone-600">Everything people did on this event, newest first, with the device and network it came from.</p>
          <div className="max-h-96 overflow-auto">
            <table className="w-full min-w-[40rem] text-left text-xs">
              <thead className="sticky top-0 bg-white text-stone-500">
                <tr><th className="py-1 pr-3">When</th><th className="pr-3">Who</th><th className="pr-3">What</th><th className="pr-3">Device</th><th>IP</th></tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {activity.slice(0, 300).map((a) => (
                  <tr key={a.id} className={a.action.endsWith('_failed') ? 'text-red-700' : ''}>
                    <td className="whitespace-nowrap py-1 pr-3">{a.created_at.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })}</td>
                    <td className="pr-3">{a.actor_name ?? 'Visitor'}{a.user_id ? '' : a.guest_id ? ' (guest)' : ''}</td>
                    <td className="pr-3">{describeAction(a)}</td>
                    <td className="pr-3">{describeDevice(a.user_agent, a.client)} <span className="text-stone-400">{shortDevice(a.device_id)}</span></td>
                    <td className="whitespace-nowrap">{a.ip ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {activity.length === 0 && <p className="text-sm text-stone-500">Nothing yet.</p>}
          </div>
        </section>
      </main>
    </>
  );
}
