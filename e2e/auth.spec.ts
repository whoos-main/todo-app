import { expect, test } from '@playwright/test';
import { E2E_USER, LOGOUT_TOKEN, sessionCookie } from './sessions';

test.describe('로그인하지 않은 사용자', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('할 일 화면 대신 로그인 화면으로 보내고, API는 401을 돌려준다', async ({ page, request }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('link', { name: 'GitHub로 로그인' })).toHaveAttribute('href', '/auth/github');
    await expect(page.getByTestId('task-card')).toHaveCount(0);

    const tree = await request.get('/api/tree');
    expect(tree.status()).toBe(401);
    expect((await request.get('/api/tasks?weekStart=2026-10-26')).status()).toBe(401);
    expect((await request.post('/api/years', { data: { year: 2026, title: 'x' } })).status()).toBe(401);
  });

  test('/auth/github는 GitHub 인증 화면으로 보낸다', async ({ request }) => {
    const res = await request.get('/auth/github', { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    const location = new URL(res.headers()['location']);
    expect(`${location.origin}${location.pathname}`).toBe('https://github.com/login/oauth/authorize');
    expect(location.searchParams.get('client_id')).toBe('e2e-client-id');
    expect(location.searchParams.get('redirect_uri')).toMatch(/\/auth\/github\/callback$/);
    expect(res.headers()['location']).not.toContain('e2e-client-secret');
  });

  test('state가 맞지 않는 콜백은 로그인되지 않고 오류를 보여준다', async ({ page }) => {
    await page.goto('/auth/github/callback?code=x&state=forged');
    await expect(page).toHaveURL(/\/login\?error=state$/);
    await expect(page.locator('.login [role=alert]')).toContainText('로그인 요청이 만료됐거나 올바르지 않아요');
  });
});

test('로그인한 사용자는 헤더에서 GitHub 아이디와 아바타를 본다', async ({ page }) => {
  await page.goto('/');
  const menu = page.locator('.user-menu');
  await expect(menu).toContainText(E2E_USER.username);
  await expect(menu.locator('img')).toHaveAttribute('src', E2E_USER.avatarUrl);

  // A signed-in user is sent away from the login page
  await page.goto('/login');
  await expect(page).toHaveURL(/\/$/);
});

test.describe('로그아웃', () => {
  test.use({ storageState: { cookies: [sessionCookie(LOGOUT_TOKEN)], origins: [] } });

  test('세션을 삭제해서 같은 쿠키로는 다시 들어올 수 없다', async ({ page, playwright, baseURL }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '로그아웃' }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await page.context().cookies()).find((c) => c.name === 'todo_session')).toBeUndefined();

    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);

    // Replaying the old cookie does not work either: the session row is gone
    const replay = await playwright.request.newContext({ baseURL, storageState: { cookies: [sessionCookie(LOGOUT_TOKEN)], origins: [] } });
    expect((await replay.get('/api/tree')).status()).toBe(401);
    await replay.dispose();
  });
});
