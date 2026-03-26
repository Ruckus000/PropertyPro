/**
 * Client Workspace page.
 *
 * Shows community overview with tab navigation (Overview, Members, Compliance, Settings).
 * Returns 404 if the community doesn't exist or is a demo.
 */
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { AdminLayout } from '@/components/AdminLayout';
import { ClientWorkspace } from '@/components/clients/ClientWorkspace';
import { getCoolingDeletionRequestCount } from '@/lib/server/deletion-requests';

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
  transparency_enabled: z.boolean(),
  community_settings: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
  is_demo: z.boolean(),
});

export default async function ClientWorkspacePage({ params }: PageProps) {
  const { id } = await params;
  const communityId = Number(id);

  if (!Number.isInteger(communityId) || communityId <= 0) {
    notFound();
  }

  const db = createAdminClient();

  // Fetch community (need it to gate 404)
  const communityResult = await db
    .from('communities')
    .select('id, name, slug, community_type, city, state, zip_code, address_line1, timezone, subscription_status, subscription_plan, transparency_enabled, community_settings, created_at, is_demo')
    .eq('id', communityId)
    .is('deleted_at', null)
    .single();

  const communityParse = CommunityRowSchema.safeParse(communityResult.data);
  if (!communityParse.success || communityParse.data.is_demo) {
    notFound();
  }
  const community = communityParse.data;

  // Fetch counts and compliance score in parallel
  const [membersResult, documentsResult, complianceResult, coolingCount] = await Promise.all([
    db.from('user_roles').select('*', { count: 'exact', head: true }).eq('community_id', communityId),
    db.from('documents').select('*', { count: 'exact', head: true }).eq('community_id', communityId).is('deleted_at', null),
    // Use the actual table name (not the non-existent compliance_items view)
    db.from('compliance_checklist_items')
      .select('document_id, deadline, is_applicable')
      .eq('community_id', communityId)
      .is('deleted_at', null),
    getCoolingDeletionRequestCount(),
  ]);

  const memberCount = membersResult.count ?? 0;
  const documentCount = documentsResult.count ?? 0;

  // Compute compliance score the same way the compliance API does
  const rows = (complianceResult.data ?? []) as { document_id: number | null; deadline: string | null; is_applicable: boolean }[];
  const applicable = rows.filter((r) => r.is_applicable);
  const met = applicable.filter((r) => r.document_id !== null);
  const complianceScore = applicable.length > 0 ? Math.round((met.length / applicable.length) * 100) : null;

  return (
    <AdminLayout coolingCount={coolingCount}>
      <ClientWorkspace
        community={{
          ...community,
          timezone: community.timezone,
          transparency_enabled: community.transparency_enabled,
          community_settings: (community.community_settings ?? {}) as Record<string, 'all_members' | 'admin_only'>,
          memberCount,
          documentCount,
          complianceScore,
        }}
      />
    </AdminLayout>
  );
}
