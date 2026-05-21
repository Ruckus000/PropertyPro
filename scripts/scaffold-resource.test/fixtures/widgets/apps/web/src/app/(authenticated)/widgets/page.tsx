/**
 * Widgets — list page (server component).
 *
 * Scaffolded by `pnpm new:resource widgets` (Plan A4 reference resource).
 *
 * Convention: list pages are server components that resolve the active
 * tenant via the canonical page-shell helpers and pass `communityId` down to
 * a client presenter (`<WidgetsList>`) which owns the data hook. This
 * mirrors the project's B5 container/presenter split and keeps `useEffect`
 * out of the server tree.
 */
import { PageHeader } from '@/components/shared/page-header';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
import { requirePageCommunityId } from '@/lib/request/page-community-context';
import { WidgetsList } from './widgets-list';

export default async function WidgetsPage() {
  const communityId = await requirePageCommunityId();

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        breadcrumb={<Breadcrumbs currentLabel="Widgets" />}
        title="Widgets"
        description="Scaffolded reference resource — list view."
      />
      <WidgetsList communityId={communityId} />
    </div>
  );
}
