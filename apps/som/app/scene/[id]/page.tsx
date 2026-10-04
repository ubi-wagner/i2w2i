import { notFound } from 'next/navigation';
import { requireAccount } from '@/lib/server/auth';
import { Shell } from '@/components/Shell';
import { ScenePage } from '@/components/scene/ScenePage';

export const metadata = { title: 'Scene' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAccount();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  return <Shell><ScenePage id={id} /></Shell>;
}
