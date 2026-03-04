/**
 * Site blocks CRUD API — list and create blocks.
 *
 * GET  /api/admin/site-blocks?communityId=X — returns all blocks ordered by block_order
 * POST /api/admin/site-blocks — creates a draft block (validation deferred to publish)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import {
  BLOCK_TYPES,
  getDefaultBlockContent,
} from '@propertypro/shared/site-blocks';
import {
  listBlocks,
  insertBlock,
  insertBlockAtEnd,
} from '@/lib/db/site-blocks-queries';

const createBlockSchema = z.object({
  communityId: z.number().int().positive(),
  blockType: z.enum([...BLOCK_TYPES]),
  blockOrder: z.number().int().min(0).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  await requirePlatformAdmin();

  const { searchParams } = new URL(request.url);
  const communityIdRaw = searchParams.get('communityId');

  if (!communityIdRaw) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'communityId query parameter is required' } },
      { status: 400 },
    );
  }

  const communityId = Number(communityIdRaw);
  if (!Number.isInteger(communityId) || communityId <= 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'communityId must be a positive integer' } },
      { status: 400 },
    );
  }

  const { data, error } = await listBlocks(communityId);

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: data ?? [] });
}

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

  const parseResult = createBlockSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid block payload',
          details: parseResult.error.issues,
        },
      },
      { status: 400 },
    );
  }

  const { communityId, blockType, blockOrder, content } = parseResult.data;

  // Use provided content or generate defaults.
  // Content validation is intentionally deferred to the publish flow — default
  // content for hero/text/image/contact has empty required fields by design,
  // giving the user a scaffold to fill in via the block editor.
  const blockContent = content ?? (getDefaultBlockContent(blockType) as unknown as Record<string, unknown>);

  // Use atomic insert-at-end when no explicit order, to avoid race conditions
  const { data, error } = blockOrder != null
    ? await insertBlock({
        community_id: communityId,
        block_type: blockType,
        block_order: blockOrder,
        content: blockContent as Record<string, unknown>,
        is_draft: true,
      })
    : await insertBlockAtEnd({
        community_id: communityId,
        block_type: blockType,
        content: blockContent as Record<string, unknown>,
        is_draft: true,
      });

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ data }, { status: 201 });
}
