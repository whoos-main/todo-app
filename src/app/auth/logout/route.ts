import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, deleteSession, isCrossOrigin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Deletes the session row and the cookie, so the old token can never be used again. */
export async function POST(req: Request) {
  // Another site must not be able to sign the user out
  if (isCrossOrigin(req)) return new Response('Forbidden', { status: 403 });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  // 303 so the browser follows the redirect with GET
  const res = NextResponse.redirect(new URL('/login', req.url), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
