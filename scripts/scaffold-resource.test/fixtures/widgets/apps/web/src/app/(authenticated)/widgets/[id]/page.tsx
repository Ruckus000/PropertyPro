/**
 * Widget detail — stub page.
 *
 * Scaffolded by `pnpm new:resource widgets` (Plan A4 reference resource).
 *
 * The scaffolder does NOT emit a detail route — only the list. Wire up your
 * own `GET /api/v1/widgets/[id]` route + hook before this page does anything
 * useful. The stub demonstrates the canonical PageHeader + Breadcrumbs
 * pattern from `.claude/rules/design.md`.
 */
import { PageHeader } from '@/components/shared/page-header';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function WidgetDetailPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        breadcrumb={
          <Breadcrumbs
            items={[{ label: 'Widgets', href: '/widgets' }]}
            currentLabel={`Widget #${id}`}
          />
        }
        title={`Widget #${id}`}
        description="Scaffolded detail page — wire up your detail route to populate."
      />
      <p className="text-sm text-content-secondary">
        Add a <code className="rounded bg-surface-muted px-1">GET /api/v1/widgets/[id]</code> route
        and a <code className="rounded bg-surface-muted px-1">useWidget(id)</code> hook to bring
        this page to life.
      </p>
    </div>
  );
}
