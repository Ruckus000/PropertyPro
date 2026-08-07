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
import Link from 'next/link';
import { AdminLayout } from '@/components/AdminLayout';
import { BlockRegistryView } from '@/components/site-templates/BlockRegistryView';
import { getBlockRegistry } from '@/lib/site-templates/block-registry';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';

export const dynamic = 'force-dynamic';

export default async function BlockRegistryPage() {
  await requireAdminPageSession();
  const entries = getBlockRegistry();

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-content">Block Registry</h1>
            <p className="mt-1 text-sm text-content-tertiary">
              Every supported public-site block type, with the top-level fields of its content
              schema, renderer file, and tier. Read-only reference — the schemas are the single
              source of truth used by the renderer and the PM editor.
            </p>
          </div>
          <Link
            href="/site-templates"
            className="shrink-0 rounded-md border border-edge-strong bg-surface-card px-3 py-1.5 text-sm font-medium text-content-secondary hover:bg-surface-page"
          >
            ← Site Templates
          </Link>
        </div>
        <BlockRegistryView entries={entries} />
      </div>
    </AdminLayout>
  );
}
