import { JoinFlow } from './JoinFlow';

export const metadata = { title: 'Join' };

// Opened from the key link a partner sent. The key itself is in the link's
// #fragment, which the browser never sends here; the page reads it.
export default function JoinPage() {
  return <JoinFlow />;
}
