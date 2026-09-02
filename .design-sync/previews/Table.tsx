import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@propertypro/design-system';

const delinquent = [
  { unit: '118', owner: 'David Okonkwo', balance: '$610.00', days: 34, status: 'due_soon', label: '31-60 days' },
  { unit: '204', owner: 'Priya Raghavan', balance: '$1,842.50', days: 62, status: 'overdue', label: '61-90 days' },
  { unit: '306', owner: 'Marisol Vega', balance: '$4,275.00', days: 118, status: 'overdue', label: '90+ days' },
  { unit: '402', owner: 'Thomas Wheeler', balance: '$325.75', days: 12, status: 'pending', label: '0-30 days' },
  { unit: '512', owner: 'Elena Castellanos', balance: '$2,190.00', days: 76, status: 'overdue', label: '61-90 days' },
  { unit: '705', owner: 'Andre Fontaine', balance: '$918.40', days: 28, status: 'pending', label: '0-30 days' },
];

export const DelinquencyRegister = () => (
  <Card className="w-full">
    <CardHeader>
      <CardTitle>Delinquency register</CardTitle>
      <CardDescription>
        Sunset Condos · 6 units carrying a balance as of 1 September 2026
      </CardDescription>
    </CardHeader>
    <CardContent>
      <div className="rounded-md border border-edge">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Unit</TableHead>
              <TableHead>Owner of record</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Days past due</TableHead>
              <TableHead>Aging bucket</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {delinquent.map((row) => (
              <TableRow key={row.unit}>
                <TableCell className="font-medium">{row.unit}</TableCell>
                <TableCell>{row.owner}</TableCell>
                <TableCell className="text-right font-medium">{row.balance}</TableCell>
                <TableCell className="text-right text-content-secondary">{row.days}</TableCell>
                <TableCell>
                  <StatusBadge status={row.status} label={row.label} size="sm" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </CardContent>
  </Card>
);

const documents = [
  { name: 'Declaration of Condominium (amended)', category: 'Governing', created: '02 Aug 2026', posted: '09 Aug 2026', days: 7 },
  { name: '2026 Adopted Budget', category: 'Financial', created: '18 Jul 2026', posted: '24 Jul 2026', days: 6 },
  { name: 'Milestone Inspection Report — Phase 1', category: 'Structural', created: '11 Aug 2026', posted: '15 Aug 2026', days: 4 },
  { name: 'Board Meeting Minutes — 12 Aug 2026', category: 'Meetings', created: '12 Aug 2026', posted: '19 Aug 2026', days: 7 },
  { name: 'Reserve Study (SIRS)', category: 'Structural', created: '30 Jun 2026', posted: '28 Jul 2026', days: 28 },
];

export const DocumentRegister = () => (
  <div className="w-full rounded-md border border-edge bg-surface-card">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Document</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Posted</TableHead>
          <TableHead className="text-right">Days to post</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {documents.map((doc) => (
          <TableRow key={doc.name}>
            <TableCell className="font-medium">{doc.name}</TableCell>
            <TableCell className="text-content-secondary">{doc.category}</TableCell>
            <TableCell className="text-content-secondary">{doc.created}</TableCell>
            <TableCell className="text-content-secondary">{doc.posted}</TableCell>
            <TableCell className="text-right">{doc.days}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

const meetings = [
  { date: '12 Aug 2026', type: 'Board meeting', notice: '48-hour notice', posted: '10 Aug 2026', quorum: 'Met' },
  { date: '24 Jun 2026', type: 'Annual members meeting', notice: '14-day notice', posted: '09 Jun 2026', quorum: 'Met' },
  { date: '19 May 2026', type: 'Budget adoption', notice: '14-day notice', posted: '04 May 2026', quorum: 'Met' },
];

export const CompactMeetingLog = () => (
  <div className="w-full rounded-md border border-edge bg-surface-card">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Meeting date</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Statutory notice</TableHead>
          <TableHead>Notice posted</TableHead>
          <TableHead>Quorum</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {meetings.map((m) => (
          <TableRow key={m.date}>
            <TableCell className="font-medium">{m.date}</TableCell>
            <TableCell>{m.type}</TableCell>
            <TableCell className="text-content-secondary">{m.notice}</TableCell>
            <TableCell className="text-content-secondary">{m.posted}</TableCell>
            <TableCell>
              <StatusBadge status="compliant" label={m.quorum} size="sm" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);
