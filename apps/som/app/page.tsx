import { requireAccount } from '@/lib/server/auth';
import { Shell } from '@/components/Shell';
import { Home } from '@/components/Home';

export const metadata = { title: { absolute: 'S-O-M' } };

export default async function Page() {
  await requireAccount();
  return <Shell><Home /></Shell>;
}
