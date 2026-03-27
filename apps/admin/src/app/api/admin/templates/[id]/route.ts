import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import {
  getPublicSiteTemplateRow,
  getPublicSiteTemplateUsageCount,
  updatePublicSiteTemplateRow,
} from '@/lib/db/public-site-template-queries';
import {
  normalizeEditorInput,
  toPublicSiteTemplateDetail,
} from '@/lib/templates/public-site-template-service';

const updateSchema = z.object({
  expectedUpdatedAt: z.string().min(1),
  name: z.string().trim().min(3).max(120),
  summary: z.string().max(400).default(''),
  tags: z.array(z.string().max(40)).max(12).default([]),
  thumbnailDescriptor: z.object({
    layout: z.string().min(1).max(40),
    gradient: z.tuple([z.string().min(1), z.string().min(1)]),
  }),
  communityType: z.enum(['condo_718', 'hoa_720', 'apartment']),
  draftJsxSource: z.string().min(1).max(100_000),
}).strict();

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  await requirePlatformAdmin();

  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid template id' } },
      { status: 400 },
    );
  }

  const [rowResult, usageResult] = await Promise.all([
    getPublicSiteTemplateRow(id),
    getPublicSiteTemplateUsageCount(id),
  ]);

  if (rowResult.error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: rowResult.error.message } },
      { status: 500 },
    );
  }

  if (!rowResult.data) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Template not found' } },
      { status: 404 },
    );
  }

  if (usageResult.error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: usageResult.error.message } },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: toPublicSiteTemplateDetail(rowResult.data, usageResult.count) });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  await requirePlatformAdmin();

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

  const parsed = updateSchema.safeParse(body);
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

  if (
    currentResult.data.published_at
    && currentResult.data.community_type !== parsed.data.communityType
  ) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Community type cannot change after first publish' } },
      { status: 400 },
    );
  }

  const normalized = normalizeEditorInput({
    name: parsed.data.name,
    summary: parsed.data.summary,
    tags: parsed.data.tags,
    thumbnailDescriptor: parsed.data.thumbnailDescriptor,
    communityType: parsed.data.communityType,
    draftJsxSource: parsed.data.draftJsxSource,
  });

  const updateResult = await updatePublicSiteTemplateRow(id, parsed.data.expectedUpdatedAt, {
    community_type: normalized.communityType,
    name: normalized.name,
    summary: normalized.summary,
    tags: normalized.tags,
    thumbnail_descriptor: normalized.thumbnailDescriptor,
    draft_jsx_source: normalized.draftJsxSource,
    updated_at: new Date().toISOString(),
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

  return NextResponse.json({ data: toPublicSiteTemplateDetail(updateResult.data, usageResult.count) });
}
