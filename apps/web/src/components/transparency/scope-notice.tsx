import { Card } from '@propertypro/ui';

export function ScopeNotice() {
  return (
    <Card className="border-edge bg-surface-page print:bg-surface-card" size="md">
      <Card.Body className="space-y-3">
        <p className="text-sm font-semibold text-content">
          This page shows document posting data tracked in PropertyPro. It is not a legal compliance audit.
        </p>

        <details className="group rounded-md border border-edge bg-surface-card p-3 print:border-none print:p-0">
          <summary className="cursor-pointer text-sm font-medium text-content-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2">
            What this page does not cover
          </summary>
          <div className="mt-2 space-y-2 text-sm text-content-secondary">
            <p>
              This page reflects records currently tracked inside PropertyPro for this community and may not
              include off-platform records.
            </p>
            <p>
              Legal determinations, attorney opinions, and certification outcomes are outside the scope of this
              dashboard.
            </p>
          </div>
        </details>
      </Card.Body>
    </Card>
  );
}
