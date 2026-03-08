import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { findCommunityBySlugUnscoped } from '@propertypro/db/unsafe';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireCommunityType } from '@/lib/utils/community-validators';
import { resolveTimezone } from '@/lib/utils/timezone';
import { getTransparencyPageData } from '@/lib/services/transparency-service';

const querySchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9-]+$/),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    slug: searchParams.get('slug') ?? '',
  });

  if (!parsed.success) {
    throw new ValidationError('Missing or invalid slug query parameter');
  }

  const communityRow = await findCommunityBySlugUnscoped(parsed.data.slug);
  if (!communityRow) {
    throw new NotFoundError('Community not found');
  }

  const communityType = requireCommunityType(
    communityRow.communityType,
    `transparency:slug=${parsed.data.slug}`,
  );
  const features = getFeaturesForCommunity(communityType);

  if (!features.hasTransparencyPage || !communityRow.transparencyEnabled) {
    throw new NotFoundError('Transparency page is not enabled');
  }

  const data = await getTransparencyPageData({
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

  return NextResponse.json(
    { data },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      },
    },
  );
});
