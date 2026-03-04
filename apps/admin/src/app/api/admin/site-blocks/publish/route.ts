/**
 * Site blocks publish API — publishes all draft blocks for a community.
 *
 * POST /api/admin/site-blocks/publish
 *
 * Sets is_draft=false, published_at=now() for all draft blocks,
 * and updates communities.site_published_at.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import {
  publishDrafts,
  updateCommunityPublishTimestamp,
} from '@/lib/db/site-blocks-queries';

const publishSchema = z.object({
  communityId: z.number().int().positive(),
});

export async function POST(request: NextRequest) {
  await requirePlatformAdmin();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 400 },
    );
  }

  const parseResult = publishSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid publish payload',
          details: parseResult.error.issues,
        },
      },
      { status: 400 },
    );
  }

  const { communityId } = parseResult.data;

  // Publish all draft blocks for the community
  const { data: publishedBlocks, error: publishError } = await publishDrafts(communityId);

  if (publishError) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: publishError.message } },
      { status: 500 },
    );
  }

  // Update community's site_published_at timestamp
  const { error: communityError } = await updateCommunityPublishTimestamp(communityId);

  if (communityError) {
    // Non-fatal — blocks are published, but community timestamp failed
    // eslint-disable-next-line no-console
    console.error('[site-blocks/publish] Failed to update community site_published_at', communityError);
  }

  const now = new Date().toISOString();
  return NextResponse.json({
    data: {
      publishedCount: publishedBlocks?.length ?? 0,
      publishedAt: now,
    },
  });
}
