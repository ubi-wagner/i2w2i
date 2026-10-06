'use client';

import { useActionState, useTransition } from 'react';
import { CredentialsShare } from '@/components/CredentialsShare';
import { NewPersonFields, submitWithoutReset } from '@/components/NewPersonFields';
import { addExistingMember, inviteToEvent, removeMember, resetMemberPassword, setMemberRole, type MemberState, type PeopleState } from '../actions';

const ROLES = [
  ['invitee', 'Viewer'],
  ['curator', 'Editor'],
  ['owner', 'Co-host'],
] as const;

function RoleOptions() {
  return <>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</>;
}

/**
 * One person on the event. Picking a role saves it straight away and says
 * so; the dropdown then shows what's saved (React resets a form after its
 * action, so it's keyed by the saved role rather than left to snap back).
 */
export function MemberRow({ eventId, member, canEdit, you, resetSlot }: {
  eventId: string;
  member: { user_id: string; display_name: string; username: string; role: string };
  canEdit: boolean;
  you: boolean;
  resetSlot?: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<MemberState, FormData>(setMemberRole, { role: member.role });
  const [removed, remove, removing] = useActionState<MemberState, FormData>(removeMember, {});
  const role = state.role ?? member.role;
  const label = ROLES.find(([v]) => v === role)?.[1] ?? role;
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-3">
      <span>
        <b className="font-medium">{member.display_name}</b>{you && <span className="text-stone-500"> (you)</span>}{' '}
        <span className="font-mono text-sm text-stone-500">{member.username}</span>
      </span>
      <span className="flex flex-wrap items-center gap-3 text-sm">
        {canEdit && !you ? (
          <form action={action} className="flex items-center gap-2">
            <input type="hidden" hidden name="event_id" value={eventId} />
            <input type="hidden" hidden name="user_id" value={member.user_id} />
            <select
              key={role}
              name="role"
              defaultValue={role}
              disabled={pending}
              aria-label={`${member.display_name}’s role`}
              className="rounded-full border border-stone-300 bg-white px-3 py-1"
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
            >
              <RoleOptions />
            </select>
            <span role="status" className={state.error ? 'text-red-600' : 'text-green-700'}>{pending ? 'Saving…' : state.error ?? state.message ?? ''}</span>
          </form>
        ) : (
          <span className="rounded-full bg-stone-100 px-3 py-1">{label}</span>
        )}
        {canEdit && !you && (
          <form action={remove} onSubmit={(e) => { if (!confirm(`Take ${member.display_name} off this event? Their account stays, and anything they added stays.`)) e.preventDefault(); }}>
            <input type="hidden" hidden name="event_id" value={eventId} />
            <input type="hidden" hidden name="user_id" value={member.user_id} />
            <button className="text-stone-500 hover:underline" disabled={removing}>Remove</button>
            {removed.error && <span className="ml-2 text-red-600">{removed.error}</span>}
          </form>
        )}
      </span>
      {resetSlot}
    </li>
  );
}

/** Someone who already has an account: pick them and a role. */
export function AddExistingForm({ eventId, people }: { eventId: string; people: { id: string; display_name: string; username: string }[] }) {
  const [state, action, pending] = useActionState<MemberState, FormData>(addExistingMember, {});
  // Adding the last one empties the list; still say it worked.
  if (!people.length) {
    return (
      <div className="space-y-2">
        {state.message && <p className="text-sm text-green-700" role="status">{state.message}</p>}
        <p className="text-sm text-stone-500">Everyone with an account is already on this event.</p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" hidden name="event_id" value={eventId} />
      <div>
        <label className="label" htmlFor="user_id">Who</label>
        <select className="input" id="user_id" name="user_id" required>
          {people.map((p) => <option key={p.id} value={p.id}>{p.display_name} ({p.username})</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="existing_role">Their role</label>
        <select className="input sm:w-auto" id="existing_role" name="role" defaultValue="invitee"><RoleOptions /></select>
      </div>
      {state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      {state.message && <p className="text-sm text-green-700" role="status">{state.message}</p>}
      <button className="btn" disabled={pending}>Add</button>
    </form>
  );
}

export function HostInviteForm({ eventId }: { eventId: string }) {
  const [state, action, pending] = useActionState<PeopleState, FormData>(inviteToEvent, {});
  const [, startTransition] = useTransition();
  return (
    <form onSubmit={submitWithoutReset(action, startTransition)} className="space-y-3">
      <input type="hidden" hidden name="event_id" value={eventId} />
      <p className="font-medium">Add someone new</p>
      <NewPersonFields clearOn={state.credentials} />
      <div>
        <label className="label" htmlFor="new_role">Their role</label>
        <select className="input sm:w-auto" id="new_role" name="role" defaultValue="invitee"><RoleOptions /></select>
      </div>
      {state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      {/* Gone while the next one saves, so nobody passes on the previous person's password. */}
      {state.credentials && state.url && !pending && <CredentialsShare credentials={state.credentials} url={state.url} />}
      <button className="btn" disabled={pending}>Add to this event</button>
      <p className="text-xs text-stone-500">You choose their username and starting password and pass them on yourself (a text, or in person); nothing is emailed. They can change the password once they’re in.</p>
    </form>
  );
}

export function ResetPasswordButton({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState<PeopleState, FormData>(resetMemberPassword, {});
  return (
    <div className="w-full space-y-2">
      <form action={action}>
        <input type="hidden" hidden name="user_id" value={userId} />
        <button className="text-sm text-brand hover:underline" disabled={pending}>Reset password</button>
      </form>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.credentials && state.url && !pending && <CredentialsShare credentials={state.credentials} url={state.url} reset />}
    </div>
  );
}
