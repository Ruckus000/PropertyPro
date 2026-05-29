/**
 * Public transparency page API — slug-based community lookup.
 *
 * Plan A1 drain #141. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`. Cache-Control headers applied after the runner response.
 */
import { runRoute } from '@propertypro/api-contract';
// AUTHZ: Transparency public route: slug resolution and opt-in lookup before tenant scoping
import { findCommunityBySlugUnscoped } from '@propertypro/db/unsafe';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { NotFoundError } from '@/lib/api/errors';
import { requireCommunityType } from '@/lib/utils/community-validators';
import { resolveTimezone } from '@/lib/utils/timezone';
import { getTransparencyPageData } from '@/lib/services/transparency-service';
import { transparencyPublicGetContract } from './contract';

const CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=3600';

const transparencyGetHandler = runRoute(
  transparencyPublicGetContract,
  async ({ query }) => {
    const communityRow = await findCommunityBySlugUnscoped(query.slug);
    if (!communityRow) {
      throw new NotFoundError('Community not found');
    }

    const communityType = requireCommunityType(
      communityRow.communityType,
      `transparency:slug=${query.slug}`,
    );
    const features = getFeaturesForCommunity(communityType);

    if (!features.hasTransparencyPage || !communityRow.transparencyEnabled) {
      throw new NotFoundError('Transparency page is not enabled');
    }

    return getTransparencyPageData({
      id: communityRow.id,
      slug: communityRow.slug,
      name: communityRow.name,
      communityType,
      timezone: resolveTimezone(communityRow.timezone),
      addressLine1: communityRow.addressLine1,
      addressLine2: communityRow.addressLine2,
      city: communityRow.city,
      state: communityRow.state,
      zipCode: communityRow.zipCode,
    });
  },
);

export const GET = withErrorHandler(async (req, ctx) => {
  const res = await transparencyGetHandler(req, ctx);
  res.headers.set('Cache-Control', CACHE_CONTROL);
  return res;
});
