import {
  Badge,
  Button,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@propertypro/design-system';
import { MoreHorizontal, Paperclip } from 'lucide-react';

const residents = [
  { unit: '118', name: 'David Okonkwo', email: 'd.okonkwo@example.com', tenure: 'Owner since 2019', role: 'Unit owner', variant: 'owner', status: 'compliant', label: 'Verified' },
  { unit: '204', name: 'Priya Raghavan', email: 'p.raghavan@example.com', tenure: 'Lease through 31 Mar 2027', role: 'Tenant', variant: 'neutral', status: 'pending', label: 'Invite sent' },
  { unit: '306', name: 'Marisol Vega', email: 'm.vega@example.com', tenure: 'Owner since 2012', role: 'Board president', variant: 'board', status: 'compliant', label: 'Verified' },
  { unit: '512', name: 'Elena Castellanos', email: 'e.castellanos@example.com', tenure: 'Owner since 2023', role: 'Unit owner', variant: 'owner', status: 'compliant', label: 'Verified' },
];

export const RichCellContent = () => (
  <div className="w-full rounded-md border border-edge bg-surface-card">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-20">Unit</TableHead>
          <TableHead>Resident</TableHead>
          <TableHead className="w-40">Role</TableHead>
          <TableHead className="w-32">Directory</TableHead>
          <TableHead className="w-16 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {residents.map((r) => (
          <TableRow key={r.unit}>
            <TableCell className="font-medium">{r.unit}</TableCell>
            <TableCell>
              <div className="flex flex-col">
                <span className="font-medium">{r.name}</span>
                <span className="text-xs text-content-tertiary">{r.email}</span>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={r.variant} size="sm">{r.role}</Badge>
            </TableCell>
            <TableCell>
              <StatusBadge status={r.status} label={r.label} size="sm" />
            </TableCell>
            <TableCell className="text-right">
              <Button variant="ghost" size="icon" aria-label={`Actions for unit ${r.unit}`}>
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

const ledger = [
  { date: '01 Aug 2026', memo: 'Q3 regular assessment', ref: 'INV-2026-0812', debit: '$1,150.00', credit: '—', balance: '$1,150.00' },
  { date: '09 Aug 2026', memo: 'Payment received — ACH', ref: 'PMT-88214', debit: '—', credit: '$575.00', balance: '$575.00' },
  { date: '16 Aug 2026', memo: 'Late fee (§718.116)', ref: 'FEE-2026-119', debit: '$25.00', credit: '—', balance: '$600.00' },
  { date: '28 Aug 2026', memo: 'Interest at 18% per annum', ref: 'INT-2026-119', debit: '$8.87', credit: '—', balance: '$608.87' },
];

export const NumericAndSecondaryText = () => (
  <div className="w-full rounded-md border border-edge bg-surface-card">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-32">Date</TableHead>
          <TableHead>Description</TableHead>
          <TableHead className="text-right">Charge</TableHead>
          <TableHead className="text-right">Payment</TableHead>
          <TableHead className="text-right">Running balance</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ledger.map((l) => (
          <TableRow key={l.ref}>
            <TableCell className="text-content-secondary">{l.date}</TableCell>
            <TableCell>
              <div className="flex flex-col">
                <span>{l.memo}</span>
                <span className="text-xs text-content-tertiary">{l.ref}</span>
              </div>
            </TableCell>
            <TableCell className="text-right">{l.debit}</TableCell>
            <TableCell
              className={
                l.credit === '—'
                  ? 'text-right text-content-tertiary'
                  : 'text-right text-status-success'
              }
            >
              {l.credit}
            </TableCell>
            <TableCell className="text-right font-medium">{l.balance}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

const notices = [
  { unit: '306', type: 'Notice of violation', sent: '14 Aug 2026', method: 'Certified mail + portal', attachments: 3 },
  { unit: '512', type: 'Hearing notice (14-day)', sent: '18 Aug 2026', method: 'Portal + email', attachments: 1 },
  { unit: '118', type: 'Cure confirmation', sent: '25 Aug 2026', method: 'Portal', attachments: 0 },
];

export const IconAndCountCells = () => (
  <div className="w-full rounded-md border border-edge bg-surface-card">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-20">Unit</TableHead>
          <TableHead className="w-56">Notice</TableHead>
          <TableHead>Delivery</TableHead>
          <TableHead className="w-32">Sent</TableHead>
          <TableHead className="w-32 text-right">Attachments</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {notices.map((n) => (
          <TableRow key={n.unit}>
            <TableCell className="font-medium">{n.unit}</TableCell>
            <TableCell>{n.type}</TableCell>
            <TableCell className="text-content-secondary">{n.method}</TableCell>
            <TableCell className="text-content-secondary">{n.sent}</TableCell>
            <TableCell className="text-right">
              <span className="inline-flex items-center gap-1 text-content-secondary">
                <Paperclip className="h-3 w-3" aria-hidden="true" />
                {n.attachments}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);
