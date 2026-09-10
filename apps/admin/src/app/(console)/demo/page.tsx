/**
 * Demo List Page — shows all demo instances with age badges and actions.
 *
 * `DemoListClient` renders its own `AdminPageHeader` (its description is
 * dynamic — demo count and stale count both shift as rows are deleted — so it
 * cannot be hoisted onto this server component the way a static header
 * would be).
 */
import { DemoListClient } from '@/components/demo/DemoListClient';
import { requireAdminPageSession } from '@/lib/request/admin-page-context';
import { getDemoListData } from '@/lib/server/demos';

export default async function DemoListPage() {
  await requireAdminPageSession();
  const demos = await getDemoListData();

  return <DemoListClient initialDemos={demos} />;
}
