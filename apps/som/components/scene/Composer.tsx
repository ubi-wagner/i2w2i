'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client/api';
import { cantSend } from '@/lib/client/upload';
import { dismissUpload, startUpload, usePendingUploads } from '@/lib/client/uploads';
import { usePod } from '../Pod';
import { useDraft } from '../useDraft';
import { ErrorText } from '../ui';
import type { EntryKind } from './useScene';

/**
 * Add something to a scene or a task: a note (or a piece of writing), and
 * photos, videos, voice notes or files, each encrypted before it leaves the
 * phone. Several uploads can run at once.
 */
export function Composer({ sceneId, taskId, kind = 'comment', placeholder = 'Add a note…', allowMedia = true, list, onAdded }: {
  sceneId: string;
  taskId?: string | null;
  kind?: EntryKind;
  placeholder?: string;
  allowMedia?: boolean;
  /** Several notes wanted (affirmations, say): one per line, each counts. */
  list?: { label: string; left: number };
  onAdded: () => void;
}) {
  const pod = usePod();
  const [text, setText, clearText] = useDraft(`note:${kind}:${sceneId}:${taskId ?? ''}`, '');
  // One id per note, kept until it's sent: trying again never posts it twice.
  const noteId = useRef(crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const uploads = usePendingUploads(sceneId, taskId ?? null);
  const [error, setError] = useState('');
  const writing = kind === 'writing';
  const [asList, setAsList] = useState(Boolean(list));
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  async function send() {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    setError('');
    try {
      const id = noteId.current;
      const body = asList && list ? { text: lines.join('\n'), items: lines.slice(0, 200) } : { text: t };
      await api(`/api/scenes/${sceneId}/entries`, { body: { id, kind, taskId: taskId ?? null, bodyEnc: await pod.seal(body, `entry:${id}`) } });
      noteId.current = crypto.randomUUID();
      clearText();
      onAdded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function addFiles(files: FileList | File[] | null) {
    setError('');
    for (const file of Array.from(files ?? [])) {
      const problem = cantSend(file);
      if (problem) { setError(problem); continue; }
      startUpload(file, { sceneId, taskId, key: pod.key }, onAdded);
    }
  }

  return (
    <div className="space-y-2">
      {list && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-ink-soft">{asList ? `One per line; each line counts as one of your ${list.label}.` : 'Sending as a single note.'}</span>
          <button type="button" className="underline" onClick={() => setAsList(!asList)}>{asList ? 'Send as one note' : `Send as ${list.label}`}</button>
        </div>
      )}
      <textarea
        className="input"
        rows={writing || (asList && list) ? 8 : 2}
        placeholder={asList && list ? `${list.left > 0 ? `${list.left} to go. ` : ''}One per line…` : placeholder}
        value={text}
        aria-label={writing ? 'Your writing' : 'Note'}
        onChange={(e) => setText(e.target.value)}
        maxLength={writing ? 20000 : 4000}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={writing || (asList && list) ? 'btn-follow' : 'btn-quiet'} disabled={busy || !text.trim()} onClick={send}>
          {writing ? 'Send writing' : asList && list ? (lines.length ? `Send ${lines.length} ${lines.length === 1 ? 'note' : 'notes'}` : 'Send notes') : 'Send note'}
        </button>
        {allowMedia && (
          <>
            <Pick label="📷 Photo" accept="image/*" capture onFiles={addFiles} />
            <Pick label="🎥 Video" accept="video/*" capture onFiles={addFiles} />
            <Pick label="🖼 Library" accept="image/*,video/*,audio/*" multiple onFiles={addFiles} />
            <VoiceNote onDone={(f) => addFiles([f])} />
            <Pick label="📎 File" accept="*/*" multiple onFiles={addFiles} />
          </>
        )}
      </div>
      {uploads.length > 0 && (
        <ul className="space-y-1" aria-label="Uploads">
          {uploads.map((u) => (
            <li key={u.id} className="rounded-xl bg-paper-sunk px-3 py-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="truncate">{u.name}</span>
                <span className="shrink-0 text-ink-soft">
                  {u.p.state === 'preparing' ? 'Encrypting…' : u.p.state === 'error' ? 'Failed' : `${Math.round((u.p.sent / Math.max(1, u.p.total)) * 100)}%`}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded bg-line"><div className="h-full bg-follow transition-all" style={{ width: `${(u.p.sent / Math.max(1, u.p.total)) * 100}%` }} /></div>
              {u.p.error && <p className="mt-1 text-stop">Not sent: {u.p.error} <button type="button" className="underline" onClick={() => dismissUpload(u.id)}>Dismiss</button></p>}
            </li>
          ))}
        </ul>
      )}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

function Pick({ label, accept, capture, multiple, onFiles }: { label: string; accept: string; capture?: boolean; multiple?: boolean; onFiles: (f: File[]) => void }) {
  return (
    <label className="btn-quiet cursor-pointer px-3 text-sm">
      {label}
      <input type="file" className="sr-only" accept={accept} multiple={multiple} {...(capture ? { capture: 'environment' as const } : {})}
        onChange={(e) => { const picked = Array.from(e.target.files ?? []); e.target.value = ''; onFiles(picked); }} />
    </label>
  );
}

/** Records a voice note in the browser (Opus/WebM, or MP4 on iPhone). */
function VoiceNote({ onDone }: { onDone: (f: File) => void }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  const [error, setError] = useState('');
  const chunks = useRef<Blob[]>([]);
  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [rec]);
  if (typeof window !== 'undefined' && !('MediaRecorder' in window)) return null;

  async function start() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = r.mimeType || 'audio/webm';
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        onDone(new File(chunks.current, `voice-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.${ext}`, { type }));
        setRec(null);
      };
      r.start(1000);
      setSecs(0);
      setRec(r);
    } catch {
      setError('Couldn’t use the microphone. Allow it for S-O-M in your phone’s settings.');
    }
  }

  return (
    <>
      {rec ? (
        <button type="button" className="btn-stop px-3 text-sm" onClick={() => rec.stop()}>■ Stop {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</button>
      ) : (
        <button type="button" className="btn-quiet px-3 text-sm" onClick={start}>🎙 Voice</button>
      )}
      {error && <span className="w-full text-sm text-stop">{error}</span>}
    </>
  );
}
