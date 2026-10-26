'use client';

import dynamic from 'next/dynamic';
import type { SessionUser } from '@/lib/auth';

// "Today" must come from the viewer's clock, so the app renders only in the browser
const TodoApp = dynamic(() => import('@/components/TodoApp').then((m) => m.TodoApp), {
  ssr: false,
  loading: () => <p className="app muted">불러오는 중…</p>,
});

export function ClientApp({ user }: { user: SessionUser }) {
  return <TodoApp user={user} />;
}
