'use client';

import { useActionState, useState } from 'react';
import { slugify } from '@/lib/events/rules';
import { createEvent, type FormState } from '../actions';

export function NewEventForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createEvent, {});
  const f = state.fields ?? {};
  const [slug, setSlug] = useState(f.slug ?? '');
  const [touched, setTouched] = useState(false);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="title">Event name</label>
        <input
          className="input" id="title" name="title" required maxLength={120} defaultValue={f.title}
          placeholder="Cassie’s Bridal Shower"
          onChange={(e) => !touched && setSlug(slugify(e.target.value))}
        />
      </div>
      <div>
        <label className="label" htmlFor="slug">Album web address</label>
        <div className="flex items-center gap-1 text-sm text-stone-600">
          <span className="shrink-0">i2w2i.com/album/</span>
          <input
            className="input" id="slug" name="slug" required pattern="[a-z0-9][a-z0-9-]{1,60}" value={slug}
            onChange={(e) => { setTouched(true); setSlug(e.target.value.toLowerCase()); }}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="starts_on">Date</label>
          <input className="input" id="starts_on" name="starts_on" type="date" defaultValue={f.starts_on} />
        </div>
        <div>
          <label className="label" htmlFor="location">Place</label>
          <input className="input" id="location" name="location" maxLength={200} defaultValue={f.location} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="description">Description</label>
        <textarea className="input" id="description" name="description" rows={3} defaultValue={f.description} />
      </div>
      {state.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      <button className="btn" disabled={pending}>Create event</button>
      <p className="text-xs text-stone-500">It starts as a draft only you can see. You’ll add people, codes and publish it next.</p>
    </form>
  );
}
