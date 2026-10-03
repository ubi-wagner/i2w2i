'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="max-w-sm text-stone-600">Sorry about that. Your uploads are safe; try again, and if it keeps happening let Eric know.</p>
      {error.digest && <p className="font-mono text-xs text-stone-400">Reference {error.digest}</p>}
      <div className="flex gap-3">
        <button type="button" className="btn" onClick={reset}>Try again</button>
        <Link href="/" className="btn-secondary">Home</Link>
      </div>
    </main>
  );
}
