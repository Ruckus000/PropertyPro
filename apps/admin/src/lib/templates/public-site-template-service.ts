import { createHash, randomBytes } from 'node:crypto';
import { COMMUNITY_TYPE_DISPLAY_NAMES, type CommunityType } from '@propertypro/shared';
import {
  createPublicSiteTemplateRow,
  findPublicSiteTemplateRowBySlug,
  getNextPublicSiteTemplateSortOrder,
  getPublicSiteTemplateRow,
  type PublicSiteTemplateQueryError,
  getPublicSiteTemplateUsageCount,
  listPublicSiteTemplateRows,
  listPublicSiteTemplateUsageCounts,
} from '@/lib/db/public-site-template-queries';
import {
  compileJsxToHtmlDetailed,
  type TemplateCompileContext,
  type TemplateCompileDiagnostic,
} from '@/lib/site-template/compile-template';
import { buildDefaultTemplateDraft } from './template-scaffold';
import type {
  PublicSiteTemplateDetail,
  PublicSiteTemplateEditorInput,
  PublicSiteTemplateListItem,
  PublicSiteTemplatePreviewResponse,
  PublicSiteTemplatePublishedSnapshot,
  PublicSiteTemplateRow,
  PublicSiteTemplateThumbnailDescriptor,
  TemplateLifecycleState,
  TemplatePreviewDiagnostic,
} from './types';

const FALLBACK_THUMBNAIL: PublicSiteTemplateThumbnailDescriptor = {
  gradient: ['#1d4ed8', '#0f172a'],
  layout: 'hero-grid',
};

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

function uniqueTrimmed(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function normalizeThumbnailDescriptor(
  value: PublicSiteTemplateThumbnailDescriptor | null | undefined,
): PublicSiteTemplateThumbnailDescriptor {
  if (!value) return FALLBACK_THUMBNAIL;

  return {
    layout: value.layout?.trim() || FALLBACK_THUMBNAIL.layout,
    gradient: [
      value.gradient?.[0]?.trim() || FALLBACK_THUMBNAIL.gradient[0],
      value.gradient?.[1]?.trim() || FALLBACK_THUMBNAIL.gradient[1],
    ],
  };
}

export function normalizeEditorInput(
  input: PublicSiteTemplateEditorInput,
): PublicSiteTemplateEditorInput {
  return {
    name: input.name.trim(),
    summary: input.summary.trim(),
    tags: uniqueTrimmed(input.tags),
    thumbnailDescriptor: normalizeThumbnailDescriptor(input.thumbnailDescriptor),
    communityType: input.communityType,
    draftJsxSource: input.draftJsxSource,
  };
}

export function buildPublishablePayload(input: PublicSiteTemplateEditorInput) {
  const normalized = normalizeEditorInput(input);

  return {
    name: normalized.name,
    summary: normalized.summary,
    tags: normalized.tags,
    thumbnailDescriptor: normalized.thumbnailDescriptor,
    communityType: normalized.communityType,
    jsxSource: normalized.draftJsxSource,
  };
}

export function hashTemplatePayload(input: PublicSiteTemplateEditorInput): string {
  return createHash('sha256')
    .update(JSON.stringify(buildPublishablePayload(input)))
    .digest('hex');
}

export function deriveTemplateLifecycleState(row: PublicSiteTemplateRow): TemplateLifecycleState {
  if (!row.published_at) {
    return 'draft_only';
  }

  const currentHash = hashTemplatePayload({
    name: row.name,
    summary: row.summary,
    tags: row.tags,
    thumbnailDescriptor: row.thumbnail_descriptor,
    communityType: row.community_type,
    draftJsxSource: row.draft_jsx_source,
  });

  if (row.published_payload_hash && row.published_payload_hash === currentHash) {
    return 'published_current';
  }

  return 'published_with_unpublished_changes';
}

export function generateTemplateSlug(name: string): string {
  const slugBase = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'template';

  return `${slugBase}-${randomBytes(3).toString('hex')}`;
}

export function buildPublishedSnapshot(
  row: PublicSiteTemplateRow,
  compiledHtml: string,
  compiledAt: string,
): PublicSiteTemplatePublishedSnapshot {
  return {
    name: row.name,
    summary: row.summary,
    tags: row.tags,
    thumbnailDescriptor: normalizeThumbnailDescriptor(row.thumbnail_descriptor),
    communityType: row.community_type,
    jsxSource: row.draft_jsx_source,
    compiledHtml,
    compiledAt,
  };
}

export function toPublicSiteTemplateListItem(
  row: PublicSiteTemplateRow,
  usageCount: number,
): PublicSiteTemplateListItem {
  const lifecycleState = deriveTemplateLifecycleState(row);

  return {
    id: row.id,
    slug: row.slug,
    communityType: row.community_type,
    sortOrder: row.sort_order,
    name: row.name,
    summary: row.summary,
    tags: row.tags,
    thumbnailDescriptor: normalizeThumbnailDescriptor(row.thumbnail_descriptor),
    version: row.version,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    usageCount,
    lifecycleState,
    hasUnpublishedChanges: lifecycleState === 'published_with_unpublished_changes',
  };
}

export function toPublicSiteTemplateDetail(
  row: PublicSiteTemplateRow,
  usageCount: number,
): PublicSiteTemplateDetail {
  return {
    ...toPublicSiteTemplateListItem(row, usageCount),
    draftJsxSource: row.draft_jsx_source,
    publishedSnapshot: row.published_snapshot,
    canEditCommunityType: !row.published_at,
  };
}

export function filterPublicSiteTemplates(
  templates: PublicSiteTemplateListItem[],
  filters: {
    q?: string | null;
    communityType?: CommunityType | 'all' | null;
    lifecycle?: 'all' | 'draft' | 'live' | 'needs_publish' | null;
  },
): PublicSiteTemplateListItem[] {
  const query = filters.q?.trim().toLowerCase() ?? '';

  return templates.filter((template) => {
    if (
      filters.communityType
      && filters.communityType !== 'all'
      && template.communityType !== filters.communityType
    ) {
      return false;
    }

    if (filters.lifecycle === 'draft' && template.lifecycleState !== 'draft_only') {
      return false;
    }

    if (filters.lifecycle === 'live' && template.lifecycleState !== 'published_current') {
      return false;
    }

    if (
      filters.lifecycle === 'needs_publish'
      && template.lifecycleState !== 'published_with_unpublished_changes'
    ) {
      return false;
    }

    if (!query) return true;

    const haystack = [
      template.name,
      template.slug,
      template.summary,
      COMMUNITY_TYPE_DISPLAY_NAMES[template.communityType],
      ...template.tags,
    ].join(' ').toLowerCase();

    return haystack.includes(query);
  });
}

function toPreviewDiagnostic(
  diagnostic: TemplateCompileDiagnostic,
): TemplatePreviewDiagnostic {
  return {
    stage: diagnostic.stage,
    message: diagnostic.message,
    line: diagnostic.line,
    column: diagnostic.column,
    excerpt: diagnostic.excerpt,
  };
}

export async function compileTemplatePreview(params: {
  jsxSource: string;
  templateContext?: TemplateCompileContext;
}): Promise<PublicSiteTemplatePreviewResponse> {
  const compiledAt = new Date().toISOString();
  const result = await compileJsxToHtmlDetailed(params.jsxSource, {
    templateContext: params.templateContext,
  });

  return {
    html: result.html,
    errors: result.errors?.map(toPreviewDiagnostic),
    compiledAt,
  };
}

export async function listPublicSiteTemplates(
  filters: {
    q?: string | null;
    communityType?: CommunityType | 'all' | null;
    lifecycle?: 'all' | 'draft' | 'live' | 'needs_publish' | null;
  } = {},
): Promise<PublicSiteTemplateListItem[]> {
  const [{ data: rows, error }, { data: usageCounts, error: usageError }] = await Promise.all([
    listPublicSiteTemplateRows(),
    listPublicSiteTemplateUsageCounts(),
  ]);

  if (error) {
    throw new Error(error.message);
  }

  if (usageError) {
    throw new Error(usageError.message);
  }

  const items = (rows ?? []).map((row) => toPublicSiteTemplateListItem(row, usageCounts[row.id] ?? 0));
  return filterPublicSiteTemplates(items, filters);
}

export async function getPublicSiteTemplateEditorData(id: number): Promise<PublicSiteTemplateDetail> {
  const [{ data: row, error }, { count, error: usageError }] = await Promise.all([
    getPublicSiteTemplateRow(id),
    getPublicSiteTemplateUsageCount(id),
  ]);

  if (error || !row) {
    throw new Error(error?.message ?? 'Template not found');
  }

  if (usageError) {
    throw new Error(usageError.message);
  }

  return toPublicSiteTemplateDetail(row, count);
}

async function buildUniqueTemplateSlug(name: string): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const slug = generateTemplateSlug(name);
    const existing = await findPublicSiteTemplateRowBySlug(slug);
    if (existing.error) {
      throw new Error(existing.error.message);
    }
    if (!existing.data) return slug;
  }

  throw new Error('Failed to generate unique template slug');
}

