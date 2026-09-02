import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  StatusBadge,
} from '@propertypro/design-system';

/**
 * CardContent — the card's body slot (p-6 pt-0, so it sits flush under the
 * header's padding). It owns no typography of its own; the content inside sets
 * the rhythm. Shown in the full Card composition.
 */

export const DetailList = () => (
  <Card className="max-w-2xl">
    <CardHeader>
      <CardTitle>Unit 402 — Account Summary</CardTitle>
      <CardDescription>Sunset Condos · Marisol Delgado</CardDescription>
    </CardHeader>
    <CardContent>
      <dl className="grid grid-cols-2 gap-4">
        {[
          { label: 'Current balance', value: '$1,284.00' },
          { label: 'Last payment', value: '$420.00 · Aug 1, 2026' },
          { label: 'Monthly assessment', value: '$420.00' },
          { label: 'Billing group', value: 'Tower A — Residential' },
        ].map((row) => (
          <div key={row.label}>
            <dt className="text-xs uppercase tracking-wide text-content-tertiary">{row.label}</dt>
            <dd className="mt-1 text-sm font-medium tabular-nums text-content">{row.value}</dd>
          </div>
        ))}
      </dl>
    </CardContent>
  </Card>
);

export const RowList = () => (
  <Card className="max-w-2xl">
    <CardHeader>
      <CardTitle>Recent Documents</CardTitle>
      <CardDescription>Posted to the official records page this quarter.</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="divide-y divide-edge">
        {[
          { title: 'Board Meeting Minutes — July', meta: 'Posted Aug 3, 2026', status: 'completed' },
          { title: 'FY2026 Amended Budget', meta: 'Posted Jul 19, 2026', status: 'completed' },
          { title: 'Hurricane Protection Specs', meta: 'Created 26 days ago', status: 'due_soon' },
          { title: 'Milestone Inspection Report', meta: 'Created 44 days ago', status: 'overdue' },
        ].map((row) => (
          <div key={row.title} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-content">{row.title}</div>
              <div className="text-xs text-content-tertiary">{row.meta}</div>
            </div>
            <StatusBadge status={row.status} size="sm" subtle />
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);

export const ProseBody = () => (
  <Card className="max-w-2xl">
    <CardHeader>
      <CardTitle>Statutory Disclaimer</CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-sm leading-relaxed text-content-secondary">
        PropertyPro presents the association's records and inspection data as
        submitted. It does not provide engineering, legal, or financial advice,
        and transparency pages display factual data only — no assessment of
        whether reserves are adequate.
      </p>
    </CardContent>
  </Card>
);
