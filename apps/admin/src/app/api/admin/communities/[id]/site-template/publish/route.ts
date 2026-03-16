/**
 * Publish a community's JSX site template.
 *
 * POST /api/admin/communities/:id/site-template/publish
 *
 * Compiles the draft JSX → static HTML via sucrase + ReactDOMServer,
 * sanitizes with DOMPurify, and stores the published result.
 */
import { NextResponse, type NextRequest } from 'next/server';
import React from 'react';
import { transform } from 'sucrase';
// DOMPurify is dynamically imported below to avoid jsdom build errors in Next.js route handlers
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { resolveAndVerifyCommunity } from '@/lib/api/resolve-community';
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

  // 1. Fetch the draft jsx_template block
  const { data: draftRow, error: fetchError } = await db
    .from('site_blocks')
    .select('*')
    .eq('community_id', communityId)
    .eq('block_type', 'jsx_template')
    .eq('is_draft', true)
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

  // 2. Compile JSX → JS via sucrase
  let compiledCode: string;
  try {
    const result = transform(jsxSource, {
      transforms: ['jsx', 'typescript'],
      jsxRuntime: 'classic',
      production: true,
    });
    compiledCode = result.code;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'JSX compilation failed';
    return NextResponse.json(
      { error: { code: 'COMPILE_ERROR', message } },
      { status: 400 },
    );
  }

  // 3. Execute compiled code to produce a React element, then render to static HTML
  let compiledHtml: string;
  try {
    // The user convention: define a function App() that returns JSX.
    // After sucrase compilation, App is a plain function returning React.createElement calls.
    // eslint-disable-next-line no-new-func
    const factory = new Function(
      'React',
      compiledCode + ';\nreturn typeof App !== "undefined" ? React.createElement(App) : null;',
    );
    const element = factory(React);

    if (!element) {
      return NextResponse.json(
        { error: { code: 'COMPILE_ERROR', message: 'No App component found in JSX source' } },
        { status: 400 },
      );
    }

    // Dynamic import to avoid Next.js build error with react-dom/server in route handlers
    const ReactDOMServer = (await import('react-dom/server')).default;
    compiledHtml = ReactDOMServer.renderToStaticMarkup(element);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Render failed';
    return NextResponse.json(
      { error: { code: 'RENDER_ERROR', message } },
      { status: 400 },
    );
  }

  // 4. Sanitize compiled HTML (defense-in-depth)
  const DOMPurify = (await import('isomorphic-dompurify')).default;
  compiledHtml = DOMPurify.sanitize(compiledHtml, {
    ADD_TAGS: ['style'],
    ADD_ATTR: ['target', 'rel'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  });

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

  // 6. Upsert published row
  const { data: existingPublished } = await db
    .from('site_blocks')
    .select('id')
    .eq('community_id', communityId)
    .eq('block_type', 'jsx_template')
    .eq('is_draft', false)
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

  // 7. Update communities.site_published_at
  await db
    .from('communities')
    .update({ site_published_at: now, updated_at: now } as never)
    .eq('id', communityId);

  return NextResponse.json({ published, compiledHtml });
}
