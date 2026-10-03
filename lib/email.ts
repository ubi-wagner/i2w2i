import 'server-only';

export interface Email {
  to: string;
  subject: string;
  text: string;
}

/**
 * Sends through Resend when RESEND_API_KEY is set; otherwise logs the message
 * (dev) and returns false so callers can show the link another way.
 */
export async function sendEmail(msg: Email): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? 'i2w2i <hello@i2w2i.com>';
  if (!key) {
    // Bodies hold sign-in links, so they only reach the console in development.
    const body = process.env.NODE_ENV === 'production' ? '' : `\n${msg.text}`;
    console.log(`[email] not configured; not sent to ${msg.to}: ${msg.subject}${body}`);
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.text }),
  });
  if (!res.ok) {
    console.error(`[email] send failed ${res.status}: ${await res.text().catch(() => '')}`);
    return false;
  }
  return true;
}
