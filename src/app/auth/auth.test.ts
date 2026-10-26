import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { baseDb, db, runAsUser } from '@/lib/db';
import { SESSION_COOKIE, STATE_COOKIE, hashToken } from '@/lib/auth';
import { cookieJar } from '../../../test/cookies';
import { loginAs, logout, resetUsers } from '../../../test/auth';
import * as start from './github/route';
import * as callback from './github/callback/route';
import * as logoutRoute from './logout/route';
import * as tree from '../api/tree/route';
import * as years from '../api/years/route';
import * as yearById from '../api/years/[id]/route';
import * as yearDescendants from '../api/years/[id]/descendants/route';
import * as monthById from '../api/months/[id]/route';
import * as monthDescendants from '../api/months/[id]/descendants/route';
import * as weekById from '../api/weeks/[id]/route';
import * as weekDescendants from '../api/weeks/[id]/descendants/route';
import * as months from '../api/months/route';
import * as weeks from '../api/weeks/route';
import * as tasks from '../api/tasks/route';
import * as taskById from '../api/tasks/[id]/route';

const WEEK = '2026-10-26';
const json = (method: string, body?: unknown) =>
  new Request('http://test', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const post = async (handler: (r: Request) => Promise<Response>, body: unknown) =>
  (await (await handler(json('POST', body))).json()) as { id: string; order?: number };

/** The value of `name` in a response's Set-Cookie headers ('' when it is being cleared). */
function setCookie(res: Response, name: string): string | undefined {
  const line = res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
  return line?.split(';')[0].slice(name.length + 1);
}

async function createChain() {
  const year = await post(years.POST, { year: 2026, title: '연간' });
  const month = await post(months.POST, { yearPlanId: year.id, month: 10, title: '10월' });
  const week = await post(weeks.POST, { monthPlanId: month.id, weekStart: WEEK, title: '주간' });
  const task = await post(tasks.POST, { weekPlanId: week.id, date: WEEK, title: '내 할 일' });
  return { year, month, week, task };
}

beforeEach(async () => {
  await baseDb.yearPlan.deleteMany();
  await resetUsers();
  process.env.GITHUB_CLIENT_ID = 'test-client-id';
  process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('signed-out requests', () => {
  it('every API answers 401 without a session', async () => {
    const responses = await Promise.all([
      tree.GET(),
      tasks.GET(new Request(`http://test/api/tasks?weekStart=${WEEK}`)),
      years.POST(json('POST', { year: 2026, title: 'x' })),
      yearById.PATCH(json('PATCH', { title: 'x' }), ctx('6aded17f56648bfa49539ad2')),
      yearById.DELETE(json('DELETE'), ctx('6aded17f56648bfa49539ad2')),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(401);
      expect((await res.json()).error.code).toBe('unauthorized');
    }
    expect(await baseDb.yearPlan.count()).toBe(0);
  });

  it('401 with an unknown or expired session token', async () => {
    cookieJar.set(SESSION_COOKIE, 'not-a-real-token');
    expect((await tree.GET()).status).toBe(401);

    const user = await loginAs('old');
    await baseDb.session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await tree.GET()).status).toBe(401);
    expect(await baseDb.session.count({ where: { userId: user.id } })).toBe(0);
  });
});

describe('each user sees and changes only their own plans', () => {
  it('rows are stamped with the owner and hidden from other users', async () => {
    const alice = await loginAs('alice');
    const mine = await createChain();
    const rows = await Promise.all([
      baseDb.yearPlan.findUnique({ where: { id: mine.year.id } }),
      baseDb.monthPlan.findUnique({ where: { id: mine.month.id } }),
      baseDb.weekPlan.findUnique({ where: { id: mine.week.id } }),
      baseDb.dailyTask.findUnique({ where: { id: mine.task.id } }),
    ]);
    for (const row of rows) expect(row?.userId).toBe(alice.id);

    await loginAs('bob');
    expect(await (await tree.GET()).json()).toEqual([]);
    const week = await (await tasks.GET(new Request(`http://test/api/tasks?weekStart=${WEEK}`))).json();
    expect(week).toMatchObject({ weekPlans: [], tasks: [] });

    // Alice's ids behave like ids that do not exist
    expect((await taskById.PATCH(json('PATCH', { status: 'done' }), ctx(mine.task.id))).status).toBe(404);
    expect((await taskById.DELETE(json('DELETE'), ctx(mine.task.id))).status).toBe(404);
    expect((await yearById.PATCH(json('PATCH', { title: 'hacked' }), ctx(mine.year.id))).status).toBe(404);
    expect((await yearById.DELETE(json('DELETE'), ctx(mine.year.id))).status).toBe(404);
    expect((await yearDescendants.GET(json('GET'), ctx(mine.year.id))).status).toBe(404);
    expect((await months.POST(json('POST', { yearPlanId: mine.year.id, month: 11, title: 'x' }))).status).toBe(404);
    expect((await weeks.POST(json('POST', { monthPlanId: mine.month.id, weekStart: WEEK, title: 'x' }))).status).toBe(404);
    expect((await tasks.POST(json('POST', { weekPlanId: mine.week.id, date: WEEK, title: 'x' }))).status).toBe(404);
    expect((await monthById.PATCH(json('PATCH', { title: 'hacked' }), ctx(mine.month.id))).status).toBe(404);
    expect((await monthById.DELETE(json('DELETE'), ctx(mine.month.id))).status).toBe(404);
    expect((await monthDescendants.GET(json('GET'), ctx(mine.month.id))).status).toBe(404);
    expect((await weekById.PATCH(json('PATCH', { title: 'hacked' }), ctx(mine.week.id))).status).toBe(404);
    expect((await weekById.DELETE(json('DELETE'), ctx(mine.week.id))).status).toBe(404);
    expect((await weekDescendants.GET(json('GET'), ctx(mine.week.id))).status).toBe(404);

    // Bob's own plans work as usual
    await createChain();
    expect(await baseDb.yearPlan.count()).toBe(2);

    // Nothing of Alice's changed, and she still sees only her own year
    expect(await baseDb.dailyTask.findUnique({ where: { id: mine.task.id } })).toMatchObject({ status: 'todo', title: '내 할 일' });
    expect(await baseDb.yearPlan.findUnique({ where: { id: mine.year.id } })).toMatchObject({ title: '연간' });
    expect(await baseDb.monthPlan.findUnique({ where: { id: mine.month.id } })).toMatchObject({ title: '10월' });
    expect(await baseDb.weekPlan.findUnique({ where: { id: mine.week.id } })).toMatchObject({ title: '주간' });
    await loginAs('alice');
    const aliceTree = await (await tree.GET()).json();
    expect(aliceTree).toHaveLength(1);
    expect(aliceTree[0].id).toBe(mine.year.id);
  });

  it("a row cannot be moved under someone else's plan or handed to someone else", async () => {
    await loginAs('alice');
    const alice = await createChain();
    const bob = await loginAs('bob');
    const mine = await createChain();

    // Update schemas drop parent ids and userId, so these PATCHes change only the title
    await taskById.PATCH(json('PATCH', { title: 't2', weekPlanId: alice.week.id, userId: 'x' }), ctx(mine.task.id));
    await weekById.PATCH(json('PATCH', { title: 'w2', monthPlanId: alice.month.id }), ctx(mine.week.id));
    await monthById.PATCH(json('PATCH', { title: 'm2', yearPlanId: alice.year.id }), ctx(mine.month.id));
    expect(await baseDb.dailyTask.findUnique({ where: { id: mine.task.id } })).toMatchObject({ title: 't2', weekPlanId: mine.week.id, userId: bob.id });
    expect(await baseDb.weekPlan.findUnique({ where: { id: mine.week.id } })).toMatchObject({ title: 'w2', monthPlanId: mine.month.id });
    expect(await baseDb.monthPlan.findUnique({ where: { id: mine.month.id } })).toMatchObject({ title: 'm2', yearPlanId: mine.year.id });
  });

  it("deleting a year cascades only through the owner's rows", async () => {
    await loginAs('alice');
    const alice = await createChain();
    await loginAs('bob');
    await createChain();
    await loginAs('alice');
    expect((await yearById.DELETE(json('DELETE'), ctx(alice.year.id))).status).toBe(204);
    const counts = await Promise.all([baseDb.yearPlan.count(), baseDb.monthPlan.count(), baseDb.weekPlan.count(), baseDb.dailyTask.count()]);
    expect(counts).toEqual([1, 1, 1, 1]);
  });

  it("new task order counts only the user's own tasks", async () => {
    await loginAs('alice');
    await createChain();
    await loginAs('bob');
    const { task } = await createChain();
    expect(task.order).toBe(1);
  });
});

describe('guards', () => {
  it('plan queries outside a signed-in request fail instead of running unscoped', async () => {
    await expect(db.yearPlan.findMany()).rejects.toThrow(/outside a signed-in request/);
    // A query built inside the scope but awaited after it ended is caught too
    const late = runAsUser('6aded17f56648bfa49539ad2', () => db.yearPlan.findMany());
    await expect(late).rejects.toThrow(/outside a signed-in request/);
    await expect(runAsUser('6aded17f56648bfa49539ad2', async () => await db.yearPlan.findRaw({}))).rejects.toThrow(/cannot be scoped/);
  });

  it('403 for a write sent from another origin, even with a valid session', async () => {
    await loginAs('alice');
    const forged = new Request('http://localhost:3000/api/years', {
      method: 'POST',
      headers: { 'content-type': 'text/plain', origin: 'http://localhost:5173' },
      body: JSON.stringify({ year: 2026, title: 'csrf' }),
    });
    const res = await years.POST(forged);
    expect(res.status).toBe(403);
    expect(await baseDb.yearPlan.count()).toBe(0);

    const sameOrigin = new Request('http://localhost:3000/api/years', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ year: 2026, title: 'ok' }),
    });
    expect((await years.POST(sameOrigin)).status).toBe(201);

    const logoutForged = await logoutRoute.POST(
      new Request('http://localhost:3000/auth/logout', { method: 'POST', headers: { origin: 'http://evil.localhost' } }),
    );
    expect(logoutForged.status).toBe(403);
    expect(await baseDb.session.count()).toBe(1);
  });
});

