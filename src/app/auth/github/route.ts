import { NextResponse } from 'next/server';
import { STATE_COOKIE, cookieOptions, randomToken } from '@/lib/auth';
import { githubConfig } from '@/lib/github';

export const dynamic = 'force-dynamic';

/** Starts GitHub OAuth: remembers a random state in a cookie and sends the browser to GitHub. */
export async function GET(req: Request) {
  const config = githubConfig(req);
  if (!config) return NextResponse.redirect(new URL('/login?error=config', req.url));

  const state = randomToken();
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.callbackUrl);
  url.searchParams.set('scope', 'read:user');
  url.searchParams.set('state', state);

  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, cookieOptions(10 * 60));
  return res;
}
