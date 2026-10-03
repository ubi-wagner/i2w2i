import { describe, expect, it } from 'vitest';
import { cleanSubscription, isPushEndpoint, reviewMessage } from '../lib/push-rules';

const keys = { p256dh: 'B' + 'A'.repeat(86), auth: 'abcdefghijklmnopqrstuv' };

describe('isPushEndpoint', () => {
  it('accepts the real push services', () => {
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc:def')).toBe(true);
    expect(isPushEndpoint('https://web.push.apple.com/QK7x')).toBe(true);
    expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/gAAA')).toBe(true);
    expect(isPushEndpoint('https://wns2-by3p.notify.windows.com/w/?token=x')).toBe(true);
  });
  it('refuses anything that would make the server call somewhere else', () => {
    expect(isPushEndpoint('http://fcm.googleapis.com/x')).toBe(false); // not https
    expect(isPushEndpoint('https://fcm.googleapis.com:8443/x')).toBe(false); // odd port
    expect(isPushEndpoint('https://fcm.googleapis.com.evil.com/x')).toBe(false);
    expect(isPushEndpoint('https://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isPushEndpoint('http://localhost:5432/')).toBe(false);
    expect(isPushEndpoint('not a url')).toBe(false);
    expect(isPushEndpoint(42)).toBe(false);
  });
  it('allows local endpoints only when tests ask for it', () => {
    expect(isPushEndpoint('http://127.0.0.1:4999/push/x', true)).toBe(true);
    expect(isPushEndpoint('file:///etc/passwd', true)).toBe(false);
  });
});

describe('cleanSubscription', () => {
  it('takes a browser subscription', () => {
    expect(cleanSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys })).toEqual({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', ...keys });
  });
  it('refuses missing or malformed keys', () => {
    expect(cleanSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'short', auth: keys.auth } })).toBeNull();
    expect(cleanSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: keys.p256dh, auth: 'a b' } })).toBeNull();
    expect(cleanSubscription({ endpoint: 'https://evil.example/x', keys })).toBeNull();
    expect(cleanSubscription(null)).toBeNull();
  });
});

describe('reviewMessage', () => {
  it('counts photos waiting', () => {
    expect(reviewMessage('Cassie’s Wedding', 1).body).toBe('1 new photo is waiting for your OK.');
    expect(reviewMessage('Cassie’s Wedding', 12)).toEqual({ title: 'Cassie’s Wedding', body: '12 new photos are waiting for your OK.' });
  });
});
