/**
 * Site blocks reorder API — batch-update block ordering.
 *
 * POST /api/admin/site-blocks/reorder
 *
 * Accepts the full ordering in a single request, avoiding N individual PUTs.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { reorderBlocks } from '@/lib/db/site-blocks-queries';

const reorderSchema = z.object({
  communityId: z.number().int().positive(),
  order: z
    .array(
      z.object({
        id: z.number().int().positive(),
        blockOrder: z.number().int().min(0),
      }),
    )
    .min(1),
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

  const parseResult = reorderSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid reorder payload',
          details: parseResult.error.issues,
        },
      },
      { status: 400 },
    );
  }

  const { communityId, order } = parseResult.data;

  const { error } = await reorderBlocks(communityId, order);

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: { reordered: order.length } });
}
