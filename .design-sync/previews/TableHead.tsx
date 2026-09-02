import {
  Checkbox,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@propertypro/design-system';

const assessments = [
  { unit: '118', owner: 'David Okonkwo', period: 'Q3 2026', charged: '$1,150.00', paid: '$1,150.00', balance: '$0.00', status: 'compliant', label: 'Paid' },
  { unit: '204', owner: 'Priya Raghavan', period: 'Q3 2026', charged: '$1,150.00', paid: '$575.00', balance: '$575.00', status: 'pending', label: 'Partial' },
  { unit: '306', owner: 'Marisol Vega', period: 'Q3 2026', charged: '$1,425.00', paid: '$0.00', balance: '$1,425.00', status: 'overdue', label: 'Overdue' },
  { unit: '402', owner: 'Thomas Wheeler', period: 'Q3 2026', charged: '$1,150.00', paid: '$1,150.00', balance: '$0.00', status: 'compliant', label: 'Paid' },
  { unit: '512', owner: 'Elena Castellanos', period: 'Q3 2026', charged: '$1,425.00', paid: '$712.50', balance: '$712.50', status: 'pending', label: 'Partial' },
];

export const AlignmentVariants = () => (
  <div className="w-full rounded-md border border-edge bg-surface-card">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-20">Unit</TableHead>
          <TableHead>Owner of record</TableHead>
          <TableHead className="w-28">Period</TableHead>
          <TableHead className="text-right">Assessed</TableHead>
          <TableHead className="text-right">Paid</TableHead>
          <TableHead className="text-right">Balance</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {assessments.map((a) => (
          <TableRow key={a.unit}>
            <TableCell className="font-medium">{a.unit}</TableCell>
            <TableCell>{a.owner}</TableCell>
            <TableCell className="text-content-secondary">{a.period}</TableCell>
            <TableCell className="text-right">{a.charged}</TableCell>
            <TableCell className="text-right text-content-secondary">{a.paid}</TableCell>
            <TableCell className="text-right font-medium">{a.balance}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

export const SelectionAndStatusHeads = () => (
  <div className="w-full rounded-md border border-edge bg-surface-card">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">
            <Checkbox aria-label="Select all assessments" />
          </TableHead>
          <TableHead className="w-20">Unit</TableHead>
          <TableHead>Owner of record</TableHead>
          <TableHead className="text-right">Balance</TableHead>
          <TableHead className="w-36">Collection status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {assessments.map((a) => (
          <TableRow key={a.unit}>
            <TableCell>
              <Checkbox aria-label={`Select unit ${a.unit}`} />
            </TableCell>
            <TableCell className="font-medium">{a.unit}</TableCell>
            <TableCell>{a.owner}</TableCell>
            <TableCell className="text-right font-medium">{a.balance}</TableCell>
            <TableCell>
              <StatusBadge status={a.status} label={a.label} size="sm" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

export const GroupedHeaderRows = () => (
  <div className="w-full rounded-md border border-edge bg-surface-card">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-20" rowSpan={2}>Unit</TableHead>
          <TableHead rowSpan={2}>Owner of record</TableHead>
          <TableHead className="text-center" colSpan={2}>Q3 2026</TableHead>
          <TableHead className="text-right" rowSpan={2}>Balance</TableHead>
        </TableRow>
        <TableRow>
          <TableHead className="text-right">Assessed</TableHead>
          <TableHead className="text-right">Paid</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {assessments.map((a) => (
          <TableRow key={a.unit}>
            <TableCell className="font-medium">{a.unit}</TableCell>
            <TableCell>{a.owner}</TableCell>
            <TableCell className="text-right">{a.charged}</TableCell>
            <TableCell className="text-right text-content-secondary">{a.paid}</TableCell>
            <TableCell className="text-right font-medium">{a.balance}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);
