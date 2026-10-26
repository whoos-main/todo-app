// GitHub OAuth App settings come only from the environment (see docs/LOGIN.md and .env.example)

export type GitHubConfig = { clientId: string; clientSecret: string; callbackUrl: string };
export type GitHubUser = { id: number; login: string; avatar_url: string };

/** null when GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET are not set. */
export function githubConfig(req: Request): GitHubConfig | null {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const callbackUrl = process.env.GITHUB_CALLBACK_URL || new URL('/auth/github/callback', req.url).toString();
  return { clientId, clientSecret, callbackUrl };
}

/** Exchanges the OAuth `code` for an access token, then reads the user's profile. */
export async function fetchGitHubUser(config: GitHubConfig, code: string): Promise<GitHubUser> {
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.callbackUrl,
    }),
  });
  const token = (await tokenRes.json().catch(() => null)) as { access_token?: string; error?: string } | null;
  if (!tokenRes.ok || !token?.access_token) throw new Error(`token exchange failed: ${token?.error ?? tokenRes.status}`);

  const userRes = await fetch('https://api.github.com/user', {
    headers: { authorization: `Bearer ${token.access_token}`, accept: 'application/vnd.github+json', 'user-agent': 'todo-app' },
  });
  if (!userRes.ok) throw new Error(`user fetch failed: ${userRes.status}`);
  return (await userRes.json()) as GitHubUser;
}
