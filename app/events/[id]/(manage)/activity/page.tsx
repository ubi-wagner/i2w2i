import { describeDevice } from '@/lib/device';
import { withCtx } from '@/lib/events/db';
import { describeAction, eventActivity, shortDevice } from '@/lib/events/forensics';
import { loadManage } from '@/lib/events/manage';

/** Everything people did on the event, with the device and network it came from. */
export default async function ActivityTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await loadManage(id);
  const activity = await withCtx(ctx, (tx) => eventActivity(tx, id));
  return (
    <section id="activity" className="card space-y-3">
      <h2 className="text-lg font-semibold">Activity</h2>
      <p className="text-sm text-stone-600">Everything people did on this event, newest first, with the device and network it came from. Who joined with a code, and from which phone, is on the People tab under Guests.</p>
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full min-w-[40rem] text-left text-xs">
          <thead className="sticky top-0 bg-white text-stone-500">
            <tr><th className="py-1 pr-3">When</th><th className="pr-3">Who</th><th className="pr-3">What</th><th className="pr-3">Device</th><th>IP</th></tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {activity.slice(0, 500).map((a) => (
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
  );
}
