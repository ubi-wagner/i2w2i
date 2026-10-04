'use client';

import { useEffect } from 'react';

/**
 * If a screen breaks, this shows instead of a blank page: try again, or go
 * back to your scenes. Nothing is lost by either (everything is saved on the
 * server as you go).
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="card mx-auto mt-10 max-w-md space-y-3 text-center">
      <p className="font-display text-xl">Something went wrong on this screen.</p>
      <p className="text-sm text-ink-soft">Your scenes are safe. Try again, or go back to your scenes.</p>
      <div className="flex justify-center gap-2">
        <button type="button" className="btn" onClick={reset}>Try again</button>
        <a href="/" className="btn-quiet">Back to scenes</a>
      </div>
    </div>
  );
}
