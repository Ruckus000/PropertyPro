/**
 * Demo List Page — shows all demo instances with age badges and actions.
 *
 * `DemoListClient` paints its own heading and toolbar; Wave 2 moves that onto
 * `AdminPageHeader` along with the rest of the page-body restyling.
 */
import { DemoListClient } from '@/components/demo/DemoListClient';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getDemoListData } from '@/lib/server/demos';

export default async function DemoListPage() {
  await requireAdminPageSession();
  const demos = await getDemoListData();

  return <DemoListClient initialDemos={demos} />;
}
