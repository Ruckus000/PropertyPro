import { Card } from '@propertypro/ui';

export function ScopeNotice() {
  return (
    <Card className="border-gray-200 bg-gray-50 print:bg-white" size="md">
      <Card.Body className="space-y-3">
        <p className="text-sm font-semibold text-gray-900">
          This page shows document posting data tracked in PropertyPro. It is not a legal compliance audit.
        </p>

        <details className="group rounded-md border border-gray-200 bg-white p-3 print:border-none print:p-0">
          <summary className="cursor-pointer text-sm font-medium text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
            What this page does not cover
          </summary>
          <div className="mt-2 space-y-2 text-sm text-gray-600">
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
