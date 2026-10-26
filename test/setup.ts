import { vi } from 'vitest';

// Route handlers read the session through next/headers, which only works inside Next.
// Tests put cookies into cookieJar instead (see test/auth.ts).
vi.mock('next/headers', async () => {
  const { cookieJar } = await import('./cookies');
  return {
    cookies: async () => ({
      get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
    }),
  };
});
