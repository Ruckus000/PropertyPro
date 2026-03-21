export const dynamic = 'force-dynamic';

/**
 * Account Settings page (E-02).
 *
 * Server component that authenticates the user and passes current
 * profile data to the client component. No community context needed —
 * this is a user-level settings page.
 */
import { redirect } from 'next/navigation';
import { users } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { requireAuthenticatedUser } from '@/lib/api/auth';
import { AccountSettingsClient } from '@/components/settings/account-settings-client';

export default async function AccountSettingsPage() {
  let user;
  try {
    user = await requireAuthenticatedUser();
  } catch {
    redirect('/auth/login');
  }

  // Fetch phone from the users table (not available in Supabase auth metadata)
  const db = createUnscopedClient();
  const rows = await db
    .select({ phone: users.phone, fullName: users.fullName })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const dbUser = rows[0];

  return (
    <AccountSettingsClient
      userId={user.id}
      email={user.email ?? ''}
      fullName={dbUser?.fullName ?? (user.user_metadata?.full_name as string) ?? ''}
      phone={dbUser?.phone ?? ''}
    />
  );
}
