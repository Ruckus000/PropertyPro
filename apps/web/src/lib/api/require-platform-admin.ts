/**
 * Platform admin auth guard.
 *
 * Verifies the caller is an authenticated user with a row in the
 * `platform_admin_users` table. Uses unscoped client because this
 * table is platform-level (no community_id).
 *
 * Authorization contract: The `platform_admin_users` table is a
 * platform-level lookup — no RLS scoping applies.
 */
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { platformAdminUsers } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { ForbiddenError } from '@/lib/api/errors';

export async function requirePlatformAdmin(): Promise<string> {
  const userId = await requireAuthenticatedUserId();
  const db = createUnscopedClient();
  const [admin] = await db
    .select({ userId: platformAdminUsers.userId })
    .from(platformAdminUsers)
    .where(eq(platformAdminUsers.userId, userId))
    .limit(1);
  if (!admin) throw new ForbiddenError();
  return userId;
}
