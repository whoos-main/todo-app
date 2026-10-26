import { SESSION_COOKIE, createSession } from '@/lib/auth';
import { baseDb } from '@/lib/db';
import { cookieJar } from './cookies';

let nextGithubId = 1;

/** Creates (or reuses, by username) a GitHub user and makes the following requests come from them. */
export async function loginAs(username: string) {
  const user =
    (await baseDb.user.findFirst({ where: { username } })) ??
    (await baseDb.user.create({
      data: { githubId: nextGithubId++, username, avatarUrl: `https://avatars.example/${username}` },
    }));
  cookieJar.set(SESSION_COOKIE, await createSession(user.id));
  return user;
}

export async function resetUsers() {
  cookieJar.clear();
  await baseDb.session.deleteMany();
  await baseDb.user.deleteMany();
}
