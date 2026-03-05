/**
 * Site blocks discard API — deletes all draft blocks for a community.
 *
 * POST /api/admin/site-blocks/discard
 *
 * Hard-deletes all draft blocks (is_draft=true) for the specified community.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { discardDrafts } from '@/lib/db/site-blocks-queries';

const discardSchema = z.object({
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

  const parseResult = discardSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid discard payload',
          details: parseResult.error.issues,
        },
      },
      { status: 400 },
    );
  }

  const { communityId } = parseResult.data;

  // Hard-delete all draft blocks for this community
  const { data: deletedBlocks, error } = await discardDrafts(communityId);

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({
    data: {
      discardedCount: deletedBlocks?.length ?? 0,
    },
  });
}
