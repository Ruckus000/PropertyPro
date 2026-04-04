import { redirect } from 'next/navigation';
import { requirePageAuthenticatedUserId as requireAuthenticatedUserId } from '@/lib/request/page-auth-context';
import { isPmAdminInAnyCommunity } from '@/lib/api/pm-communities';
import { AddCommunityWizard } from '@/components/pm/AddCommunityWizard';

export default async function AddCommunityPage() {
  const userId = await requireAuthenticatedUserId();
  const isPm = await isPmAdminInAnyCommunity(userId);
  if (!isPm) {
    redirect('/dashboard');
  }
  return <AddCommunityWizard />;
}
