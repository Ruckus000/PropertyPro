import {
  PageHeaderHelpButton,
  Button,
  PageContainer,
  PageHeader,
  ShadcnBadge,
} from '@propertypro/design-system';

const documents = [
  ['2025 Audited Financial Statements', 'Financials · posted 4 Aug 2026', 'Posted'],
  ['Amended Declaration of Condominium', 'Governing docs · posted 12 Aug 2026', 'Posted'],
  ['July Board Meeting Minutes', 'Minutes · uploaded 19 Aug 2026', 'Draft'],
];

export const InPageHeaderActions = () => (
  <div className="w-full rounded-md border border-edge bg-surface-page">
    <PageContainer>
      <PageHeader
        title="Documents"
        description="Association records posted under §718.111(12)(g). Documents must be posted within 30 days of creation."
        hideHelpButton
        actions={
          <>
            <PageHeaderHelpButton />
            <Button variant="outline" size="sm">
              Export
            </Button>
            <Button size="sm">Upload Document</Button>
          </>
        }
      />
      <div className="mt-6 overflow-hidden rounded-md border border-edge bg-surface-card">
        {documents.map(([name, meta, status]) => (
          <div
            key={name}
            className="flex items-center justify-between border-b border-edge px-4 py-3 last:border-0"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-content">{name}</p>
              <p className="text-xs text-content-tertiary">{meta}</p>
            </div>
            <ShadcnBadge variant="outline">{status}</ShadcnBadge>
          </div>
        ))}
      </div>
    </PageContainer>
  </div>
);

export const InToolbarRow = () => (
  <div className="w-full rounded-md border border-edge bg-surface-page p-6">
    <div className="rounded-md border border-edge bg-surface-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-content">Violations register</p>
          <p className="text-xs text-content-tertiary">Palm Shores HOA · 62 matters · 12 open</p>
        </div>
        <div className="flex items-center gap-2">
          <PageHeaderHelpButton />
          <Button size="sm" variant="outline">
            Export
          </Button>
          <Button size="sm">Log violation</Button>
        </div>
      </div>
    </div>
    <p className="mt-3 text-xs text-content-tertiary">
      PageHeaderHelpButton sits leftmost in this actions cluster at ghost weight. It returns null
      outside the app shell — it needs a HelpWidgetProvider and
      NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED=true — so it is absent from this preview.
    </p>
  </div>
);
