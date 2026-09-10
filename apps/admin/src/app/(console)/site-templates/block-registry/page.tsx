/**
 * /admin/site-templates/block-registry — read-only Block Registry (spec §5.4).
 *
 * Reference page listing each supported block type, the top-level fields of
 * its Zod content schema, its renderer file path, tier, and docs link. No
 * write actions; informational only. Data is derived at request time from the
 * shared block-schema registry (no DB).
 *
 * AUTHZ: requireAdminPageSession() gates the page.
 */
import { PageBody } from '@propertypro/ui';
import { BlockRegistryView } from '@/components/site-templates/BlockRegistryView';
import { AdminPageHeader } from '@/components/shell/AdminPageHeader';
import { getBlockRegistry } from '@/lib/site-templates/block-registry';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';

export const dynamic = 'force-dynamic';

export default async function BlockRegistryPage() {
  await requireAdminPageSession();
  const entries = getBlockRegistry();

  return (
    <PageBody>
      <AdminPageHeader
        title="Block Registry"
        description="Every supported public-site block type, with the top-level fields of its content schema, renderer file, and tier. Read-only reference — the schemas are the single source of truth used by the renderer and the PM editor."
        backHref="/site-templates"
        backLabel="Site Templates"
      />
      <BlockRegistryView entries={entries} />
    </PageBody>
  );
}
