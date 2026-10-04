import { requireAccount } from '@/lib/server/auth';
import { Shell } from '@/components/Shell';
import { MenuEditor } from '@/components/MenuEditor';

export const metadata = { title: 'Menu' };

export default async function Page() {
  await requireAccount();
  return <Shell><MenuEditor /></Shell>;
}
