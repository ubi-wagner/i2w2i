import { describe, expect, it } from 'vitest';
import { canResetPassword, canUsePassword, normalizeEmail, normalizeUsername, safeNext, usernameFromName, USERNAME_PATTERN, visibleApps, type AppRole, type AppRow } from '@/lib/access';

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

describe('normalizeUsername', () => {
  it('accepts letters, digits, dots, dashes and underscores, any case', () => {
    expect(normalizeUsername('  Grandma.Rose ')).toBe('grandma.rose');
    expect(normalizeUsername('cassie_b-89')).toBe('cassie_b-89');
    expect(normalizeUsername('a1')).toBe('a1');
  });
  it('refuses anything else', () => {
    for (const bad of ['', 'a', '.rose', '-rose', 'has space', 'rose@x.com', 'zoë', 'x'.repeat(33)]) expect(normalizeUsername(bad)).toBeNull();
  });
  it('matches the pattern the forms use (and the database check)', () => {
    const re = new RegExp(`^${USERNAME_PATTERN}$`, 'v');
    expect(re.test('grandma.rose')).toBe(true);
    expect(re.test('.rose')).toBe(false);
  });
});

describe('usernameFromName', () => {
  it('suggests a username from a name', () => {
    expect(usernameFromName('Grandma Rose')).toBe('grandma.rose');
    expect(usernameFromName('  Zoë  O’Brien ')).toBe('zoe.o.brien');
    expect(usernameFromName('Cassie & Jordan')).toBe('cassie.jordan');
  });
  it('gives nothing usable rather than something invalid', () => {
    expect(usernameFromName('李')).toBe('');
    expect(usernameFromName('A')).toBe('');
    expect(normalizeUsername(usernameFromName('x'.repeat(40) + ' y'))).not.toBeNull();
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

describe('canResetPassword', () => {
  const admin = { id: 'a', platform_role: 'admin' as const };
  const host = { id: 'h', platform_role: 'creator' as const };
  const member = (created_by: string | null, extra = {}) => ({ id: 'm', platform_role: 'member' as const, created_by, is_active: true, ...extra });
  it('lets the admin issue links for anyone else', () => {
    expect(canResetPassword(admin, member(null))).toBe(true);
    expect(canResetPassword(admin, { id: 'h', platform_role: 'creator', created_by: null, is_active: true })).toBe(true);
  });
  it('lets a host issue links only for members they invited', () => {
    expect(canResetPassword(host, member('h'))).toBe(true);
    expect(canResetPassword(host, member('someone-else'))).toBe(false);
    expect(canResetPassword(host, { id: 'a', platform_role: 'admin', created_by: 'h', is_active: true })).toBe(false);
    expect(canResetPassword(host, { id: 'c', platform_role: 'creator', created_by: 'h', is_active: true })).toBe(false);
  });
  it('lets a co-host who is a family member issue links for people they invited, and nobody else', () => {
    const cohost = { id: 'x', platform_role: 'member' as const };
    expect(canResetPassword(cohost, member('x'))).toBe(true);
    expect(canResetPassword(cohost, member('someone-else'))).toBe(false);
    expect(canResetPassword(cohost, member(null))).toBe(false);
  });
  it('never for yourself, never for deactivated accounts', () => {
    expect(canResetPassword(admin, { id: 'a', platform_role: 'admin', created_by: null, is_active: true })).toBe(false);
    expect(canResetPassword(admin, member(null, { is_active: false }))).toBe(false);
    expect(canResetPassword(host, member('h', { is_active: false }))).toBe(false);
  });
});
