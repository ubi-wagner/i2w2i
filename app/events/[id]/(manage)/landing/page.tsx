import { withCtx } from '@/lib/events/db';
import { loadManage, pageInitial } from '@/lib/events/manage';
import { PageEditor } from '../../PageEditor';

/** The landing page: the look and the invitation guests see first. */
export default async function LandingTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, event } = await loadManage(id);
  const [{ n }] = await withCtx(ctx, (tx) => tx<{ n: number }[]>`SELECT count(*)::int AS n FROM events.links WHERE event_id = ${id}`);
  return (
    <section id="page" className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Landing page</h2>
        <p className="text-sm text-stone-600">The top of the page guests see when they scan a card or open the album: its look and your invitation wording. The address, schedule and notes are on the Event info tab. Changes show in the preview as you type.</p>
      </div>
      <PageEditor part="landing" eventId={event.id} slug={event.slug} hasGiftLinks={n > 0} initial={pageInitial(event)} />
    </section>
  );
}
