import bcrypt from 'bcryptjs';

export const MIN_PASSWORD_LENGTH = 10;

export function passwordProblem(pw: string): string | null {
  if (pw.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (pw.length > 200) return 'That password is too long.';
  return null;
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);

// Compared against when the account has no password, so a miss costs the same time as a hit.
let dummyHash: Promise<string> | undefined;

export async function verifyPassword(pw: string, hash: string | null): Promise<boolean> {
  const ok = await bcrypt.compare(pw, hash ?? (await (dummyHash ??= hashPassword('not-a-real-password'))));
  return ok && hash !== null;
}
