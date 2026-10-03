import { describe, expect, it } from 'vitest';
import { defaultLabel, linkUrl } from '@/lib/events/links';

describe('gift links', () => {
  it('turns handles into links', () => {
    expect(linkUrl('venmo', '@cassie-b')).toBe('https://venmo.com/u/cassie-b');
    expect(linkUrl('cashapp', '$cassieb')).toBe('https://cash.app/$cassieb');
    expect(linkUrl('paypal', 'cassieb')).toBe('https://paypal.me/cassieb');
  });
  it('accepts https links and bare registry domains', () => {
    expect(linkUrl('registry', 'https://www.zola.com/registry/cassie')).toBe('https://www.zola.com/registry/cassie');
    expect(linkUrl('registry', 'zola.com/registry/cassie')).toBe('https://zola.com/registry/cassie');
  });
  it('refuses anything else', () => {
    for (const bad of ['http://x.com', 'javascript:alert(1)', 'data:text/html,hi', '', 'not a handle!', 'https://localhost']) {
      expect(linkUrl('link', bad)).toBeNull();
    }
    expect(linkUrl('venmo', 'two words')).toBeNull();
  });
  it('labels payment links with the handle', () => {
    expect(defaultLabel('venmo', 'https://venmo.com/u/cassie-b')).toBe('Venmo @cassie-b');
    expect(defaultLabel('registry', 'https://zola.com/x')).toBe('Gift registry');
  });
});
