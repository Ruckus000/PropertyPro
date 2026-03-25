/**
 * Publish a community's JSX site template.
 *
 * POST /api/admin/communities/:id/site-template/publish
 *
 * Compiles the draft JSX → static HTML via sucrase + ReactDOMServer,
 * sanitizes with DOMPurify, and stores the published result.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { resolveAndVerifyCommunity } from '@/lib/api/resolve-community';
import { compileJsxToHtml } from '@/lib/site-template/compile-template';
import { createAdminClient } from '@propertypro/db/supabase/admin';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  await requirePlatformAdmin();

  const { id } = await context.params;
  const db = createAdminClient();

  const result = await resolveAndVerifyCommunity(id, db, true);
  if (result instanceof NextResponse) return result;
  const communityId = result;

  // Parse optional variant from request body (default: 'public')
  const body = await _request.json().catch(() => ({}));
  const variant = body?.variant === 'mobile' ? 'mobile' : 'public';

  // 1. Fetch the draft jsx_template block for this variant
  const { data: draftRow, error: fetchError } = await db
    .from('site_blocks')
    .select('*')
    .eq('community_id', communityId)
    .eq('block_type', 'jsx_template')
    .eq('is_draft', true)
    .eq('template_variant', variant)
    .is('deleted_at', null)
    .single();

  if (fetchError || !draftRow) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No draft template found' } },
      { status: 404 },
    );
  }

  const draft = draftRow as Record<string, unknown>;
  const content = draft.content as { jsxSource?: string };
  const jsxSource = content?.jsxSource;

  if (!jsxSource || typeof jsxSource !== 'string') {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Draft has no JSX source' } },
      { status: 400 },
    );
  }

  // 2. Compile JSX → sanitized static HTML
  let compiledHtml: string;
  try {
    compiledHtml = await compileJsxToHtml(jsxSource);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Compilation failed';
    return NextResponse.json(
      { error: { code: 'COMPILE_ERROR', message } },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();

  // 5. Update draft content with compiled result
  const updatedContent = {
    ...content,
    compiledHtml,
    compiledAt: now,
  };

  await db
    .from('site_blocks')
    .update({ content: updatedContent, updated_at: now } as never)
    .eq('id', draft.id as number);

  // 6. Upsert published row for this variant
  const { data: existingPublished } = await db
    .from('site_blocks')
    .select('id')
    .eq('community_id', communityId)
    .eq('block_type', 'jsx_template')
    .eq('is_draft', false)
    .eq('template_variant', variant)
    .is('deleted_at', null)
    .single();

  let published: Record<string, unknown>;

  if (existingPublished) {
    const { data: updated, error } = await db
      .from('site_blocks')
      .update({
        content: updatedContent,
        published_at: now,
        updated_at: now,
      } as never)
      .eq('id', (existingPublished as Record<string, unknown>).id as number)
      .select('*')
      .single();

    if (error || !updated) {
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to update published template' } },
        { status: 500 },
      );
    }
    published = updated as Record<string, unknown>;
  } else {
    const { data: inserted, error } = await db
      .from('site_blocks')
      .insert({
        community_id: communityId,
        block_type: 'jsx_template',
        block_order: 0,
        content: updatedContent,
        is_draft: false,
        published_at: now,
        template_variant: variant,
      } as never)
      .select('*')
      .single();

    if (error || !inserted) {
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to create published template' } },
        { status: 500 },
      );
    }
    published = inserted as Record<string, unknown>;
  }

  // 7. Update communities.site_published_at (public variant only)
  if (variant === 'public') {
    await db
      .from('communities')
      .update({ site_published_at: now, updated_at: now } as never)
      .eq('id', communityId);
  }

  return NextResponse.json({ published, compiledHtml });
}
