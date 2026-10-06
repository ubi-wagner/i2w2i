import { canResetPassword, type PlatformRole } from '@/lib/access';
import { describeDevice } from '@/lib/device';
import { withCtx } from '@/lib/events/db';
import { eventActivity, namesByDevice, shortDevice, type ActivityRow } from '@/lib/events/forensics';
import { loadManage, ROLE_HINT, ROLE_LABEL, type EventRole } from '@/lib/events/manage';
import { removeGuest } from '../../../actions';
import { AddExistingForm, HostInviteForm, MemberRow, ResetPasswordButton } from '../../PeopleForms';

interface Member { user_id: string; role: EventRole; display_name: string; username: string; platform_role: PlatformRole; created_by: string | null; is_active: boolean }
interface Person { id: string; display_name: string; username: string }
interface GuestRow { id: string; display_name: string; via: string; created_at: Date; revoked_at: Date | null; label: string; uploads: number }

const ORDER: EventRole[] = ['owner', 'curator', 'invitee'];
const GROUP: Record<EventRole, [string, string]> = { owner: ['co-host', 'co-hosts'], curator: ['editor', 'editors'], invitee: ['viewer', 'viewers'] };

/** People with accounts on the event (co-hosts, editors, viewers), and guests who came in with a code. */
export default async function PeopleTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, ctx, owner } = await loadManage(id);
  const { members, people, guests, activity } = await withCtx(ctx, async (tx) => ({
    members: await tx<Member[]>`
      SELECT m.user_id, m.role, u.display_name, u.username, u.platform_role, u.created_by, u.is_active
        FROM events.members m JOIN core.users u ON u.id = m.user_id
       WHERE m.event_id = ${id} ORDER BY u.display_name`,
    people: owner
      ? await tx<Person[]>`
          SELECT u.id, u.display_name, u.username FROM core.users u
           WHERE u.is_active AND NOT EXISTS (SELECT 1 FROM events.members m WHERE m.event_id = ${id} AND m.user_id = u.id)
           ORDER BY u.display_name`
      : [],
    guests: await tx<GuestRow[]>`
      SELECT g.id, g.display_name, g.via, g.created_at, g.revoked_at, c.label,
             (SELECT count(*)::int FROM events.uploads u WHERE u.uploader_guest_id = g.id AND u.status = 'ready') AS uploads
        FROM events.guests g JOIN events.access_codes c ON c.id = g.access_code_id
       WHERE g.event_id = ${id} ORDER BY g.created_at DESC`,
    activity: await eventActivity(tx, id),
  }));
  const deviceNames = namesByDevice(activity);
  const lastByGuest = new Map<string, ActivityRow>();
  for (const a of activity) if (a.guest_id && !lastByGuest.has(a.guest_id)) lastByGuest.set(a.guest_id, a);

  return (
    <div className="space-y-6">
      <section id="people" className="card space-y-4">
        <div>
          <h2 className="text-lg font-semibold">People on this event</h2>
          <p className="text-sm text-stone-600">{owner ? 'Pick a role next to someone to change it; it saves straight away.' : 'Only co-hosts add people and change roles.'}</p>
        </div>
        <dl className="grid gap-2 rounded-xl bg-stone-50 p-3 text-sm sm:grid-cols-3">
          {ORDER.map((r) => (
            <div key={r}><dt className="font-semibold">{ROLE_LABEL[r]}</dt><dd className="text-stone-600">{ROLE_HINT[r]}</dd></div>
          ))}
        </dl>
        <p className="text-sm text-stone-600">{ORDER.map((r) => { const n = members.filter((m) => m.role === r).length; return `${n} ${GROUP[r][n === 1 ? 0 : 1]}`; }).join(' · ')}</p>
        {/* One list in a steady order, so a row keeps its place (and its “Saved”) when its role changes. */}
        <ul className="divide-y divide-stone-100">
          {members.map((m) => (
            <MemberRow
              key={m.user_id}
              eventId={id}
              member={m}
              canEdit={owner}
              you={m.user_id === user.id}
              resetSlot={owner && canResetPassword(user, { id: m.user_id, platform_role: m.platform_role, created_by: m.created_by, is_active: m.is_active })
                ? <ResetPasswordButton userId={m.user_id} />
                : undefined}
            />
          ))}
        </ul>
      </section>

      {owner && (
        <section id="add" className="card space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Add people</h2>
            <p className="text-sm text-stone-600">Family and friends with an account on i2w2i. Guests at the event don’t need one: they scan a QR card (see QR &amp; posters).</p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-stone-200 p-4"><HostInviteForm eventId={id} /></div>
            <div className="space-y-3 rounded-xl border border-stone-200 p-4">
              <p className="font-medium">Add someone who already has an account</p>
              <AddExistingForm eventId={id} people={people} />
            </div>
          </div>
        </section>
      )}

      <section id="guests" className="card space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Guests ({guests.length})</h2>
          <p className="text-sm text-stone-600">People who joined with a guest code or QR, under the name they gave. Remove anyone who shouldn’t be here.</p>
        </div>
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
                    <p className="text-stone-600">via {g.via === 'qr' ? 'QR' : 'code'}{g.label ? ` (${g.label})` : ''} · joined {g.created_at.toLocaleString()} · {g.uploads} uploads</p>
                    {last && <p className="text-stone-500">{describeDevice(last.user_agent, last.client)} · device {shortDevice(last.device_id)}{last.ip ? ` · IP ${last.ip}` : ''}</p>}
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
    </div>
  );
}
