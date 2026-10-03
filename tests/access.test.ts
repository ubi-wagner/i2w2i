import { describe, expect, it } from 'vitest';
import { canIssueLink, canUsePassword, normalizeEmail, safeNext, visibleApps, type AppRole, type AppRow } from '@/lib/access';

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
  it('allows every account to use a password', () => {
    expect(canUsePassword('admin')).toBe(true);
    expect(canUsePassword('creator')).toBe(true);
    expect(canUsePassword('member')).toBe(true);
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

describe('canIssueLink', () => {
  const admin = { id: 'a', platform_role: 'admin' as const };
  const host = { id: 'h', platform_role: 'creator' as const };
  const member = (created_by: string | null, extra = {}) => ({ id: 'm', platform_role: 'member' as const, created_by, is_active: true, ...extra });
  it('lets the admin issue links for anyone else', () => {
    expect(canIssueLink(admin, member(null))).toBe(true);
    expect(canIssueLink(admin, { id: 'h', platform_role: 'creator', created_by: null, is_active: true })).toBe(true);
  });
  it('lets a host issue links only for members they invited', () => {
    expect(canIssueLink(host, member('h'))).toBe(true);
    expect(canIssueLink(host, member('someone-else'))).toBe(false);
    expect(canIssueLink(host, { id: 'a', platform_role: 'admin', created_by: 'h', is_active: true })).toBe(false);
    expect(canIssueLink(host, { id: 'c', platform_role: 'creator', created_by: 'h', is_active: true })).toBe(false);
  });
  it('never for yourself, never for deactivated accounts, never by members', () => {
    expect(canIssueLink(admin, { id: 'a', platform_role: 'admin', created_by: null, is_active: true })).toBe(false);
    expect(canIssueLink(admin, member(null, { is_active: false }))).toBe(false);
    expect(canIssueLink({ id: 'x', platform_role: 'member' }, member('x'))).toBe(false);
  });
});
