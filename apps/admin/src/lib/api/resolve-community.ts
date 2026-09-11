/**
 * Shared helper to validate and resolve a community ID from route params.
 * Used by admin API routes that operate on a specific community.
 */
import { NextResponse } from 'next/server';
import { createAdminClient } from '@propertypro/db/supabase/admin';

/**
 * Validate the community ID param, verify community exists and (optionally) is not a demo.
 * Returns the numeric ID or a NextResponse error.
 *
 * @param rawId - The raw string from route params
 * @param db - Supabase admin client
 * @param allowDemo - If true, allows demo communities (default: false)
 */
export async function resolveAndVerifyCommunity(
  rawId: string,
  db: ReturnType<typeof createAdminClient>,
  allowDemo = false,
): Promise<number | NextResponse> {
  const communityId = Number(rawId);
  if (!Number.isInteger(communityId) || communityId <= 0) {
    return NextResponse.json(
      { error: { code: 'INVALID_ID', message: 'Invalid community ID' } },
      { status: 400 },
    );
  }

  // admin-community-scope:exempt — single-community resolve by PRIMARY KEY, not a population read: `is_demo` is selected and gated in JS against the caller's `allowDemo` (some callers legitimately resolve a demo), so it is deliberately a projection here rather than a SQL filter. `deleted_at` IS filtered, because a deleted community has no workspace to resolve to.
  const { data } = await db
    .from('communities')
    .select('id, is_demo')
    .eq('id', communityId)
    .is('deleted_at', null)
    .single();

  if (!data || (!allowDemo && (data as Record<string, unknown>).is_demo)) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Community not found' } },
      { status: 404 },
    );
  }

  return communityId;
}
