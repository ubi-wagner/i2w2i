'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/app/album/[slug]/api/messages/route';
import { collectClientInfo } from '@/lib/client-info';

// Group chat for people on the event. Polls every few seconds while the
// page is visible; simple and reliable on phones and behind any proxy.
const POLL_MS = 4000;

export function Chat({ slug }: { slug: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const last = useRef(0);
  const list = useRef<HTMLDivElement>(null);
  const url = `/album/${slug}/api/messages`;

  const load = useCallback(async () => {
    const res = await fetch(`${url}?after=${last.current}`, { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) return;
    const { messages: fresh } = (await res.json()) as { messages: ChatMessage[] };
    if (!fresh.length) return;
    last.current = fresh[fresh.length - 1]!.id;
    setMessages((m) => [...m, ...fresh.filter((f) => !m.some((x) => x.id === f.id))]);
  }, [url]);

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === 'visible' && load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body, client: await collectClientInfo().catch(() => null) }) }).catch(() => null);
    setSending(false);
    if (!res?.ok) {
      setError((await res?.json().catch(() => null))?.error ?? 'Couldn’t send. Try again.');
      return;
    }
    setText('');
    load();
  }

  return (
    <div className="flex flex-col rounded-2xl border border-stone-200 bg-white">
      <div ref={list} className="max-h-[28rem] min-h-32 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && <p className="text-center text-sm text-stone-500">No messages yet. Say hi!</p>}
        {messages.map((m) => (
          <div key={m.id} className={`flex flex-col ${m.mine ? 'items-end' : 'items-start'}`}>
            <span className="text-xs text-stone-500">
              {m.mine ? 'You' : m.name} · {new Date(m.created_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
            </span>
            <p className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 ${m.mine ? 'bg-brand text-white' : 'bg-stone-100'}`}>{m.body}</p>
          </div>
        ))}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-stone-200 p-3">
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Message everyone…" maxLength={2000} aria-label="Message" />
        <button className="btn shrink-0" disabled={sending || !text.trim()}>Send</button>
      </form>
      {error && <p className="px-3 pb-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