describe('GET /auth/github', () => {
  it('redirects to GitHub with the client id, callback URL and a state stored in a cookie', async () => {
    const res = await start.GET(new Request('http://localhost:3000/auth/github'));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location')!);
    expect(location.origin + location.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(location.searchParams.get('client_id')).toBe('test-client-id');
    expect(location.searchParams.get('redirect_uri')).toBe('http://localhost:3000/auth/github/callback');
    expect(location.searchParams.get('scope')).toBe('read:user');
    const state = location.searchParams.get('state');
    expect(state).toBeTruthy();
    expect(setCookie(res, STATE_COOKIE)).toBe(state);
    // The secret never leaves the server
    expect(res.headers.get('location')).not.toContain('test-client-secret');
  });

  it('sends the user back to /login when the OAuth App is not configured', async () => {
    delete process.env.GITHUB_CLIENT_SECRET;
    const res = await start.GET(new Request('http://localhost:3000/auth/github'));
    expect(res.headers.get('location')).toBe('http://localhost:3000/login?error=config');
  });
});

describe('GET /auth/github/callback', () => {
  const OCTOCAT = { id: 4242, login: 'octocat', avatar_url: 'https://avatars.githubusercontent.com/u/4242' };

  function stubGitHub(profile = OCTOCAT) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        if (String(url) === 'https://github.com/login/oauth/access_token') {
          const body = JSON.parse(String(init?.body));
          if (body.code !== 'good-code' || body.client_secret !== 'test-client-secret') {
            return Response.json({ error: 'bad_verification_code' });
          }
          return Response.json({ access_token: 'gho_token' });
        }
        if (String(url) === 'https://api.github.com/user') {
          const auth = new Headers(init?.headers).get('authorization');
          return auth === 'Bearer gho_token' ? Response.json(profile) : new Response('', { status: 401 });
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );
  }
  const callbackRequest = (query: string) => new Request(`http://localhost:3000/auth/github/callback?${query}`);

  it('saves username and avatar_url, starts a session and redirects home', async () => {
    stubGitHub();
    cookieJar.set(STATE_COOKIE, 'abc');
    const res = await callback.GET(callbackRequest('code=good-code&state=abc'));

    expect(res.headers.get('location')).toBe('http://localhost:3000/');
    const user = await baseDb.user.findUnique({ where: { githubId: 4242 } });
    expect(user).toMatchObject({ username: 'octocat', avatarUrl: 'https://avatars.githubusercontent.com/u/4242' });

    const token = setCookie(res, SESSION_COOKIE)!;
    expect(token).toBeTruthy();
    expect(res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`))).toMatch(/HttpOnly/i);
    // Only the hash is stored
    const session = await baseDb.session.findUnique({ where: { tokenHash: hashToken(token) } });
    expect(session?.userId).toBe(user!.id);
    expect(await baseDb.session.count({ where: { tokenHash: token } })).toBe(0);
    expect(setCookie(res, STATE_COOKIE)).toBe('');

    // The new session works against the API
    cookieJar.set(SESSION_COOKIE, token);
    expect((await tree.GET()).status).toBe(200);
  });

  it('replaces a session the browser already had', async () => {
    const old = await loginAs('octocat');
    stubGitHub({ ...OCTOCAT });
    cookieJar.set(STATE_COOKIE, 'abc');
    await callback.GET(callbackRequest('code=good-code&state=abc'));
    expect(await baseDb.session.count({ where: { userId: old.id } })).toBe(0);
    expect(await baseDb.session.count()).toBe(1);
  });

  it('updates the stored profile on the next login instead of adding a user', async () => {
    stubGitHub();
    cookieJar.set(STATE_COOKIE, 'abc');
    await callback.GET(callbackRequest('code=good-code&state=abc'));
    stubGitHub({ id: 4242, login: 'octocat-renamed', avatar_url: 'https://avatars.githubusercontent.com/u/4242?v=2' });
    await callback.GET(callbackRequest('code=good-code&state=abc'));

    expect(await baseDb.user.count()).toBe(1);
    expect(await baseDb.user.findUnique({ where: { githubId: 4242 } })).toMatchObject({
      username: 'octocat-renamed',
      avatarUrl: 'https://avatars.githubusercontent.com/u/4242?v=2',
    });
  });

  it.each([
    ['missing state cookie', null, 'code=good-code&state=abc', 'state'],
    ['state mismatch', 'abc', 'code=good-code&state=evil', 'state'],
    ['missing code', 'abc', 'state=abc', 'state'],
    ['user denied access', 'abc', 'error=access_denied&state=abc', 'denied'],
    ['GitHub rejects the code', 'abc', 'code=bad-code&state=abc', 'github'],
  ])('%s → /login?error=… without a session', async (_name, cookie, query, error) => {
    stubGitHub();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    if (cookie) cookieJar.set(STATE_COOKIE, cookie);
    const res = await callback.GET(callbackRequest(query));
    expect(res.headers.get('location')).toBe(`http://localhost:3000/login?error=${error}`);
    expect(setCookie(res, SESSION_COOKIE)).toBeUndefined();
    expect(await baseDb.session.count()).toBe(0);
    expect(await baseDb.user.count()).toBe(0);
  });
});

describe('POST /auth/logout', () => {
  it('deletes the session row and clears the cookie, so the old token stops working', async () => {
    const user = await loginAs('alice');
    const token = cookieJar.get(SESSION_COOKIE)!;
    expect((await tree.GET()).status).toBe(200);

    const res = await logoutRoute.POST(new Request('http://localhost:3000/auth/logout', { method: 'POST' }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('http://localhost:3000/login');
    expect(setCookie(res, SESSION_COOKIE)).toBe('');
    expect(await baseDb.session.count({ where: { userId: user.id } })).toBe(0);

    // Even if the browser kept the old cookie, it is no longer valid
    cookieJar.set(SESSION_COOKIE, token);
    expect((await tree.GET()).status).toBe(401);
  });

  it('works without a session', async () => {
    logout();
    const res = await logoutRoute.POST(new Request('http://localhost:3000/auth/logout', { method: 'POST' }));
    expect(res.status).toBe(303);
  });
});
