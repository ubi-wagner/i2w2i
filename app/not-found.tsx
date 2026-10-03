import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-3xl font-bold text-brand">i2w2i</p>
      <h1 className="text-2xl font-semibold">We couldn’t find that page</h1>
      <p className="max-w-sm text-stone-600">If someone sent you a link, check it was copied in full, or ask them to send it again.</p>
      <Link href="/" className="btn">Home</Link>
    </main>
  );
}
