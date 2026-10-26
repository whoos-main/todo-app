import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { baseDb } from './db';

export const SESSION_COOKIE = 'todo_session';
export const STATE_COOKIE = 'todo_oauth_state';
const SESSION_DAYS = 30;

export type SessionUser = { id: string; username: string; avatarUrl: string };

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const randomToken = () => randomBytes(32).toString('base64url');

export const cookieOptions = (maxAgeSeconds: number) => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: maxAgeSeconds,
});
export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;

/**
 * True for a browser request sent from another origin. Browsers always send Origin on
 * POST/PATCH/DELETE, so this stops same-site pages (another localhost port, a sibling
 * subdomain) that SameSite=Lax lets through. Requests without Origin are not from a
 * page and cannot ride the user's cookie.
 */
export function isCrossOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  return origin !== null && origin !== new URL(req.url).origin;
}

/** Stores a new session for `userId` and returns the raw token for the cookie. */
export async function createSession(userId: string): Promise<string> {
  const token = randomToken();
  await baseDb.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt: new Date(Date.now() + SESSION_MAX_AGE * 1000) },
  });
  return token;
}

export async function deleteSession(token: string): Promise<void> {
  await baseDb.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

/** The user of the request's session cookie, or null when missing, unknown or expired. */
export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await baseDb.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, username: true, avatarUrl: true } } },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await baseDb.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return session.user;
}
