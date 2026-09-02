import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@propertypro/design-system';

const aging = [
  { bucket: '0-30 days', units: 9, amount: '$8,412.25' },
  { bucket: '31-60 days', units: 4, amount: '$5,180.00' },
  { bucket: '61-90 days', units: 3, amount: '$6,247.50' },
  { bucket: '90+ days', units: 2, amount: '$9,533.75' },
];

export const AgingTotals = () => (
  <Card className="w-full">
    <CardHeader>
      <CardTitle>Receivables aging</CardTitle>
      <CardDescription>Sunset Condos · 18 units with an open balance</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="rounded-md border border-edge">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Aging bucket</TableHead>
              <TableHead className="text-right">Units</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead className="text-right">Share of total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {aging.map((a) => (
              <TableRow key={a.bucket}>
                <TableCell className="font-medium">{a.bucket}</TableCell>
                <TableCell className="text-right text-content-secondary">{a.units}</TableCell>
                <TableCell className="text-right">{a.amount}</TableCell>
                <TableCell className="text-right text-content-secondary">
                  {a.bucket === '0-30 days' ? '28.6%' : a.bucket === '31-60 days' ? '17.6%' : a.bucket === '61-90 days' ? '21.3%' : '32.5%'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total outstanding</TableCell>
              <TableCell className="text-right">18</TableCell>
              <TableCell className="text-right">$29,373.50</TableCell>
              <TableCell className="text-right">100%</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </CardContent>
  </Card>
);

const budget = [
  { line: 'Insurance — property & wind', budget: '$184,000', actual: '$191,420', variance: '($7,420)' },
  { line: 'Landscaping & grounds', budget: '$46,800', actual: '$44,115', variance: '$2,685' },
  { line: 'Elevator maintenance', budget: '$28,500', actual: '$28,500', variance: '$0' },
  { line: 'Reserve contribution — roof', budget: '$96,000', actual: '$96,000', variance: '$0' },
  { line: 'Pool & amenity services', budget: '$21,400', actual: '$23,970', variance: '($2,570)' },
];

export const BudgetVarianceTotals = () => (
  <div className="w-full rounded-md border border-edge bg-surface-card">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Budget line</TableHead>
          <TableHead className="text-right">Adopted</TableHead>
          <TableHead className="text-right">Actual YTD</TableHead>
          <TableHead className="text-right">Variance</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {budget.map((b) => (
          <TableRow key={b.line}>
            <TableCell className="font-medium">{b.line}</TableCell>
            <TableCell className="text-right text-content-secondary">{b.budget}</TableCell>
            <TableCell className="text-right">{b.actual}</TableCell>
            <TableCell className={b.variance.startsWith('(') ? 'text-right text-status-danger' : 'text-right'}>
              {b.variance}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Operating total</TableCell>
          <TableCell className="text-right">$376,700</TableCell>
          <TableCell className="text-right">$384,005</TableCell>
          <TableCell className="text-right text-status-danger">($7,305)</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  </div>
);
