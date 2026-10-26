import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  config: 'GitHub OAuth 설정이 없어요. docs/LOGIN.md를 보고 .env에 GITHUB_CLIENT_ID와 GITHUB_CLIENT_SECRET을 넣어 주세요.',
  denied: 'GitHub 로그인이 취소됐어요.',
  state: '로그인 요청이 만료됐거나 올바르지 않아요. 다시 시도해 주세요.',
  github: 'GitHub에서 사용자 정보를 가져오지 못했어요. 다시 시도해 주세요.',
  server: '로그인 정보를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentUser()) redirect('/');
  const { error } = await searchParams;

  return (
    <main className="login">
      <h1>할 일 계획</h1>
      <p className="muted">연간·월간·주간·일간 계획을 보려면 로그인하세요.</p>
      {error && <p className="field-error" role="alert">{ERRORS[error] ?? '로그인하지 못했어요. 다시 시도해 주세요.'}</p>}
      {/* A plain link: /auth/github answers with a redirect to GitHub */}
      <a className="github-login" href="/auth/github">
        GitHub로 로그인
      </a>
    </main>
  );
}
