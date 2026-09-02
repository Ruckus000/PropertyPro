import {
  CsvExportButton,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@propertypro/design-system';

const HEADERS = ['Community', '0-30 days', '31-60 days', '61-90 days', '90+ days', 'Total'];

const ROWS = [
  { Community: 'Sunset Condos', '0-30 days': '$8,140', '31-60 days': '$6,020', '61-90 days': '$3,900', '90+ days': '$30,170', Total: '$48,230' },
  { Community: 'Palm Shores HOA', '0-30 days': '$2,410', '31-60 days': '$1,180', '61-90 days': '$0', '90+ days': '$4,650', Total: '$8,240' },
  { Community: 'Sunset Ridge Apartments', '0-30 days': '$5,900', '31-60 days': '$2,300', '61-90 days': '$1,150', '90+ days': '$0', Total: '$9,350' },
];

export const InReportHeader = () => (
  <Card className="w-full">
    <CardHeader>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <CardTitle>Delinquency report</CardTitle>
          <CardDescription>Aging buckets across 3 communities · generated 1 September 2026</CardDescription>
        </div>
        <CsvExportButton headers={HEADERS} rows={ROWS} filename="delinquency-report" />
      </div>
    </CardHeader>
    <CardContent>
      <Table>
        <TableHeader>
          <TableRow>
            {HEADERS.map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ROWS.map((r) => (
            <TableRow key={r.Community}>
              {HEADERS.map((h) => (
                <TableCell key={h}>{r[h as keyof typeof r]}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent>
  </Card>
);

export const InToolbarBesidePrimary = () => (
  <div className="w-full rounded-md border border-edge bg-surface-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-content">Owner ledger · Sunset Condos</p>
        <p className="text-xs text-content-tertiary">148 units · 3 with balances over 90 days</p>
      </div>
      <div className="flex items-center gap-2">
        <CsvExportButton headers={HEADERS} rows={ROWS} filename="owner-ledger" />
        <Button size="sm">Record payment</Button>
      </div>
    </div>
  </div>
);

export const Standalone = () => (
  <div className="flex w-full items-center gap-3">
    <CsvExportButton headers={HEADERS} rows={ROWS} filename="compliance-report" />
    <p className="text-xs text-content-tertiary">
      Downloads a comma-separated file; values containing commas are quoted.
    </p>
  </div>
);
