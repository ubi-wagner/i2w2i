import Link from 'next/link';
import { Intro, K, List, Section, Step, Tip } from '../ui';

export const metadata = { title: 'Getting started' };

export default function StartHelp() {
  return (
    <>
      <Intro eyebrow="Getting started" title="You got a username and password. Here’s all there is to it.">
        No app to download. You only sign in once on each phone.
      </Intro>

      <Section id="signin-first" title="If someone gave you a username and password">
        <Step n={1} title="Open i2w2i" shots={[{ src: 'start-signin.webp', alt: 'The sign-in page with a username and password typed in' }]}>
          <p>Tap the link in their message, or type <b>i2w2i.com</b> into your phone’s browser.</p>
          <p>Type your <b>username</b> and <b>password</b> exactly as you were given them, then tap <K>Sign in</K>.</p>
          <Tip><b>Tip:</b> the password is usually three words with dashes, like <i>maple-fern-lantern</i>, all lower case.</Tip>
        </Step>
        <Step n={2} title="You’re in" shots={[{ src: 'start-album.webp', alt: 'The album after signing in' }]}>
          <p>You land on the event’s album. You stay signed in on this phone, so you won’t need the password again here.</p>
          <p className="text-base text-stone-600">Want a password you’ll remember? Change it on your <Link href="/account" className="text-brand underline">account page</Link> (tap your name at the top).</p>
        </Step>
        <Step n={3} title="Look, and add your own" shots={[
          { src: 'start-photo.webp', alt: 'A photo open full screen with Next and close buttons' },
          { src: 'start-albums.webp', alt: 'Albums on the event page: Ceremony and Dinner & toasts' },
        ]}>
          <p>Tap any photo to see it big. Tap <K>Next →</K> for the next one, and <K>✕</K> to go back.</p>
          <p>If the hosts have made albums (Ceremony, Reception…), tap <K>View albums</K> at the top to look through one part of the day at a time. <b>All photos</b> has everything.</p>
          <p>To add yours, tap <K>Add photos &amp; videos</K> and choose as many as you like. They say <b>Waiting</b> until one of the hosts adds them to the album.</p>
        </Step>
        <Step n={4} title="Coming back later" shots={[{ src: 'start-install.webp', alt: 'The Put i2w2i on your home screen card with the iPhone steps' }]}>
          <p>You stay signed in on your phone. To find i2w2i again with one tap, put it on your home screen once. Your home page shows a card that walks you through it:</p>
          <List>
            <li><b>iPhone:</b> in Safari, tap the Share button (the square with an arrow), then <K>Add to Home Screen</K>.</li>
            <li><b>Android:</b> tap <K>Add to home screen</K> on the card, or the three dots <K>⋮</K> and then <K>Add to Home screen</K>.</li>
          </List>
          <p>The new i2w2i icon opens straight to your own page: your events, family albums and any other family apps you’ve been given. The first time, it may ask you to sign in: use the same username and password.</p>
        </Step>
      </Section>

      <Section id="table" title="If you scanned a card at a party" lead="No account and no password: just your name.">
        <Step n={1} title="Scan, and type your name" shots={[{ src: 'start-scan.webp', alt: 'The event page after scanning, with a box for your name and Continue' }]}>
          <p>Point your phone’s camera at the square on the card and tap the link that appears. The event’s page opens. Type your name and tap <K>Continue</K>.</p>
          <p className="text-base text-stone-600">The page tells you that your name, device and network details are recorded with what you share, so the hosts know who added what.</p>
          <Tip><b>Camera won’t scan?</b> Type the address printed on the card into your phone’s browser, then enter the code from the card.</Tip>
        </Step>
        <Step n={2} title="Add your photos and videos" shots={[{ src: 'start-waiting.webp', alt: 'Three photos added, waiting for the hosts' }]}>
          <p>Tap <K>Add photos &amp; videos</K> and pick as many as you like. Big videos are fine.</p>
          <p>Switched apps or lost signal? They pause and carry on when you come back to the page.</p>
          <p>Your photos show straight away, marked <b>Waiting</b>. Until a host approves them, only you and the hosts can see them.</p>
        </Step>
      </Section>

      <Section id="signin" title="Signing in again">
        <Step title="On a new phone or computer">
          <p>Go to <b>i2w2i.com</b>, type your username and password, and tap <K>Sign in</K>.</p>
          <p><b>Forgot your password?</b> Ask the person who added you (or Eric) to reset it. They’ll give you a new one; nothing is emailed.</p>
          <p>Your <Link href="/account" className="text-brand underline">account page</Link> (tap your name at the top) is where you change your name, username or password, turn on notifications, or sign out of a phone you no longer have.</p>
        </Step>
      </Section>
    </>
  );
}
