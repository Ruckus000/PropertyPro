/**
 * /admin/site-templates/starter-packs — platform-admin starter pack catalog.
 * AUTHZ: requireAdminPageSession(); site_starter_packs is not tenant-scoped.
 */
import { AdminLayout } from '@/components/AdminLayout';
import { StarterPacksTable, type StarterPackRow } from '@/components/site-templates/StarterPacksTable';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';

export const dynamic = 'force-dynamic';

interface RawRow {
  id: number; slug: string; display_name: string;
  community_type: 'condo_718' | 'hoa_720' | 'apartment';
  description: string | null; blocks: unknown; version: number; is_archived: boolean; created_at: string; updated_at: string;
}

async function loadPacks(): Promise<StarterPackRow[]> {
  const db = createAdminTypedClient();
  const { data, error } = await db
    .from('site_starter_packs')
    .select('id, slug, display_name, community_type, description, blocks, version, is_archived, created_at, updated_at')
    .order('community_type', { ascending: true })
    .order('version', { ascending: false });
  if (error) throw new Error(`Failed to load starter packs: ${error.message}`);
  return ((data ?? []) as RawRow[]).map((r) => ({
    id: r.id, slug: r.slug, displayName: r.display_name, communityType: r.community_type,
    description: r.description, blocks: (Array.isArray(r.blocks) ? r.blocks : []) as StarterPackRow['blocks'],
    version: r.version, isArchived: r.is_archived, createdAt: r.created_at, updatedAt: r.updated_at,
  }));
}

export default async function StarterPacksPage() {
  await requireAdminPageSession();
  const packs = await loadPacks();
  return (
    <AdminLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-content">Starter Packs</h1>
          <p className="mt-1 text-sm text-content-tertiary">Platform-level block bundles applied to new community sites. Edit in place, or &quot;Save as new version&quot; to publish a new lineage version. Archived packs are retired from new-community seeding.</p>
        </div>
        <StarterPacksTable packs={packs} />
      </div>
    </AdminLayout>
  );
}
