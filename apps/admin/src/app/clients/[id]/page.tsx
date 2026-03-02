/**
 * P1-6: Client Workspace shell.
 *
 * Shows community overview with tab navigation.
 * Returns 404 if the community doesn't exist or is a demo.
 */
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { AdminLayout } from '@/components/AdminLayout';
import { ClientWorkspace } from '@/components/clients/ClientWorkspace';

export const dynamic = 'force-dynamic';

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
  subscription_status: z.string().nullable(),
  subscription_plan: z.string().nullable(),
  created_at: z.string(),
  is_demo: z.boolean(),
});

const ComplianceRowSchema = z.object({
  status: z.string(),
});

export default async function ClientWorkspacePage({ params }: PageProps) {
  const { id } = await params;
  const communityId = Number(id);

  if (!Number.isInteger(communityId) || communityId <= 0) {
    notFound();
  }

  const db = createAdminClient();

  // Fetch community first (need it to gate 404)
  const communityResult = await db
    .from('communities')
    .select('id, name, slug, community_type, city, state, zip_code, address_line1, subscription_status, subscription_plan, created_at, is_demo')
    .eq('id', communityId)
    .is('deleted_at', null)
    .single();

  // Validate data at runtime (untyped Supabase client returns `unknown`)
  const communityParse = CommunityRowSchema.safeParse(communityResult.data);
  if (!communityParse.success || communityParse.data.is_demo) {
    notFound();
  }
  const community = communityParse.data;

  // Fetch counts and compliance in parallel to minimize round trips
  const [membersResult, documentsResult, complianceResult] = await Promise.all([
    db.from('user_roles').select('*', { count: 'exact', head: true }).eq('community_id', communityId),
    db.from('documents').select('*', { count: 'exact', head: true }).eq('community_id', communityId).is('deleted_at', null),
    db.from('compliance_items').select('status').eq('community_id', communityId),
  ]);

  const memberCount = membersResult.count ?? 0;
  const documentCount = documentsResult.count ?? 0;

  // Validate compliance data at runtime
  const compliance = z.array(ComplianceRowSchema).parse(complianceResult.data ?? []);
  const totalItems = compliance.length;
  const metItems = compliance.filter((c) => c.status === 'met').length;
  const complianceScore = totalItems > 0 ? Math.round((metItems / totalItems) * 100) : null;

  return (
    <AdminLayout>
      <ClientWorkspace
        community={{
          ...community,
          memberCount: memberCount ?? 0,
          documentCount: documentCount ?? 0,
          complianceScore,
        }}
      />
    </AdminLayout>
  );
}
