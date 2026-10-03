import { describe, expect, it } from 'vitest';
import { describeDevice } from '@/lib/device';

describe('describeDevice', () => {
  it('names iPhones with iOS and Safari', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
    expect(describeDevice(ua)).toBe('iPhone · iOS 18.1 · Safari 18');
  });
  it('uses the reported model on Android', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
    expect(describeDevice(ua, { model: 'Pixel 8', platformVersion: '15.0.0' })).toBe('Android (Pixel 8) · Android 15.0.0 · Chrome 129');
    expect(describeDevice(ua)).toBe('Android · Android 10 · Chrome 129');
  });
  it('spots iPads that ask for desktop sites, and in-app browsers', () => {
    const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
    expect(describeDevice(mac, { touchPoints: 5 })).toBe('iPad · Safari 18');
    expect(describeDevice(mac)).toBe('Mac · Safari 18');
    const ig = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0';
    expect(describeDevice(ig)).toBe('iPhone · iOS 17.5 · Instagram app');
  });
  it('copes with nothing', () => {
    expect(describeDevice(null)).toBe('Unknown device');
  });
});
