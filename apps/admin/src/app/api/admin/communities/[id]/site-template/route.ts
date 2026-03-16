/**
 * Site template API for the admin platform.
 *
 * GET  /api/admin/communities/:id/site-template — fetch draft and published JSX templates
 * PUT  /api/admin/communities/:id/site-template — save/update draft JSX template
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { resolveAndVerifyCommunity } from '@/lib/api/resolve-community';
import { createAdminClient } from '@propertypro/db/supabase/admin';

const VALID_VARIANTS = ['public', 'mobile'] as const;
type TemplateVariant = (typeof VALID_VARIANTS)[number];

const putSchema = z.object({
  jsxSource: z.string().max(100_000),
  variant: z.enum(VALID_VARIANTS).default('public'),
}).strict();

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  await requirePlatformAdmin();

  const { id } = await context.params;
  const db = createAdminClient();

  const result = await resolveAndVerifyCommunity(id, db, true);
  if (result instanceof NextResponse) return result;
  const communityId = result;

  const variant = (_request.nextUrl.searchParams.get('variant') ?? 'public') as string;
  if (!VALID_VARIANTS.includes(variant as TemplateVariant)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: `Invalid variant: ${variant}` } },
      { status: 400 },
    );
  }

  const { data, error } = await db
    .from('site_blocks')
    .select('*')
    .eq('community_id', communityId)
    .eq('block_type', 'jsx_template')
    .eq('template_variant', variant)
    .is('deleted_at', null);

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch site template' } },
      { status: 500 },
    );
  }

  const rows = data as Record<string, unknown>[];
  const draft = rows.find((r) => r.is_draft === true) ?? null;
  const published = rows.find((r) => r.is_draft === false) ?? null;

  return NextResponse.json({ draft, published });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  await requirePlatformAdmin();

  const { id } = await context.params;
  const db = createAdminClient();

  const result = await resolveAndVerifyCommunity(id, db, true);
  if (result instanceof NextResponse) return result;
  const communityId = result;

  const body = await request.json();
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid input' } },
      { status: 400 },
    );
  }

  const content = {
    jsxSource: parsed.data.jsxSource,
  };

  const variant = parsed.data.variant;

  // Check if a draft already exists for this variant
  const { data: existing } = await db
    .from('site_blocks')
    .select('id')
    .eq('community_id', communityId)
    .eq('block_type', 'jsx_template')
    .eq('is_draft', true)
    .eq('template_variant', variant)
    .is('deleted_at', null)
    .single();

  let draft: Record<string, unknown>;

  if (existing) {
    // Update existing draft
    const { data: updated, error } = await db
      .from('site_blocks')
      .update({
        content,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', (existing as Record<string, unknown>).id as number)
      .select('*')
      .single();

    if (error || !updated) {
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to update draft' } },
        { status: 500 },
      );
    }
    draft = updated as Record<string, unknown>;
  } else {
    // Insert new draft
    const { data: inserted, error } = await db
      .from('site_blocks')
      .insert({
        community_id: communityId,
        block_type: 'jsx_template',
        block_order: 0,
        content,
        is_draft: true,
        template_variant: variant,
      } as never)
      .select('*')
      .single();

    if (error || !inserted) {
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to create draft' } },
        { status: 500 },
      );
    }
    draft = inserted as Record<string, unknown>;
  }

  return NextResponse.json({ draft });
}
