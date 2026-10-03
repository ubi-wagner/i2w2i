import { describe, expect, it } from 'vitest';
import { canUsePassword, normalizeEmail, safeNext, visibleApps, type AppRole, type AppRow } from '@/lib/access';

const app = (key: string, extra: Partial<AppRow> = {}): AppRow => ({
  key, name: key, description: '', path: `/${key}`, sensitive: false, is_enabled: true, sort_order: 10, ...extra,
});
const apps = [app('events'), app('couples', { sensitive: true, sort_order: 90 }), app('old', { is_enabled: false })];
const grants = (entries: [string, AppRole][] = []) => new Map(entries);

describe('visibleApps', () => {
  it('shows admin every enabled non-sensitive app without grants', () => {
    expect(visibleApps({ id: 'a', platform_role: 'admin' }, apps, grants()).map((a) => a.key)).toEqual(['events']);
  });
  it('never shows a sensitive app to admin without an explicit grant', () => {
    expect(visibleApps({ id: 'a', platform_role: 'admin' }, apps, grants()).some((a) => a.sensitive)).toBe(false);
  });
  it('shows a sensitive app when granted', () => {
    const v = visibleApps({ id: 'm', platform_role: 'member' }, apps, grants([['couples', 'owner']]));
    expect(v.map((a) => a.key)).toEqual(['couples']);
  });
  it('needs a grant for creators and members', () => {
    expect(visibleApps({ id: 'c', platform_role: 'creator' }, apps, grants())).toEqual([]);
    expect(visibleApps({ id: 'm', platform_role: 'member' }, apps, grants([['events', 'viewer']])).map((a) => a.key)).toEqual(['events']);
  });
  it('hides disabled apps even when granted', () => {
    expect(visibleApps({ id: 'a', platform_role: 'admin' }, apps, grants([['old', 'owner']])).map((a) => a.key)).toEqual(['events']);
  });
});

describe('canUsePassword', () => {
  it('allows admin and creator, not member', () => {
    expect(canUsePassword('admin')).toBe(true);
    expect(canUsePassword('creator')).toBe(true);
    expect(canUsePassword('member')).toBe(false);
  });
});

describe('normalizeEmail', () => {
  it('lowercases and trims', () => expect(normalizeEmail('  Eric@Example.COM ')).toBe('eric@example.com'));
  it('rejects junk', () => {
    expect(normalizeEmail('not-an-email')).toBeNull();
    expect(normalizeEmail('a@b')).toBeNull();
    expect(normalizeEmail('a b@c.com')).toBeNull();
  });
});

describe('safeNext', () => {
  it('keeps local paths', () => expect(safeNext('/admin?x=1')).toBe('/admin?x=1'));
  it('rejects off-site redirects', () => {
    for (const bad of ['https://evil.com', '//evil.com', '/\\evil.com', 'admin', '', null, undefined]) {
      expect(safeNext(bad)).toBe('/');
    }
  });
});
