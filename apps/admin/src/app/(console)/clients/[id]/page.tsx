/**
 * Client Workspace page.
 *
 * Shows the community workspace: header + tab navigation (Overview, Billing,
 * Members, Compliance, Access, Website, Support, Settings). Returns 404 if
 * the community doesn't exist.
 */
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { ClientWorkspace } from '@/components/clients/ClientWorkspace';
import type { CommunitySettings } from '@/components/clients/community-settings';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getCommunityActivity } from '@/lib/server/community-activity';
import { getCommunitySnapshots } from '@/lib/server/community-snapshots';

export const dynamic = 'force-dynamic';

// Next.js 15+ passes params as a Promise (async page props).
interface PageProps {
  params: Promise<{ id: string }>;
}

const CommunityRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  community_type: z.enum(['condo_718', 'hoa_720', 'apartment']),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zip_code: z.string().nullable(),
  address_line1: z.string().nullable(),
  timezone: z.string(),
  subscription_status: z.string().nullable(),
  subscription_plan: z.string().nullable(),
  subscription_current_period_end_at: z.string().nullable(),
  custom_domain: z.string().nullable(),
  custom_domain_status: z.string().nullable(),
  custom_domain_verified_at: z.string().nullable(),
  site_published_at: z.string().nullable(),
  transparency_enabled: z.boolean(),
  community_settings: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
  is_demo: z.boolean(),
});

const DeletionRequestRowSchema = z.object({
  id: z.number(),
  status: z.string(),
  cooling_ends_at: z.string(),
});

export default async function ClientWorkspacePage({ params }: PageProps) {
  // AUTHZ: platform-admin only. This page reads a single tenant's full record
  // with the service-role client (RLS-bypassing), so it re-asserts the identity
  // middleware already verified rather than trusting the matcher alone.
  await requireAdminPageSession();

  const { id } = await params;
  const communityId = Number(id);

  if (!Number.isInteger(communityId) || communityId <= 0) {
    notFound();
  }

  const db = createAdminClient();

  // Fetch community (need it to gate 404)
  const communityResult = await db
    .from('communities')
    .select('id, name, slug, community_type, city, state, zip_code, address_line1, timezone, subscription_status, subscription_plan, subscription_current_period_end_at, custom_domain, custom_domain_status, custom_domain_verified_at, site_published_at, transparency_enabled, community_settings, created_at, is_demo')
    .eq('id', communityId)
    .is('deleted_at', null)
    .single();

  const communityParse = CommunityRowSchema.safeParse(communityResult.data);
  if (!communityParse.success) {
    notFound();
  }
  const community = communityParse.data;

  // Fetch counts, compliance score, the open deletion request (if any), and
  // recent activity in parallel. `getCommunityActivity` throws internally on
  // a query error, matching the "throw rather than degrade to empty" policy
  // below.
  const [membersResult, documentsResult, complianceResult, deletionResult, activity, snapshots] = await Promise.all([
    db.from('user_roles').select('*', { count: 'exact', head: true }).eq('community_id', communityId),
    db.from('documents').select('*', { count: 'exact', head: true }).eq('community_id', communityId).is('deleted_at', null),
    // Use the actual table name (not the non-existent compliance_items view)
    db.from('compliance_checklist_items')
      .select('document_id, deadline, is_applicable')
      .eq('community_id', communityId)
      .is('deleted_at', null),
    // `account_deletion_requests` has no per-community uniqueness constraint on
    // an open ('cooling') request, so this takes the most recent one rather
    // than `.single()` — a second concurrent request should never happen, but
    // `.single()` would 500 the whole page if it somehow did.
    db.from('account_deletion_requests')
      .select('id, status, cooling_ends_at')
      .eq('community_id', communityId)
      .eq('status', 'cooling')
      .order('created_at', { ascending: false })
      .limit(1),
    getCommunityActivity(communityId),
    getCommunitySnapshots(communityId),
  ]);

  // These used to degrade to 0 / null on a failed query, which is
  // indistinguishable from a genuinely empty community — an operator would
  // read "0 members, 0 documents, no compliance score" as fact. Let the
  // failure reach error.tsx instead.
  if (membersResult.error) {
    throw new Error(`Failed to count members: ${membersResult.error.message}`);
  }
  if (documentsResult.error) {
    throw new Error(`Failed to count documents: ${documentsResult.error.message}`);
  }
  if (complianceResult.error) {
    throw new Error(`Failed to load compliance items: ${complianceResult.error.message}`);
  }
  if (deletionResult.error) {
    throw new Error(`Failed to load deletion request: ${deletionResult.error.message}`);
  }

  const memberCount = membersResult.count ?? 0;
  const documentCount = documentsResult.count ?? 0;

  // Compute compliance score the same way the compliance API does
  const rows = (complianceResult.data ?? []) as { document_id: number | null; deadline: string | null; is_applicable: boolean }[];
  const applicable = rows.filter((r) => r.is_applicable);
  const met = applicable.filter((r) => r.document_id !== null);
  const complianceScore = applicable.length > 0 ? Math.round((met.length / applicable.length) * 100) : null;

  const deletionRow = deletionResult.data?.[0] ?? null;
  const deletionParse = deletionRow ? DeletionRequestRowSchema.safeParse(deletionRow) : null;
  const openDeletionRequest = deletionParse?.success
    ? { id: deletionParse.data.id, status: deletionParse.data.status, coolingEndsAt: deletionParse.data.cooling_ends_at }
    : null;

  // `ClientWorkspace` owns this screen's heading (via `WorkspaceHeader` /
  // `AdminPageHeader`) and tab chrome.
  return (
    <ClientWorkspace
      community={{
        ...community,
        timezone: community.timezone,
        transparency_enabled: community.transparency_enabled,
        community_settings: (community.community_settings ?? {}) as CommunitySettings,
        memberCount,
        documentCount,
        complianceScore,
        openDeletionRequest,
        activity,
        snapshots,
      }}
    />
  );
}
