import { defineConfig, devices } from '@playwright/test';
import { E2E_USER, LOGOUT_TOKEN, SESSION_TOKEN, sessionCookie } from './e2e/sessions';

const PORT = 3100;

export default defineConfig({
  testDir: './e2e',
  // All tests share one database
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // Pages and the `request` fixture are signed in as the E2E user
    storageState: { cookies: [sessionCookie(SESSION_TOKEN)], origins: [] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Own MongoDB and build dir so it never touches the dev database or a running `npm run dev`
    command: `node e2e/server.mjs ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_DIST_DIR: '.next-e2e',
      E2E_SESSION_TOKENS: `${SESSION_TOKEN},${LOGOUT_TOKEN}`,
      E2E_USERNAME: E2E_USER.username,
      E2E_AVATAR_URL: E2E_USER.avatarUrl,
      // Fake OAuth App: /auth/github only builds the redirect, GitHub is never called in E2E
      GITHUB_CLIENT_ID: 'e2e-client-id',
      GITHUB_CLIENT_SECRET: 'e2e-client-secret',
    },
  },
});
