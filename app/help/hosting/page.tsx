import { Intro, K, List, Section, Step, Tip } from '../ui';

export const metadata = { title: 'Running an event' };

const ROUTE = [
  ['#create', 'Create the event', 'Name and web address'],
  ['#page', 'Make the page', 'Look, wording, directions'],
  ['#invite', 'Add people', 'Co-hosts, family, friends'],
  ['#cards', 'Print QR cards', 'For the tables'],
  ['#photos', 'Photos come in', 'You approve them'],
  ['#publish', 'Publish', 'Choose who sees it'],
] as const;

const Y = ({ children = 'Yes' }: { children?: React.ReactNode }) => <td className="px-4 py-2.5 font-semibold text-green-800">{children}</td>;
const N = () => <td className="px-4 py-2.5 text-stone-400">No</td>;
const T = ({ children }: { children: React.ReactNode }) => <td className="px-4 py-2.5">{children}</td>;

export default function HostingHelp() {
  return (
    <>
      <Intro eyebrow="For hosts and helpers" title="Running an event album">
        A private photo album for a party, a shower or a wedding. Guests add photos by scanning a card on the table. You approve what goes in, then choose who gets to see it.
      </Intro>

      <ol aria-label="The steps" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {ROUTE.map(([href, title, sub], i) => (
          <li key={href}>
            <a href={href} className="grid h-full gap-0.5 rounded-xl border border-stone-200 bg-white px-3 py-2.5 hover:border-brand">
              <span className="text-2xl font-semibold leading-none text-brand">{i + 1}</span>
              <b className="text-base leading-snug">{title}</b>
              <span className="text-sm leading-snug text-stone-500">{sub}</span>
            </a>
          </li>
        ))}
      </ol>
      <p className="text-base text-stone-600">Plus: <a href="#phone" className="text-brand underline">put i2w2i on your phone and get notified</a> when photos arrive.</p>

      <Section id="create" eyebrow="Step 1" title="Create the event">
        <Step title="New event" shots={[{ src: 'host-new-event.webp', alt: 'The New event form' }]}>
          <p>Sign in at <b>i2w2i.com</b>. On your home page, tap <K>New event</K>.</p>
          <List>
            <li><b>Event name:</b> write two names with an “&amp;” (“Sam &amp; Riley”) and the fancier looks set the “&amp;” in script.</li>
            <li><b>Album web address</b> fills itself in. It’s the link people will use, so keep it short.</li>
            <li>Date, place and a welcome message are optional. You can change everything later.</li>
          </List>
          <p>Tap <K>Create event</K>. It starts as a private draft.</p>
          <Tip>Eric (the family admin) and the people he has made <b>creators</b> can create events. Co-hosts run the events they’re on.</Tip>
        </Step>
      </Section>

      <Section id="page" eyebrow="Step 2" title="Make the page yours" lead={<>The event opens on its <b>Manage</b> page. Near the top, <b>Your event page</b> holds everything guests see, with a live phone preview beside it.</>}>
        <Step title="Your event page" wide shots={[{ src: 'host-editor.webp', alt: 'The page editor with its live phone preview' }]}>
          <List ordered>
            <li><b>Look:</b> Enchanted forest, Garden or Classic. It’s used on the album, the page guests land on and the printed cards.</li>
            <li><b>Invitation:</b> tap <K>Use wedding wording</K> for a start, or write your own lines. Empty lines are skipped.</li>
            <li><b>Directions:</b> a street address adds a <K>Directions</K> button (Google Maps, Apple Maps, Waze).</li>
            <li><b>Schedule</b> and <b>Good to know</b> (dress code, parking, hotel) add their own buttons.</li>
            <li><b>Gifts:</b> a short note shown above your Venmo or registry links, which you add under <b>Gifts &amp; payments</b> further down.</li>
          </List>
          <p>Tap <K>Save page</K>. Guests see it right away. If you forget, it says <i>Unsaved changes</i>.</p>
        </Step>
        <Step title="What guests get" shots={[
          { src: 'host-directions.webp', alt: 'Directions card with Google Maps, Apple Maps and Waze', caption: 'Directions' },
          { src: 'host-schedule.webp', alt: 'Schedule card with times', caption: 'Schedule' },
          { src: 'host-info.webp', alt: 'Good to know card with the dress code', caption: 'Good to know' },
          { src: 'host-gift.webp', alt: 'Send a gift card with a Venmo link and its QR code', caption: 'Send a gift' },
        ]}>
          <p>The buttons under the invitation open a small card. Money from <K>Send a gift</K> goes straight to you through Venmo, PayPal or Cash App; i2w2i never touches it.</p>
        </Step>
      </Section>

      <Section id="invite" eyebrow="Step 3" title="Add people" lead="For anyone who should have their own sign-in: co-hosts, the wedding party, family. You give each one a username and password; there’s no email.">
        <Step title="People on this event" shots={[
          { src: 'host-people.webp', alt: 'People on this event, with the Add someone new form filled in' },
          { src: 'host-invited.webp', alt: 'The new person’s username and password, with Copy message' },
        ]}>
          <p>Under <b>People on this event</b>, in <b>Add someone new</b>, type their name. A username and a starting password are filled in for you; change either if you like. Pick a role and tap <K>Add to this event</K>:</p>
          <List>
            <li><b>Co-host:</b> runs everything for this event, like you.</li>
            <li><b>Helper:</b> approves, hides and stars photos and edits the page.</li>
            <li><b>Guest:</b> sees the album, adds photos and joins the group chat.</li>
          </List>
          <p>You get a box with their username and password. On a phone, tap <K>Text it to…</K>; on a laptop, <K>Copy message</K> and paste it into a text, or just read it out. The message has the link to sign in; they land in the album.</p>
          <p>Someone who already has an account? Pick them under <b>Or add someone who already has an account</b> instead.</p>
          <Tip>Forgot their password? Tap <K>Reset password</K> under their name and pass on the new one. You can do that for people you added; Eric can for anyone.</Tip>
        </Step>
      </Section>

      <Section id="cards" eyebrow="Step 4" title="Print QR cards for the tables" lead="For guests without an account: they scan, type their name and they’re in.">
        <Step title="Guest codes & QR cards" shots={[
          { src: 'host-code.webp', alt: 'A code with its QR and the Print card link' },
          { src: 'host-card.webp', alt: 'The printable table card' },
        ]}>
          <p>Under <b>Guest codes &amp; QR cards</b>, type a short code (like <b>PARTY</b>) and a note for yourself. Leave both boxes ticked. Tap <K>Create code + QR</K>.</p>
          <p>Then tap <K>Print card</K> and <K>Print</K>. The card is in the event’s look, with the QR on white so every phone can read it. Anyone whose camera won’t scan can type the address and the code instead.</p>
          <Tip>Turn on <i>Background graphics</i> in the print settings. Print one, scan it with your phone, then print the rest.</Tip>
          <p>The <K>Album card</K> at the top of Manage is the same idea for the album itself, once it’s published to the family or to everyone.</p>
        </Step>
      </Section>

      <Section id="photos" eyebrow="Step 5" title="Photos come in, and you approve them" lead="Nobody sees anyone else’s photo until a host has looked at it. That’s enforced by the database itself, not just the screens.">
        <Step title="Adding photos" shots={[
          { src: 'start-scan.webp', alt: 'The page a guest sees after scanning' },
          { src: 'start-waiting.webp', alt: 'Uploads finished, waiting for the hosts' },
        ]}>
          <p>On the album, tap <K>Add photos &amp; videos</K> and pick as many as you like. It’s the same for you, invited people and table guests. Uploads keep going if someone switches apps or loses signal.</p>
          <p>Guests see their own photos straight away, marked <b>Waiting</b>, with a note that only they and the hosts can see them for now. Photos that co-hosts and helpers add go in without review.</p>
        </Step>
        <Step title="Approving" shots={[
          { src: 'host-queue.webp', alt: 'Waiting for your OK, with Approve all photos' },
          { src: 'host-review.webp', alt: 'A photo open with Approve, Hide, Star and Delete' },
        ]}>
          <p>When something is waiting, your event card says <b>“3 waiting for your OK”</b> and Manage shows a yellow banner. Tap <K>Review</K>, then either:</p>
          <List>
            <li><K>Approve all photos</K> after a look at the grid, or</li>
            <li>tap a photo and use <K>Approve ✓</K>, which moves on to the next one, or <K>Hide</K> or <K>Delete</K>.</li>
          </List>
          <Tip warn>A photo that just arrived shows <b>“OK in 8 min”</b>. For a few minutes after uploading, the guest’s phone could still change it, so it can’t be approved yet. Once approved, nobody can swap it.</Tip>
        </Step>
        <Step title="Afterwards: tidy and keep" shots={[{ src: 'host-photos.webp', alt: 'Photos with two selected and the Download, Hide and Star buttons' }]}>
          <p>In Manage, under <b>Photos &amp; videos</b>, tap <K>Select</K>, then tap photos, or <K>All</K>, or <K>Select day</K>. Then:</p>
          <List>
            <li><K>Download</K> saves a zip of the full-quality originals.</li>
            <li><K>Star</K> puts favourites first in the album.</li>
            <li><K>Hide</K> takes a photo out of the album; <K>Show</K> puts it back.</li>
          </List>
          <p>Each table guest is listed under <b>Guests</b> with their name and phone, and <K>Remove</K> if someone shouldn’t be there.</p>
        </Step>
      </Section>

      <Section id="publish" eyebrow="Step 6" title="Publish: choose who sees it" lead="Approved photos are always visible to people on the event, and to table guests whose code has “Can see the album” ticked. Publishing opens it wider.">
        <Step title="Publishing" shots={[{ src: 'host-published.webp', alt: 'Publishing set to the whole family' }]}>
          <p>Under <b>Publishing</b>, set <K>Published</K>, choose who, and tap <K>Save</K>:</p>
          <List>
            <li><b>Guests &amp; code holders:</b> just the people above.</li>
            <li><b>Whole family:</b> every family account, signed in. It shows on their home page under <i>Family albums</i>.</li>
            <li><b>Anyone with the link:</b> a public page. Still only approved photos, and visitors can’t add anything or download originals.</li>
          </List>
          <p>Change your mind any time; it takes effect immediately.</p>
        </Step>
      </Section>

      <Section id="phone" eyebrow="On your phone" title="An i2w2i icon, and a buzz when photos arrive" lead="i2w2i works in any browser, but on a phone it’s nicer as an app: one tap opens your albums, and hosts can be told when guests’ photos are waiting.">
        <Step title="Put it on your home screen" shots={[{ src: 'start-install.webp', alt: 'The Put i2w2i on your home screen card with the iPhone steps' }]}>
          <p>Signed-in people see a <b>Put i2w2i on your home screen</b> card on their home page and in their albums.</p>
          <List>
            <li><b>iPhone:</b> tap the Share button (the square with an arrow) in Safari, then <K>Add to Home Screen</K>.</li>
            <li><b>Android:</b> tap <K>Add to home screen</K> on the card.</li>
          </List>
          <p>The icon opens full screen to their own page: the events they’re on, family albums, and any other family apps they’ve been given. If it asks them to sign in the first time, they do it once and stay signed in. Guests at the tables don’t need any of this; they just scan.</p>
        </Step>
        <Step title="Get notified when photos wait for you" shots={[
          { src: 'host-notify.webp', alt: 'Turn on notifications on the Manage page' },
          { src: 'host-notify-iphone.webp', alt: 'The iPhone explanation: add i2w2i to the home screen first' },
        ]}>
          <p>Hosts and helpers: on the event’s Manage page (or your account page), tap <K>Turn on notifications</K> and allow them. Do it once on each phone.</p>
          <p>When guests add photos you’ll get one notification like <b>“Sam &amp; Riley: 12 new photos are waiting for your OK”</b>, at most every couple of minutes. Tapping it opens the photos to approve. <K>Send a test</K> checks it works.</p>
          <Tip warn><b>iPhone:</b> notifications only work from the home-screen icon (Apple’s rule). Add i2w2i to your home screen, open it from the icon, then turn notifications on.</Tip>
        </Step>
      </Section>

      <Section id="who" eyebrow="At a glance" title="Who can do what">
        <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white break-inside-avoid">
          <table className="w-full min-w-[640px] border-collapse text-left text-base">
            <thead className="text-xs uppercase tracking-wider text-stone-500">
              <tr className="border-b border-stone-200">
                {['Person', 'Add photos', 'See photos', 'Approve, hide', 'Page & publishing', 'Invite & QR codes'].map((h) => <th key={h} scope="col" className="px-4 py-2.5 font-bold">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 align-top">
              <tr><th scope="row" className="px-4 py-2.5 font-semibold">Admin (Eric)</th><Y /><T>Everything</T><Y /><Y /><Y>Yes, any event</Y></tr>
              <tr><th scope="row" className="px-4 py-2.5 font-semibold">Co-host</th><Y>Yes, no review</Y><T>Everything</T><Y /><Y /><Y /></tr>
              <tr><th scope="row" className="px-4 py-2.5 font-semibold">Helper</th><Y>Yes, no review</Y><T>Everything</T><Y /><Y /><N /></tr>
              <tr><th scope="row" className="px-4 py-2.5 font-semibold">Guest (invited)</th><Y>Yes, reviewed</Y><T>Own + approved</T><N /><N /><N /></tr>
              <tr><th scope="row" className="px-4 py-2.5 font-semibold">Table guest (code)</th><Y>Yes, reviewed</Y><T>Own + approved*</T><N /><N /><N /></tr>
              <tr><th scope="row" className="px-4 py-2.5 font-semibold">Family, not on the event</th><N /><T>Approved, if published to the family</T><N /><N /><N /></tr>
              <tr><th scope="row" className="px-4 py-2.5 font-semibold">Anyone with the link</th><N /><T>Approved, if published to everyone</T><N /><N /><N /></tr>
            </tbody>
          </table>
        </div>
        <p className="text-base text-stone-600">* If the code’s “Can see the album” box is unticked, table guests only ever see their own photos.</p>
      </Section>
    </>
  );
}
