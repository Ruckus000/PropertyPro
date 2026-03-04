/**
 * Site blocks CRUD API — update and delete individual blocks.
 *
 * PUT    /api/admin/site-blocks/:id — updates content/blockOrder, validates content
 * DELETE /api/admin/site-blocks/:id — soft-deletes a block
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import {
  BLOCK_TYPES,
  validateBlockContent,
  type BlockType,
} from '@propertypro/shared/site-blocks';
import {
  getBlock,
  updateBlock,
  softDeleteBlock,
} from '@/lib/db/site-blocks-queries';

const updateBlockSchema = z.object({
  blockOrder: z.number().int().min(0).optional(),
  content: z.record(z.string(), z.unknown()).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  await requirePlatformAdmin();

  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'id must be a positive integer' } },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 400 },
    );
  }

  const parseResult = updateBlockSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid update payload',
          details: parseResult.error.issues,
        },
      },
      { status: 400 },
    );
  }

  // Fetch existing block to validate content against its type
  const { data: existing, error: fetchError } = await getBlock(id);

  if (fetchError || !existing) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Block not found' } },
      { status: 404 },
    );
  }

  const { blockOrder, content } = parseResult.data;

  // Validate content if provided
  if (content) {
    const blockType = existing.block_type as BlockType;
    if (!BLOCK_TYPES.includes(blockType)) {
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: `Unknown block type: ${blockType}` } },
        { status: 500 },
      );
    }
    const validation = validateBlockContent(blockType, content);
    if (!validation.valid) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: validation.error } },
        { status: 400 },
      );
    }
  }

  // Build update payload
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (blockOrder !== undefined) {
    updateData['block_order'] = blockOrder;
  }
  if (content !== undefined) {
    updateData['content'] = content;
  }

  const { data, error } = await updateBlock(id, updateData);

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ data });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  await requirePlatformAdmin();

  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'id must be a positive integer' } },
      { status: 400 },
    );
  }

  const { data, error } = await softDeleteBlock(id);

  if (error || !data) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Block not found' } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: { deleted: true, id } });
}
