import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, SESSION_MAX_AGE, STATE_COOKIE, cookieOptions, createSession, deleteSession } from '@/lib/auth';
import { baseDb } from '@/lib/db';
import { fetchGitHubUser, githubConfig } from '@/lib/github';

export const dynamic = 'force-dynamic';

/** GitHub redirects here with `code` and `state`; on success the user is saved and signed in. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const fail = (error: string) => {
    const res = NextResponse.redirect(new URL(`/login?error=${error}`, req.url));
    res.cookies.delete(STATE_COOKIE);
    return res;
  };

  const config = githubConfig(req);
  if (!config) return fail('config');
  if (params.get('error')) return fail('denied');

  // The state must match the one set by /auth/github, or the request did not start here (CSRF)
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  const state = params.get('state');
  const code = params.get('code');
  if (!expected || !state || state !== expected || !code) return fail('state');

  let profile;
  try {
    profile = await fetchGitHubUser(config, code);
  } catch (e) {
    console.error(e);
    return fail('github');
  }

  let token;
  try {
    const user = await baseDb.user.upsert({
      where: { githubId: profile.id },
      create: { githubId: profile.id, username: profile.login, avatarUrl: profile.avatar_url },
      update: { username: profile.login, avatarUrl: profile.avatar_url },
    });
    // A session the browser already had is replaced, not left behind
    const previous = jar.get(SESSION_COOKIE)?.value;
    if (previous) await deleteSession(previous);
    token = await createSession(user.id);
  } catch (e) {
    console.error(e);
    return fail('server');
  }

  const res = NextResponse.redirect(new URL('/', req.url));
  res.cookies.delete(STATE_COOKIE);
  res.cookies.set(SESSION_COOKIE, token, cookieOptions(SESSION_MAX_AGE));
  return res;
}
