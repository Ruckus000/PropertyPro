/**
 * PATCH /api/admin/clients/:id — Update community details.
 * DELETE /api/admin/clients/:id — Soft-delete a community.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@propertypro/db/supabase/admin';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function from(table: string): any {
  return createAdminClient().from(table);
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  address_line1: z.string().max(500).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  state: z.string().max(2).nullable().optional(),
  zip_code: z.string().max(10).nullable().optional(),
  subscription_plan: z.string().optional(),
  subscription_status: z.string().optional(),
});

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const communityId = Number(id);

  if (!Number.isInteger(communityId) || communityId <= 0) {
    return NextResponse.json(
      { error: { message: 'Invalid community ID' } },
      { status: 400 },
    );
  }

  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { message: 'Validation failed', details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const { data: community, error } = await from('communities')
      .update({
        ...parsed.data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', communityId)
      .is('deleted_at', null)
      .select('id, name, slug')
      .single();

    if (error || !community) {
      return NextResponse.json(
        { error: { message: 'Community not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: community });
  } catch (err) {
    console.error('[Admin] Update client error:', err);
    return NextResponse.json(
      { error: { message: 'Internal server error' } },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const communityId = Number(id);

  if (!Number.isInteger(communityId) || communityId <= 0) {
    return NextResponse.json(
      { error: { message: 'Invalid community ID' } },
      { status: 400 },
    );
  }

  try {
    // Soft-delete: set deleted_at timestamp
    const { data: community, error } = await from('communities')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', communityId)
      .is('deleted_at', null)
      .eq('is_demo', false)
      .select('id, name')
      .single();

    if (error || !community) {
      return NextResponse.json(
        { error: { message: 'Community not found or already deleted' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: { deleted: true, id: community.id } });
  } catch (err) {
    console.error('[Admin] Delete client error:', err);
    return NextResponse.json(
      { error: { message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
