/**
 * Shared types + helpers for the Starter Packs admin routes.
 * site_starter_packs is NOT tenant-scoped; routes are gated by
 * requirePlatformAdmin() and use the RLS-bypassing admin client.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { StarterPackFieldError } from '@propertypro/shared';

export const COMMUNITY_TYPES = ['condo_718', 'hoa_720', 'apartment'] as const;
export const communityTypeSchema = z.enum(COMMUNITY_TYPES);

export const PACK_COLUMNS =
  'id, slug, display_name, community_type, description, blocks, version, is_archived, created_at, updated_at';

export interface StarterPackRow {
  id: number;
  slug: string;
  display_name: string;
  community_type: (typeof COMMUNITY_TYPES)[number];
  description: string | null;
  blocks: unknown;
  version: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export function shapePack(row: StarterPackRow) {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    communityType: row.community_type,
    description: row.description,
    blocks: row.blocks,
    version: row.version,
    isArchived: row.is_archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function validationErrorResponse(fields: StarterPackFieldError[]) {
  return NextResponse.json({ error: { message: 'Invalid starter pack blocks', fields } }, { status: 400 });
}

export function zodErrorResponse(error: z.ZodError) {
  return NextResponse.json(
    { error: { message: 'Invalid request body', fields: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })) } },
    { status: 400 },
  );
}

/** Strip a trailing -vN from a slug to get the version-family base. */
export function baseSlug(slug: string): string {
  return slug.replace(/-v\d+$/, '');
}
