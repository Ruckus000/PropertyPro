import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  StatusBadge,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@propertypro/design-system';

const records = [
  { doc: 'Declaration of Condominium (amended)', adopted: '02 Aug 2026', posted: '09 Aug 2026', status: 'compliant', label: 'Posted in 7 days' },
  { doc: 'Bylaws', adopted: '14 Mar 2018', posted: '21 Mar 2018', status: 'compliant', label: 'Posted in 7 days' },
  { doc: 'Articles of Incorporation', adopted: '09 Jan 2001', posted: '02 Feb 2001', status: 'compliant', label: 'Posted in 24 days' },
  { doc: 'Rules & Regulations (2026 revision)', adopted: '19 May 2026', posted: '30 Jun 2026', status: 'overdue', label: 'Posted in 42 days' },
];

export const StatutoryCaption = () => (
  <Card className="w-full">
    <CardHeader>
      <CardTitle>Official records</CardTitle>
      <CardDescription>Sunset Condos · public record index</CardDescription>
    </CardHeader>
    <CardContent>
      <Table>
        <TableCaption>
          Official records posted under §718.111(12)(g). Documents must be posted to the
          association website within 30 days of creation or amendment.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Official record</TableHead>
            <TableHead className="w-36">Adopted</TableHead>
            <TableHead className="w-36">Posted</TableHead>
            <TableHead className="w-48">Posting window</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((r) => (
            <TableRow key={r.doc}>
              <TableCell className="font-medium">{r.doc}</TableCell>
              <TableCell className="whitespace-nowrap text-content-secondary">{r.adopted}</TableCell>
              <TableCell className="whitespace-nowrap text-content-secondary">{r.posted}</TableCell>
              <TableCell className="whitespace-nowrap">
                <StatusBadge status={r.status} label={r.label} size="sm" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent>
  </Card>
);

const reserves = [
  { component: 'Roof — Building A', remaining: '6 yrs', funded: '$412,900', target: '$486,000' },
  { component: 'Elevator modernization', remaining: '3 yrs', funded: '$188,400', target: '$240,000' },
  { component: 'Exterior paint & waterproofing', remaining: '2 yrs', funded: '$96,750', target: '$96,750' },
  { component: 'Pool deck resurfacing', remaining: '4 yrs', funded: '$41,200', target: '$62,000' },
];

export const SourceNoteCaption = () => (
  <div className="w-full rounded-md border border-edge bg-surface-card p-4">
    <Table>
      <TableCaption className="text-content-tertiary">
        Source: Structural Integrity Reserve Study dated 30 June 2026, prepared by
        Sandpiper Structural Engineering (FL PE 71204). Figures are reported as filed —
        PropertyPro does not assess their adequacy.
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Reserve component</TableHead>
          <TableHead className="w-40">Useful life left</TableHead>
          <TableHead className="text-right">Funded to date</TableHead>
          <TableHead className="text-right">Fully funded target</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reserves.map((r) => (
          <TableRow key={r.component}>
            <TableCell className="font-medium">{r.component}</TableCell>
            <TableCell className="text-content-secondary">{r.remaining}</TableCell>
            <TableCell className="text-right">{r.funded}</TableCell>
            <TableCell className="text-right text-content-secondary">{r.target}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);
