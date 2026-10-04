import { requireAccount } from '@/lib/server/auth';
import { Shell } from '@/components/Shell';
import { Profiles } from '@/components/Profiles';

export const metadata = { title: 'Us' };

export default async function Page() {
  await requireAccount();
  return <Shell><Profiles /></Shell>;
}
