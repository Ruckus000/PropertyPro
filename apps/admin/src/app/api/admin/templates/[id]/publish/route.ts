import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import {
  getPublicSiteTemplateRow,
  getPublicSiteTemplateUsageCount,
  updatePublicSiteTemplateRow,
} from '@/lib/db/public-site-template-queries';
import {
  buildPublishedSnapshot,
  compileTemplatePreview,
  hashTemplatePayload,
  toPublicSiteTemplateDetail,
} from '@/lib/templates/public-site-template-service';

const publishSchema = z.object({
  expectedUpdatedAt: z.string().min(1),
}).strict();

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const admin = await requirePlatformAdmin();

  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid template id' } },
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

  const parsed = publishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid input' } },
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

  const preview = await compileTemplatePreview({
    jsxSource: currentResult.data.draft_jsx_source,
    templateContext: { communityName: 'Community Name' },
  });

  if (!preview.html) {
    return NextResponse.json(
      {
        error: {
          code: 'COMPILE_ERROR',
          message: preview.errors?.[0]?.message ?? 'Template compilation failed',
          details: preview.errors ?? [],
        },
      },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const updateResult = await updatePublicSiteTemplateRow(id, parsed.data.expectedUpdatedAt, {
    published_snapshot: buildPublishedSnapshot(currentResult.data, preview.html, preview.compiledAt),
    version: currentResult.data.version + 1,
    published_payload_hash: hashTemplatePayload({
      name: currentResult.data.name,
      summary: currentResult.data.summary,
      tags: currentResult.data.tags,
      thumbnailDescriptor: currentResult.data.thumbnail_descriptor,
      communityType: currentResult.data.community_type,
      draftJsxSource: currentResult.data.draft_jsx_source,
    }),
    published_at: now,
    published_by: admin.id,
    updated_at: now,
  });

  if (updateResult.error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: updateResult.error.message } },
      { status: 500 },
    );
  }

  if (updateResult.conflict || !updateResult.data) {
    return NextResponse.json(
      { error: { code: 'CONFLICT', message: 'This template was updated elsewhere. Reload to continue.' } },
      { status: 409 },
    );
  }

  const usageResult = await getPublicSiteTemplateUsageCount(id);
  if (usageResult.error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: usageResult.error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({
    data: toPublicSiteTemplateDetail(updateResult.data, usageResult.count),
    compiledAt: preview.compiledAt,
  });
}
