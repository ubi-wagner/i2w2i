import Link from 'next/link';
import { Intro } from './ui';

export const metadata = { title: 'Help' };

const GUIDES = [
  {
    href: '/help/start',
    title: 'Getting started',
    who: 'For everyone',
    text: 'Opening the link you were sent, picking a password, seeing and adding photos, and putting i2w2i on your phone.',
  },
  {
    href: '/help/hosting',
    title: 'Running an event',
    who: 'For hosts and helpers',
    text: 'Your event page, inviting people, QR cards for the tables, approving photos and choosing who sees the album.',
  },
  {
    href: '/help/faq',
    title: 'Questions',
    who: 'Quick answers',
    text: 'A forgotten password, a card that won’t scan, a photo that shouldn’t be there, notifications, and more.',
  },
];

export default function HelpHome() {
  return (
    <>
      <Intro eyebrow="i2w2i help" title="How can we help?">
        i2w2i is the family’s private home for event albums, and for the family apps to come. There’s nothing to download from an app store, and nothing is ever emailed.
      </Intro>

      <ul className="grid gap-4 sm:grid-cols-3">
        {GUIDES.map((g) => (
          <li key={g.href} className="card relative space-y-2 transition hover:border-brand hover:shadow-md">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">{g.who}</p>
            <h2 className="text-xl font-semibold">
              <Link href={g.href} className="after:absolute after:inset-0">{g.title}</Link>
            </h2>
            <p className="text-base text-stone-600">{g.text}</p>
            <p aria-hidden="true" className="text-base font-medium text-brand">Read it →</p>
          </li>
        ))}
      </ul>

      <section className="card space-y-3">
        <h2 className="text-xl font-semibold">The short version</h2>
        <ul className="space-y-2">
          <li><b>Got a link in a text?</b> Tap it, pick a password, and you’re in.</li>
          <li><b>At a party?</b> Scan the card on the table with your phone’s camera and type your name. No account needed.</li>
          <li><b>Coming back?</b> Go to <b>i2w2i.com</b> and sign in with your email and password, or tap the i2w2i icon on your phone.</li>
          <li><b>Hosting?</b> Start with <Link href="/help/hosting" className="text-brand underline">Running an event</Link>.</li>
        </ul>
      </section>
    </>
  );
}
