import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { ClientApp } from './client-app';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await currentUser();
  if (!user) redirect('/login');
  return <ClientApp user={user} />;
}
