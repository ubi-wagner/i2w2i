import Link from 'next/link';
import { Intro, K, Question, Section } from '../ui';

export const metadata = { title: 'Questions' };

export default function FaqHelp() {
  return (
    <>
      <Intro eyebrow="Questions" title="Quick answers">
        <span className="print:hidden">Tap a question to see the answer.</span>
      </Intro>

      <Section id="everyone" title="For everyone">
        <div className="space-y-3">
          <Question q="I forgot my password" open>
            <p>Ask the person who added you (or Eric) to reset it. They’ll give you a new one; nothing is emailed.</p>
            <p>Usernames and passwords are lower case. Check there are no spaces before or after.</p>
          </Question>
          <Question q="Can I change my username or password?">
            <p>Yes. Sign in, tap your name at the top to open your account page, and change either one. Changing your password signs you out on your other phones and computers.</p>
          </Question>
          <Question q="Do I need to download an app?">
            <p>No. i2w2i works in your phone’s web browser. If you’d like an icon on your home screen, see <Link href="/help/start#signin-first" className="text-brand underline">Coming back later</Link>.</p>
          </Question>
          <Question q="Why does my photo say “Waiting”?">
            <p>Every photo a guest adds is looked at by one of the hosts before anyone else can see it. Until then, only you and the hosts can see it. Nothing is wrong; it just hasn’t been approved yet.</p>
          </Question>
          <Question q="Who can see my photos?">
            <p>Once approved: the people on the event, guests from the tables (if the hosts allow it), and anyone else the hosts choose to share the album with: the whole family, or anyone with the link.</p>
            <p>Before it’s approved: only you and the hosts.</p>
          </Question>
          <Question q="Are my photos changed?">
            <p>No. Your originals are kept exactly as taken. Frames and filters only change how a photo shows in the album. For photos, the album copy that others see has the camera and location details removed. Only the hosts and you can download the original.</p>
          </Question>
          <Question q="My camera won’t scan the card">
            <p>Type the address printed on the card into your phone’s browser, then enter the code from the card. It does the same thing.</p>
          </Question>
          <Question q="What is recorded about me?">
            <p>Guests are told on the page they scan into: your name, device and network details are recorded with anything you share, so the hosts know who added what. Family accounts are recorded the same way.</p>
          </Question>
          <Question q="I used a computer that isn’t mine">
            <p>Tap <K>Sign out</K> at the top before you leave. Lost a phone you were signed in on? On your account page, tap <K>Sign out everywhere</K>.</p>
          </Question>
        </div>
      </Section>

      <Section id="hosts" title="For hosts">
        <div className="space-y-3">
          <Question q="Someone forgot their password">
            <p>Under <b>People on this event</b>, tap <K>Reset password</K> under their name and pass on the new one, just like when you added them. Their old password stops working. You can do this for people you added; Eric can for anyone.</p>
          </Question>
          <Question q="Who can approve photos?">
            <p>Co-hosts, helpers and Eric. Photos that co-hosts and helpers add themselves go straight in.</p>
          </Question>
          <Question q="A photo shouldn’t be in the album">
            <p>If it’s still waiting, nobody but you and the person who added it has seen it: just tap <K>Delete</K>. If it was already approved, open it in Manage and tap <K>Hide</K>; everyone else stops seeing it right away.</p>
          </Question>
          <Question q="Someone is posting things they shouldn’t">
            <p>Under <b>Guests</b>, tick <i>hide their uploads</i> and tap <K>Remove</K>. Their name, phone and network are recorded with everything they shared.</p>
          </Question>
          <Question q="The QR cards got out somewhere they shouldn’t">
            <p>Under <b>Guest codes &amp; QR cards</b>, tap <K>Replace QR</K> and print new cards; the old ones stop working. <K>Turn off typed code</K> does the same for the code typed by hand.</p>
          </Question>
          <Question q="Notifications aren’t arriving">
            <p>On the Manage page, tap <K>Send a test</K>. If nothing comes:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><b>iPhone:</b> open i2w2i from its home-screen icon, not from Safari, and turn notifications on there.</li>
              <li>If the page says notifications are blocked, allow them for i2w2i in your phone’s settings, then come back and tap <K>Turn on notifications</K>.</li>
            </ul>
            <p>Each phone has to be turned on once.</p>
          </Question>
          <Question q="Getting everything at the end">
            <p>Under <b>Photos &amp; videos</b>, tap <K>Select</K>, then <K>All</K> (or <K>Select day</K>), then <K>Download</K> for a zip of the full-quality originals.</p>
          </Question>
          <Question q="Gifts and money">
            <p>Venmo, PayPal, Cash App and registry links show as buttons with a QR code each. Money goes straight to the person; i2w2i never handles it.</p>
          </Question>
        </div>
      </Section>
    </>
  );
}
