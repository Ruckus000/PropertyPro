import { headers } from 'next/headers';
import { PM_SCOPE_DB_ROLES } from '@propertypro/shared';
import { ForbiddenError } from '@/lib/api/errors';
import { getOptionalPageAuthenticatedUser } from '@/lib/request/page-auth-context';
import { requirePageCommunityMembership } from '@/lib/request/page-community-context';

/**
 * Whether this request may see a community's UNPUBLISHED site: draft pages,
 * draft sections and the draft look.
 *
 * Middleware stamps `x-preview` for any signed-in visitor who asks for
 * `?preview=true`. It cannot check which community's site that visitor may
 * edit without a database read on every request, so the check lives here, in
 * the reader that already knows the community. Only that community's managers
 * (`PM_SCOPE_DB_ROLES`, the roles that can edit its site) get drafts; everyone
 * else gets the published site, exactly as if they had not asked.
 */
export async function canPreviewDrafts(communityId: number): Promise<boolean> {
  if ((await headers()).get('x-preview') !== 'true') return false;
  const user = await getOptionalPageAuthenticatedUser();
  if (!user) return false;
  return isSiteEditor(communityId, user.id);
}

async function isSiteEditor(communityId: number, userId: string): Promise<boolean> {
  try {
    const membership = await requirePageCommunityMembership(communityId, userId);
    return (PM_SCOPE_DB_ROLES as readonly string[]).includes(membership.role);
  } catch (error) {
    // Not a member of this community. Any other failure is not an answer.
    if (error instanceof ForbiddenError) return false;
    throw error;
  }
}
