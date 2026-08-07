/**
 * /admin/site-templates/documentation — documentation hubs (spec §5.5).
 *
 * Surfaces the engineering + PM documentation locations for the site-templates
 * system as linked cards. Static reference content; no DB, no write actions.
 *
 * AUTHZ: requireAdminPageSession() gates the page.
 */
import Link from 'next/link';
import { AdminLayout } from '@/components/AdminLayout';
import { DocumentationHubs } from '@/components/site-templates/DocumentationHubs';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';

export const dynamic = 'force-dynamic';

export default async function SiteTemplatesDocumentationPage() {
  await requireAdminPageSession();

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-content">Documentation</h1>
            <p className="mt-1 text-sm text-content-tertiary">
              Reference hubs for the public-site templates system — design system, layout
              authoring, and the PM-facing help center.
            </p>
          </div>
          <Link
            href="/site-templates"
            className="shrink-0 rounded-md border border-edge-strong bg-surface-card px-3 py-1.5 text-sm font-medium text-content-secondary hover:bg-surface-page"
          >
            ← Site Templates
          </Link>
        </div>
        <DocumentationHubs />
      </div>
    </AdminLayout>
  );
}
