/**
 * /admin/site-templates/documentation — documentation hubs (spec §5.5).
 *
 * Surfaces the engineering + PM documentation locations for the site-templates
 * system as linked cards. Static reference content; no DB, no write actions.
 *
 * AUTHZ: requireAdminPageSession() gates the page.
 */
import { PageBody } from '@propertypro/ui';
import { DocumentationHubs } from '@/components/site-templates/DocumentationHubs';
import { AdminPageHeader } from '@/components/shell/AdminPageHeader';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';

export const dynamic = 'force-dynamic';

export default async function SiteTemplatesDocumentationPage() {
  await requireAdminPageSession();

  return (
    <PageBody>
      <AdminPageHeader
        title="Documentation"
        description="Reference hubs for the public-site templates system — design system, layout authoring, and the PM-facing help center."
        backHref="/site-templates"
        backLabel="Site Templates"
      />
      <DocumentationHubs />
    </PageBody>
  );
}
