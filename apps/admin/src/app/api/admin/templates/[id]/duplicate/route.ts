import { NextResponse, type NextRequest } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import {
  createPublicSiteTemplateRow,
  getNextPublicSiteTemplateSortOrder,
  getPublicSiteTemplateRow,
  type PublicSiteTemplateQueryError,
} from '@/lib/db/public-site-template-queries';
import {
  buildUniqueTemplateSlugForName,
  toPublicSiteTemplateDetail,
} from '@/lib/templates/public-site-template-service';

interface RouteContext {
  params: Promise<{ id: string }>;
}

function isUniqueConstraintError(error: PublicSiteTemplateQueryError | null | undefined): boolean {
  if (!error) return false;

  if (error.code === '23505') {
    return true;
  }

  const haystack = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes('duplicate key') || haystack.includes('unique constraint');
}

export async function POST(_request: NextRequest, context: RouteContext) {
  await requirePlatformAdmin();

  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid template id' } },
      { status: 400 },
    );
  }

  const currentResult = await getPublicSiteTemplateRow(id);
  if (currentResult.error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: currentResult.error.message } },
      { status: 500 },
    );
  }

  if (!currentResult.data) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Template not found' } },
      { status: 404 },
    );
  }

  const copyName = `Copy of ${currentResult.data.name}`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const nextSortOrder = await getNextPublicSiteTemplateSortOrder(currentResult.data.community_type);
    if (nextSortOrder.error) {
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: nextSortOrder.error.message } },
        { status: 500 },
      );
    }

    const insertResult = await createPublicSiteTemplateRow({
      slug: await buildUniqueTemplateSlugForName(copyName),
      community_type: currentResult.data.community_type,
      sort_order: nextSortOrder.sortOrder,
      name: copyName,
      summary: currentResult.data.summary,
      tags: currentResult.data.tags,
      thumbnail_descriptor: currentResult.data.thumbnail_descriptor,
      draft_jsx_source: currentResult.data.draft_jsx_source,
      version: 0,
      published_snapshot: null,
      published_payload_hash: null,
      published_at: null,
      published_by: null,
    });

    if (insertResult.data) {
      return NextResponse.json({ data: toPublicSiteTemplateDetail(insertResult.data, 0) }, { status: 201 });
    }

    if (!isUniqueConstraintError(insertResult.error) || attempt === 3) {
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: insertResult.error?.message ?? 'Failed to duplicate template' } },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Failed to duplicate template' } },
    { status: 500 },
  );
}