export async function buildUniqueTemplateSlugForName(name: string): Promise<string> {
  return buildUniqueTemplateSlug(name);
}

export async function createPublicSiteTemplate(communityType: CommunityType): Promise<PublicSiteTemplateDetail> {
  const draft = buildDefaultTemplateDraft(communityType);
  const normalized = normalizeEditorInput(draft);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const sortOrderResult = await getNextPublicSiteTemplateSortOrder(communityType);

    if (sortOrderResult.error) {
      throw new Error(sortOrderResult.error.message);
    }

    const insertResult = await createPublicSiteTemplateRow({
      slug: await buildUniqueTemplateSlug(normalized.name),
      community_type: normalized.communityType,
      sort_order: sortOrderResult.sortOrder,
      name: normalized.name,
      summary: normalized.summary,
      tags: normalized.tags,
      thumbnail_descriptor: normalized.thumbnailDescriptor,
      draft_jsx_source: normalized.draftJsxSource,
      version: 0,
      published_snapshot: null,
      published_payload_hash: null,
      published_at: null,
      published_by: null,
    });

    if (insertResult.data) {
      return toPublicSiteTemplateDetail(insertResult.data, 0);
    }

    if (!isUniqueConstraintError(insertResult.error) || attempt === 3) {
      throw new Error(insertResult.error?.message ?? 'Failed to create template');
    }
  }

  throw new Error('Failed to create template');
}

export type {
  PublicSiteTemplateListItem,
  PublicSiteTemplateDetail as PublicSiteTemplateEditorData,
  PublicSiteTemplatePreviewResponse as TemplatePreviewResult,
  TemplateLifecycleState as PublicSiteTemplateLifecycleState,
};
