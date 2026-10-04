import { requireAccount } from '@/lib/server/auth';
import { Shell } from '@/components/Shell';
import { Settings } from '@/components/Settings';

export const metadata = { title: 'Settings' };

export default async function Page() {
  await requireAccount();
  return <Shell><Settings /></Shell>;
}
