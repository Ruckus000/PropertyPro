/**
 * PATCH /api/admin/clients/:id — Update community details.
 * DELETE /api/admin/clients/:id — Soft-delete a community.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { createTypedAdminClient } from '@/lib/db/admin-client-types';

type ClientRouteParams = Promise<{ id: string }> | { id: string };

interface ClientRouteContext {
  params: ClientRouteParams;
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

async function resolveCommunityId(params: ClientRouteParams): Promise<number> {
  // Accept both runtime object params and Next-generated async handler params.
  const { id } = await params;
  return Number(id);
}

async function authorizeRequest(): Promise<NextResponse | null> {
  try {
    await requirePlatformAdmin();
    return null;
  } catch (error) {
    if (error instanceof Response) {
      const message = error.status === 401
        ? 'Unauthorized'
        : error.status === 403
          ? 'Forbidden'
          : error.status === 500
            ? 'Server misconfiguration'
            : 'Internal server error';
      return NextResponse.json({ error: { message } }, { status: error.status });
    }

    console.error('[Admin] Platform admin authorization error:', error);
    return NextResponse.json(
      { error: { message: 'Internal server error' } },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, { params }: ClientRouteContext) {
  const authError = await authorizeRequest();
  if (authError) {
    return authError;
  }

  const communityId = await resolveCommunityId(params);

  if (!Number.isInteger(communityId) || communityId <= 0) {
    return NextResponse.json(
      { error: { message: 'Invalid community ID' } },
      { status: 400 },
    );
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { message: 'Invalid JSON body' } },
        { status: 400 },
      );
    }

    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { message: 'Validation failed', details: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const db = createTypedAdminClient();
    const { data: community, error } = await db
      .from('communities')
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

export async function DELETE(_request: NextRequest, { params }: ClientRouteContext) {
  const authError = await authorizeRequest();
  if (authError) {
    return authError;
  }

  const communityId = await resolveCommunityId(params);

  if (!Number.isInteger(communityId) || communityId <= 0) {
    return NextResponse.json(
      { error: { message: 'Invalid community ID' } },
      { status: 400 },
    );
  }

  try {
    const db = createTypedAdminClient();
    // Soft-delete: set deleted_at timestamp
    const { data: community, error } = await db
      .from('communities')
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
