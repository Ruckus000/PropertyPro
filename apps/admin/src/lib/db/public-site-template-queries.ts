import { createAdminClient } from '@propertypro/db/supabase/admin';
import type { CommunityType } from '@propertypro/shared';
import type {
  PublicSiteTemplatePublishedSnapshot,
  PublicSiteTemplateRow,
  PublicSiteTemplateThumbnailDescriptor,
} from '@/lib/templates/types';

/**
 * Returns a Supabase query builder for the given table.
 *
 * Returns `any` because the PostgREST client lacks generated types for
 * `public_site_templates`. All callers cast results to typed interfaces.
 * This can be replaced with generated types once `supabase gen types` is
 * integrated into the build pipeline for the admin app.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function from(table: string): any {
  return createAdminClient().from(table);
}

export interface PublicSiteTemplateQueryError {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
}

export interface PublicSiteTemplateInsertRow {
  slug: string;
  community_type: CommunityType;
  sort_order: number;
  name: string;
  summary: string;
  tags: string[];
  thumbnail_descriptor: PublicSiteTemplateThumbnailDescriptor;
  draft_jsx_source: string;
  published_snapshot?: PublicSiteTemplatePublishedSnapshot | null;
  version?: number;
  published_payload_hash?: string | null;
  published_at?: string | null;
  published_by?: string | null;
}

export interface PublicSiteTemplateUpdateRow {
  community_type?: CommunityType;
  name?: string;
  summary?: string;
  tags?: string[];
  thumbnail_descriptor?: PublicSiteTemplateThumbnailDescriptor;
  draft_jsx_source?: string;
  published_snapshot?: PublicSiteTemplatePublishedSnapshot | null;
  version?: number;
  published_payload_hash?: string | null;
  published_at?: string | null;
  published_by?: string | null;
  updated_at: string;
}

export async function listPublicSiteTemplateRows(): Promise<{
  data: PublicSiteTemplateRow[] | null;
  error: PublicSiteTemplateQueryError | null;
}> {
  const { data, error } = await from('public_site_templates')
    .select('*')
    .is('archived_at', null)
    .order('updated_at', { ascending: false });

  return {
    data: (data as PublicSiteTemplateRow[] | null) ?? null,
    error,
  };
}

export async function getPublicSiteTemplateRow(id: number): Promise<{
  data: PublicSiteTemplateRow | null;
  error: PublicSiteTemplateQueryError | null;
}> {
  const { data, error } = await from('public_site_templates')
    .select('*')
    .eq('id', id)
    .is('archived_at', null)
    .maybeSingle();

  return {
    data: (data as PublicSiteTemplateRow | null) ?? null,
    error,
  };
}

export async function getNextPublicSiteTemplateSortOrder(communityType: CommunityType): Promise<{
  sortOrder: number;
  error: PublicSiteTemplateQueryError | null;
}> {
  const { data, error } = await from('public_site_templates')
    .select('sort_order')
    .eq('community_type', communityType)
    .is('archived_at', null)
    .order('sort_order', { ascending: false })
    .limit(1);

  if (error) {
    return { sortOrder: 0, error };
  }

  const current = (data as Array<{ sort_order: number }> | null)?.[0]?.sort_order ?? -1;
  return { sortOrder: current + 1, error: null };
}

export async function createPublicSiteTemplateRow(
  row: PublicSiteTemplateInsertRow,
): Promise<{ data: PublicSiteTemplateRow | null; error: PublicSiteTemplateQueryError | null }> {
  const { data, error } = await from('public_site_templates')
    .insert(row)
    .select('*')
    .single();

  return {
    data: (data as PublicSiteTemplateRow | null) ?? null,
    error,
  };
}

export async function findPublicSiteTemplateRowBySlug(slug: string): Promise<{
  data: PublicSiteTemplateRow | null;
  error: PublicSiteTemplateQueryError | null;
}> {
  const { data, error } = await from('public_site_templates')
    .select('*')
    .eq('slug', slug)
    .is('archived_at', null)
    .maybeSingle();

  return {
    data: (data as PublicSiteTemplateRow | null) ?? null,
    error,
  };
}

export async function updatePublicSiteTemplateRow(
  id: number,
  expectedUpdatedAt: string,
  row: PublicSiteTemplateUpdateRow,
): Promise<{
  data: PublicSiteTemplateRow | null;
  error: PublicSiteTemplateQueryError | null;
  conflict: boolean;
}> {
  const { data, error } = await from('public_site_templates')
    .update(row)
    .eq('id', id)
    .eq('updated_at', expectedUpdatedAt)
    .is('archived_at', null)
    .select('*');

  if (error) {
    return { data: null, error, conflict: false };
  }

  const updated = (data as PublicSiteTemplateRow[] | null)?.[0] ?? null;
  if (!updated) {
    return { data: null, error: null, conflict: true };
  }

  return { data: updated, error: null, conflict: false };
}

/**
 * Fetches all template IDs from demo_instances and counts in JS.
 * PostgREST doesn't support GROUP BY natively, so client-side aggregation
 * is the simplest approach for the batch case (gallery page). For
 * single-template counts, use `getPublicSiteTemplateUsageCount` instead.
 */
export async function listPublicSiteTemplateUsageCounts(): Promise<{
  data: Record<number, number>;
  error: PublicSiteTemplateQueryError | null;
}> {
  const { data, error } = await from('demo_instances')
    .select('public_template_id')
    .is('deleted_at', null)
    .not('public_template_id', 'is', null);

  if (error) {
    return { data: {}, error };
  }

  const counts: Record<number, number> = {};
  for (const row of (data as Array<{ public_template_id: number | null }> | null) ?? []) {
    if (typeof row.public_template_id !== 'number') continue;
    counts[row.public_template_id] = (counts[row.public_template_id] ?? 0) + 1;
  }

  return { data: counts, error: null };
}

export async function getPublicSiteTemplateUsageCount(id: number): Promise<{
  count: number;
  error: PublicSiteTemplateQueryError | null;
}> {
  const { count, error } = await from('demo_instances')
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null)
    .eq('public_template_id', id);

  return { count: count ?? 0, error };
}
