// Session tokens the E2E server (e2e/server.mjs) stores for its test user, so tests start signed in
// without going through GitHub. Test-only values for a throwaway database.
export const SESSION_TOKEN = 'e2e-session-token';
// A second session for the logout test, so logging out does not sign out the other tests
export const LOGOUT_TOKEN = 'e2e-logout-token';
export const E2E_USER = { username: 'e2e-user', avatarUrl: 'https://avatars.githubusercontent.com/u/1' };

export const sessionCookie = (value: string) => ({
  name: 'todo_session',
  value,
  domain: 'localhost',
  path: '/',
  expires: -1,
  httpOnly: true,
  secure: false,
  sameSite: 'Lax' as const,
});
