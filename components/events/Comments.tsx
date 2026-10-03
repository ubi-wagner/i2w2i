'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CommentView } from '@/app/album/[slug]/api/comments/route';
import { collectClientInfo } from '@/lib/client-info';

export function Comments({ slug, uploadId }: { slug: string; uploadId: string }) {
  const [comments, setComments] = useState<CommentView[] | null>(null);
  const [canPost, setCanPost] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const url = `/album/${slug}/api/comments`;

  const load = useCallback(async () => {
    const res = await fetch(`${url}?upload=${uploadId}`, { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { comments: CommentView[]; canPost: boolean };
    setComments(data.comments);
    setCanPost(data.canPost);
  }, [url, uploadId]);

  useEffect(() => {
    setComments(null);
    load();
  }, [load]);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setError(null);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upload: uploadId, body: text, client: await collectClientInfo().catch(() => null) }),
    }).catch(() => null);
    setSending(false);
    if (!res?.ok) {
      setError((await res?.json().catch(() => null))?.error ?? 'Couldn’t post. Try again.');
      return;
    }
    setText('');
    load();
  }

  async function remove(id: number) {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id }) });
    load();
  }

  if (comments === null) return null;
  return (
    <div className="mx-auto w-full max-w-xl space-y-2 px-4 text-sm" onClick={(e) => e.stopPropagation()}>
      {comments.length > 0 && (
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-white/10 p-2" aria-label="Comments">
          {comments.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-2">
              <span><b>{c.author}</b> {c.body}</span>
              {c.can_delete && (
                <button type="button" className="shrink-0 text-xs text-stone-400 underline" onClick={() => remove(c.id)}>remove</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canPost && (
        <form onSubmit={post} className="flex gap-2">
          <input
            className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-white placeholder:text-stone-400"
            value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…" maxLength={1000} aria-label="Comment"
          />
          <button className="rounded-lg bg-white px-3 py-1.5 font-medium text-stone-900 disabled:opacity-50" disabled={sending || !text.trim()}>Post</button>
        </form>
      )}
      {error && <p className="text-red-300">{error}</p>}
    </div>
  );
}
