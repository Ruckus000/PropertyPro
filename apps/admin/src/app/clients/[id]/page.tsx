/**
 * P1-6: Client Workspace shell.
 *
 * Shows community overview with tab navigation.
 * Returns 404 if the community doesn't exist or is a demo.
 */
import { notFound } from 'next/navigation';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { AdminLayout } from '@/components/AdminLayout';
import { ClientWorkspace } from '@/components/clients/ClientWorkspace';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface CommunityRow {
  id: number;
  name: string;
  slug: string;
  community_type: 'condo_718' | 'hoa_720' | 'apartment';
  city: string | null;
  state: string | null;
  zip_code: string | null;
  address_line1: string | null;
  subscription_status: string | null;
  subscription_plan: string | null;
  created_at: string;
  is_demo: boolean;
}

interface ComplianceRow {
  status: string;
}

export default async function ClientWorkspacePage({ params }: PageProps) {
  const { id } = await params;
  const communityId = Number(id);

  if (!Number.isInteger(communityId) || communityId <= 0) {
    notFound();
  }

  const db = createAdminClient();

  // Fetch community
  const { data: community } = await db
    .from('communities')
    .select('id, name, slug, community_type, city, state, zip_code, address_line1, subscription_status, subscription_plan, created_at, is_demo')
    .eq('id', communityId)
    .is('deleted_at', null)
    .single() as { data: CommunityRow | null; error: unknown };

  if (!community || community.is_demo) {
    notFound();
  }

  // Fetch member count
  const { count: memberCount } = await db
    .from('user_roles')
    .select('*', { count: 'exact', head: true })
    .eq('community_id', communityId);

  // Fetch document count
  const { count: documentCount } = await db
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .eq('community_id', communityId)
    .is('deleted_at', null);

  // Fetch compliance score
  const { data: compliance } = await db
    .from('compliance_items')
    .select('status')
    .eq('community_id', communityId) as { data: ComplianceRow[] | null; error: unknown };

  const totalItems = compliance?.length ?? 0;
  const metItems = compliance?.filter((c) => c.status === 'met').length ?? 0;
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
