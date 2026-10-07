import { Intro, K, List, Section, Step, Tip } from '../ui';

export const metadata = { title: 'Running an event' };

const ROUTE = [
  ['#create', 'Create the event', 'Name and web address'],
  ['#manage', 'Find your way', 'The Manage tabs'],
  ['#page', 'Make the page', 'Look, wording, directions'],
  ['#invite', 'Add people', 'Co-hosts, editors, viewers'],
  ['#cards', 'QR cards & posters', 'Tables and the door'],
  ['#photos', 'Photos come in', 'You approve them'],
  ['#albums', 'Albums & slideshow', 'Ceremony, Reception…'],
  ['#publish', 'Publish', 'Choose who sees it'],
] as const;

const Y = ({ children = 'Yes' }: { children?: React.ReactNode }) => <td className="px-4 py-2.5 font-semibold text-green-800">{children}</td>;
const N = () => <td className="px-4 py-2.5 text-stone-400">No</td>;
const T = ({ children }: { children: React.ReactNode }) => <td className="px-4 py-2.5">{children}</td>;

export default function HostingHelp() {
  return (
    <>
      <Intro eyebrow="For co-hosts and editors" title="Running an event album">
        A private photo album for a party, a shower or a wedding. Guests add photos by scanning a card on the table. You approve what goes in, sort the best into albums, then choose who gets to see them.
      </Intro>

      <ol aria-label="The steps" className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
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
          <p>Sign in at <b>i2w2i.com</b>. On your home page, tap <K>+ New event</K> (or <b>Plan your own event</b>, beside any events you’ve been added to).</p>
          <List>
            <li><b>Event name:</b> write two names with an “&amp;” (“Sam &amp; Riley”) and the fancier looks set the “&amp;” in script.</li>
            <li><b>Album web address</b> fills itself in. It’s the link people will use, so keep it short.</li>
            <li>Date, place and a welcome message are optional. You can change everything later.</li>
          </List>
          <p>Tap <K>Create event</K>. It starts as a private draft.</p>
          <Tip>Eric (the family admin) and the people he has made <b>creators</b> can create events. Co-hosts run the events they’re on.</Tip>
        </Step>
      </Section>

      <Section id="manage" eyebrow="Step 2" title="Find your way around Manage" lead="The event opens on its Manage page. Each job has its own tab, so nothing is buried at the bottom of a long page.">
        <Step title="The tabs" shots={[{ src: 'host-tabs.webp', alt: 'The Manage page: the event name, Open album, Copy album link and the row of tabs' }]}>
          <p>At the top: the event’s name, <K>Open album</K> (the page guests see) and <K>Copy album link</K>. Under them, the tabs. On a phone, swipe the row sideways for the rest.</p>
          <List>
            <li><b>Overview:</b> what’s waiting, how far along you are, a checklist of what’s left, <b>Publishing</b> and notifications.</li>
            <li><b>Landing page</b> and <b>Event info:</b> what guests see (step 3).</li>
            <li><b>People:</b> co-hosts, editors and viewers, and the guests who joined with a code (step 4).</li>
            <li><b>Photos:</b> a number shows how many wait for your OK (step 6).</li>
            <li><b>Albums:</b> named albums like “Ceremony” (step 7).</li>
            <li><b>QR &amp; posters:</b> guest codes, table cards and door posters (step 5). Co-hosts only.</li>
            <li><b>Activity:</b> who did what, and when.</li>
          </List>
        </Step>
      </Section>

      <Section id="page" eyebrow="Step 3" title="Make the page yours" lead="Two tabs hold everything guests see, each with a live phone preview beside it.">
        <Step title="Landing page" wide shots={[{ src: 'host-editor.webp', alt: 'The Landing page tab with its live phone preview' }]}>
          <List ordered>
            <li><b>Look:</b> Enchanted forest, Garden or Classic. It’s used on the album, the page guests land on and the printed cards and posters.</li>
            <li><b>Invitation:</b> tap <K>Use wedding wording</K> for a start, or write your own lines. Empty lines are skipped.</li>
            <li><b>Welcome:</b> a few words under the invitation.</li>
          </List>
          <p>Tap <K>Save page</K>. Guests see it right away. If you forget, it says <i>Unsaved changes</i>.</p>
        </Step>
        <Step title="Event info" wide shots={[{ src: 'host-event-info.webp', alt: 'The Event info tab: address, schedule and good to know, with the preview' }]}>
          <List>
            <li><b>Directions:</b> a street address adds a <K>Directions</K> button (Google Maps, Apple Maps, Waze).</li>
            <li><b>Schedule</b> and <b>Good to know</b> (dress code, parking, hotel) add their own buttons.</li>
            <li><b>Gifts:</b> a short note shown above your Venmo or registry links, which co-hosts add under <b>Gifts &amp; payments</b> further down the same tab.</li>
          </List>
          <p>Tap <K>Save event info</K>. Only people who can see the album get the address.</p>
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

      <Section id="invite" eyebrow="Step 4" title="Add people" lead="For anyone who should have their own sign-in: co-hosts, the wedding party, family. You give each one a username and password; there’s no email. Only co-hosts add people and change roles.">
        <Step title="Add someone new" shots={[
          { src: 'host-add.webp', alt: 'Add someone new, filled in, with Their role set to Viewer' },
          { src: 'host-invited.webp', alt: 'The new person’s username and password, with Copy message' },
        ]}>
          <p>On the <b>People</b> tab, under <b>Add people</b>, type their name. A username and a starting password are filled in for you; change either if you like. Pick a role and tap <K>Add to this event</K>:</p>
          <List>
            <li><b>Co-host:</b> runs everything for this event, like you: people, guest codes and QR, gifts, the page, photos and albums.</li>
            <li><b>Editor:</b> approves, hides and stars photos, makes and publishes albums, and edits the page.</li>
            <li><b>Viewer:</b> sees the album, adds photos (a co-host or editor approves them) and joins the group chat.</li>
          </List>
          <p>You get a box with their username and password. On a phone, tap <K>Text it to…</K>; on a laptop, <K>Copy message</K> and paste it into a text, or just read it out. The message has the link to sign in; they land in the album.</p>
          <p>Someone who already has an account? Pick them under <b>Add someone who already has an account</b>, choose their role and tap <K>Add</K>.</p>
        </Step>
        <Step title="Change someone’s role" shots={[{ src: 'host-people.webp', alt: 'People on this event, with Jo Kim just changed to Editor and Saved: now an editor' }]}>
          <p>Under <b>People on this event</b>, pick a new role next to their name. It saves straight away and says <b>Saved</b>; there’s no button to press. <K>Remove</K> takes them off the event.</p>
          <p>An event always keeps at least one co-host, so the last one can’t be changed or removed.</p>
          <Tip>Forgot their password? Tap <K>Reset password</K> under their name and pass on the new one. You can do that for people you added; Eric can for anyone.</Tip>
        </Step>
      </Section>

      <Section id="cards" eyebrow="Step 5" title="QR cards for the tables, a poster for the door" lead="For guests without an account: they scan, type their name and they’re in. All of it is on the QR & posters tab.">
        <Step title="Guest codes & QR cards" shots={[
          { src: 'host-code.webp', alt: 'A code with its QR and the Print card and Print poster buttons' },
          { src: 'host-card.webp', alt: 'The printable table card' },
        ]}>
          <p>Under <b>Guest codes &amp; QR cards</b>, type a short code (like <b>PARTY</b>) and a note for yourself. Leave both boxes ticked. Tap <K>Create code + QR</K>.</p>
          <p>Then tap <K>Print card</K> and <K>Print</K>. The card is in the event’s look, with the QR on white so every phone can read it. Anyone whose camera won’t scan can type the address and the code instead.</p>
          <Tip>Turn on <i>Background graphics</i> in the print settings. Print one, scan it with your phone, then print the rest.</Tip>
        </Step>
        <Step title="A poster for the door" shots={[{ src: 'host-poster.webp', alt: 'The full-page poster: Share your photos & videos, the names, a big QR and three steps' }]}>
          <p>Tap <K>Print poster</K> next to the code for a full page to put on an easel, by the bar or at the guest book: the event in its look, a big QR, three steps and the typed code for anyone without a camera.</p>
          <p>It’s set for US Letter; tap <K>use A4</K> for A4 paper. It always fits on one sheet.</p>
          <p>Further down, <b>The album’s own link</b> has an <K>Album card</K> and <K>Album poster</K> for the album itself, once it’s published to the family or to everyone.</p>
        </Step>
      </Section>

      <Section id="photos" eyebrow="Step 6" title="Photos come in, and you approve them" lead="Nobody sees anyone else’s photo until a co-host or editor has looked at it. That’s enforced by the database itself, not just the screens.">
        <Step title="Adding photos" shots={[
          { src: 'start-scan.webp', alt: 'The page a guest sees after scanning' },
          { src: 'start-waiting.webp', alt: 'Uploads finished, waiting for the hosts' },
        ]}>
          <p>On the album, tap <K>Add photos &amp; videos</K> and pick as many as you like. It’s the same for you, invited people and table guests. Uploads keep going if someone switches apps or loses signal.</p>
          <p>Guests see their own photos straight away, marked <b>Waiting</b>, with a note that only they and the hosts can see them for now. Photos that co-hosts and editors add go in without review.</p>
        </Step>
        <Step title="Approving, and posting to albums" shots={[
          { src: 'host-queue.webp', alt: 'Waiting for your OK, with Approve all photos' },
          { src: 'host-review.webp', alt: 'A waiting photo open, with Post it to: Ceremony picked, and Approve & post to the album' },
        ]}>
          <p>When something is waiting, your event card says <b>“3 waiting for your OK”</b>, the Overview shows a yellow banner and the <b>Photos</b> tab shows a number. On the Photos tab, under <b>Waiting for your OK</b>, either:</p>
          <List>
            <li><K>Approve all photos</K> after a look at the grid, or</li>
            <li>tap a photo. Under <b>Post it to</b>, tap the albums it belongs in (<K>+ New album</K> makes one on the spot), then <K>Approve &amp; post to the album</K>. With no album picked it’s just <K>Approve ✓</K>. The next one comes up by itself. <K>Hide</K> and <K>Delete</K> are underneath.</li>
          </List>
          <p>Clicking through the album itself works the same: as a co-host or editor, a waiting photo shows the same panel there.</p>
          <Tip warn>A photo that just arrived shows <b>“OK in 8 min”</b>. For a few minutes after uploading, the guest’s phone could still change it, so it can’t be approved yet. Once approved, nobody can swap it.</Tip>
        </Step>
        <Step title="Afterwards: tidy and keep" shots={[{ src: 'host-photos.webp', alt: 'Photos with two selected and the Download, Hide, Star and Add to album buttons' }]}>
          <p>On the Photos tab, under <b>Photos &amp; videos</b>, tap <K>Select</K>, then tap photos, or <K>All</K>, or <K>Select day</K>, or pick everything from one person. Then:</p>
          <List>
            <li><K>Download</K> saves a zip of the full-quality originals.</li>
            <li><K>Add to album…</K> files them into an album.</li>
            <li><K>Star</K> puts favourites first.</li>
            <li><K>Hide</K> takes a photo out of the album and every named album; <K>Show</K> puts it back.</li>
          </List>
          <p>Each table guest is listed on the People tab under <b>Guests</b> with their name and phone, and <K>Remove</K> if someone shouldn’t be there.</p>
        </Step>
      </Section>

      <Section id="albums" eyebrow="Step 7" title="Albums: Ceremony, Reception, the dance floor…" lead="Every approved photo is in the event’s main album. Named albums are your picks from it, for guests to browse one part of the day at a time.">
        <Step title="Make and fill albums" shots={[{ src: 'host-albums.webp', alt: 'The Albums tab with Ceremony and Dinner & toasts, both published' }]}>
          <p>On the <b>Albums</b> tab, give it a name and, if you like, a line about it. Tap <K>Make album</K>. It starts as a <b>Draft</b>: only co-hosts and editors see it.</p>
          <p>Put photos in it any of these ways:</p>
          <List>
            <li>while approving, with <K>Approve &amp; post to the album</K> (<K>+ New album</K> there makes one on the spot: type its name and tap <K>Make</K>);</li>
            <li>on any approved photo, tap the album’s name under <b>In albums</b> (a ✓ means it’s in);</li>
            <li><K>Edit &amp; add photos</K>, then <K>Select</K>, pick them and tap <K>Add to “Ceremony”</K>.</li>
          </List>
          <p>On the album’s own page, open a photo for <K>Use as album cover</K> or <K>Take out of this album</K>. Taking a photo out of an album leaves it in the event.</p>
          <p>Use <K>↑</K> and <K>↓</K> to set the order guests see. <K>Delete album</K> removes the album but never its photos. Renaming keeps its link, so shared links still work.</p>
        </Step>
        <Step title="Publish it: private or public" shots={[{ src: 'host-album-public.webp', alt: 'An album’s page: Unpublish, Who can see it set to Public, and its own link with a QR' }]}>
          <p>When it’s ready, tap <K>Publish album</K>, then choose <b>Who can see it</b>. It saves as soon as you pick:</p>
          <List>
            <li><b>Private:</b> whoever can see the event (its people, guests with a code, and the family or everyone if you published the event to them).</li>
            <li><b>Public:</b> anyone with the album’s link, even without a code or an account, while the rest of the event stays private. They see only that album’s approved photos, and its slideshow; no other photos, no address, no chat.</li>
          </List>
          <p>A published album shows its own link with a QR code to copy or scan. <K>Unpublish</K> takes it down again, and making it private again closes the link straight away.</p>
        </Step>
        <Step title="What guests see" shots={[{ src: 'start-albums.webp', alt: 'Albums on the event page: Ceremony, 2 photos, and Dinner & toasts, 4 photos' }]}>
          <p>Once an album is published and has a photo in it, the event page gets a <K>View albums</K> button and an <b>Albums</b> section with a card for each. Each card opens the album’s own page with just its photos. Everything approved is still under <b>All photos</b>.</p>
          <p>Public albums are also listed under <b>Albums anyone can see</b> on the event’s page for visitors who haven’t joined, below the box for the code.</p>
          <p>An album never shows anyone a photo that’s waiting or hidden.</p>
        </Step>
        <Step title="Slideshow, on a TV or a laptop" wide shots={[
          { src: 'host-slideshow.webp', alt: 'A photo full screen on a laptop, with a wide white border' },
        ]}>
          <p>Every album has a <K>Slideshow</K> button: on an album’s own page, and next to <b>All photos</b>. Pick how it plays, then tap <K>Start slideshow</K>:</p>
          <List>
            <li><b>Change every</b> 3, 5 or 10 seconds;</li>
            <li><b>In order</b> or <b>Shuffle</b>;</li>
            <li><b>Fade</b> from one photo to the next, or <b>No fade</b>;</li>
            <li><b>Border:</b> none, thin or wide (white, like a print).</li>
          </List>
          <p>The photos fill the screen and the screen stays on. Photos approved while it plays join in by themselves, so a laptop plugged into a TV can run it all evening. Tap the screen or press <K>Esc</K> to go back to the album. The device remembers your choices for next time.</p>
          <Tip>Only approved photos are shown, even when a co-host starts it: nothing waiting or hidden goes up on the big screen. Videos are skipped. For a screen nobody signs in on, make the album public and open its link there.</Tip>
        </Step>
      </Section>

      <Section id="publish" eyebrow="Step 8" title="Publish: choose who sees it" lead="Approved photos are always visible to people on the event, and to table guests whose code has “Can see the album” ticked. Publishing opens it wider.">
        <Step title="Publishing" shots={[{ src: 'host-published.webp', alt: 'Publishing set to the whole family' }]}>
          <p>On the <b>Overview</b> tab, under <b>Publishing</b>, set <b>The event</b> to <K>Published</K>, choose who, and tap <K>Save</K>:</p>
          <List>
            <li><b>People on the event &amp; guest code holders:</b> just the people above.</li>
            <li><b>Whole family:</b> every family account, signed in. It shows on their home page under <i>Family albums</i>.</li>
            <li><b>Anyone with the link:</b> a public page. Still only approved photos, and visitors can’t add anything or download originals.</li>
          </List>
          <p>Change your mind any time; it takes effect immediately. Publishing the event decides who can open it; each named album is published on its own, on the Albums tab.</p>
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
          { src: 'host-notify.webp', alt: 'Turn on notifications on the Overview tab' },
          { src: 'host-notify-iphone.webp', alt: 'The iPhone explanation: add i2w2i to the home screen first' },
        ]}>
          <p>Co-hosts and editors: on the event’s <b>Overview</b> tab (or your account page), tap <K>Turn on notifications</K> and allow them. Do it once on each phone.</p>
          <p>When guests add photos you’ll get one notification like <b>“Sam &amp; Riley: 12 new photos are waiting for your OK”</b>, at most every couple of minutes. Tapping it opens the Photos tab, ready to approve. <K>Send a test</K> checks it works.</p>
          <Tip warn><b>iPhone:</b> notifications only work from the home-screen icon (Apple’s rule). Add i2w2i to your home screen, open it from the icon, then turn notifications on.</Tip>
        </Step>
      </Section>

      <Section id="who" eyebrow="At a glance" title="Who can do what">
        <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white break-inside-avoid">
          <table className="w-full min-w-[640px] border-collapse text-left text-base">
            <thead className="text-xs uppercase tracking-wider text-stone-500">
              <tr className="border-b border-stone-200">
                {['Person', 'Add photos', 'See photos', 'Approve, hide, albums', 'Page & publishing', 'People & QR codes'].map((h) => <th key={h} scope="col" className="px-4 py-2.5 font-bold">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 align-top">
              <tr><th scope="row" className="px-4 py-2.5 font-semibold">Admin (Eric)</th><Y /><T>Everything</T><Y /><Y /><Y>Yes, any event</Y></tr>
              <tr><th scope="row" className="px-4 py-2.5 font-semibold">Co-host</th><Y>Yes, no review</Y><T>Everything</T><Y /><Y /><Y /></tr>
              <tr><th scope="row" className="px-4 py-2.5 font-semibold">Editor</th><Y>Yes, no review</Y><T>Everything</T><Y /><Y /><N /></tr>
              <tr><th scope="row" className="px-4 py-2.5 font-semibold">Viewer (invited)</th><Y>Yes, reviewed</Y><T>Own + approved</T><N /><N /><N /></tr>
              <tr><th scope="row" className="px-4 py-2.5 font-semibold">Table guest (code)</th><Y>Yes, reviewed</Y><T>Own + approved*</T><N /><N /><N /></tr>
              <tr><th scope="row" className="px-4 py-2.5 font-semibold">Family, not on the event</th><N /><T>Approved, if published to the family</T><N /><N /><N /></tr>
              <tr><th scope="row" className="px-4 py-2.5 font-semibold">Anyone with the link</th><N /><T>Approved, if published to everyone</T><N /><N /><N /></tr>
              <tr><th scope="row" className="px-4 py-2.5 font-semibold">Anyone with a public album’s link</th><N /><T>That album’s approved photos</T><N /><N /><N /></tr>
            </tbody>
          </table>
        </div>
        <p className="text-base text-stone-600">* If the code’s “Can see the album” box is unticked, table guests only ever see their own photos.</p>
      </Section>
    </>
  );
}
