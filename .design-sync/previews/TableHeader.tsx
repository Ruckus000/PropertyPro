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
import { ArrowDown, ArrowUpDown } from 'lucide-react';

const violations = [
  { id: 'V-2026-0184', unit: '306', kind: 'Unauthorized balcony enclosure', reported: '14 Aug 2026', status: 'open', label: 'Open' },
  { id: 'V-2026-0179', unit: '512', kind: 'Commercial vehicle in guest parking', reported: '09 Aug 2026', status: 'review', label: 'Hearing set' },
  { id: 'V-2026-0171', unit: '118', kind: 'Unregistered pet over weight limit', reported: '02 Aug 2026', status: 'compliant', label: 'Cured' },
  { id: 'V-2026-0166', unit: '705', kind: 'Satellite dish on common element', reported: '27 Jul 2026', status: 'overdue', label: 'Fine pending' },
];

export const ColumnHeaders = () => (
  <div className="w-full rounded-md border border-edge bg-surface-card">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-32">Case</TableHead>
          <TableHead className="w-20">Unit</TableHead>
          <TableHead>Alleged violation</TableHead>
          <TableHead>Reported</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {violations.map((v) => (
          <TableRow key={v.id}>
            <TableCell className="font-medium">{v.id}</TableCell>
            <TableCell>{v.unit}</TableCell>
            <TableCell className="text-content-secondary">{v.kind}</TableCell>
            <TableCell className="text-content-secondary">{v.reported}</TableCell>
            <TableCell>
              <StatusBadge status={v.status} label={v.label} size="sm" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

export const SortableHeaderRow = () => (
  <div className="w-full rounded-md border border-edge bg-surface-card">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-32">
            <span className="inline-flex items-center gap-1">
              Case
              <ArrowUpDown className="h-3 w-3 text-content-tertiary" aria-hidden="true" />
            </span>
          </TableHead>
          <TableHead className="w-20">Unit</TableHead>
          <TableHead>Alleged violation</TableHead>
          <TableHead>
            <span className="inline-flex items-center gap-1 text-content">
              Reported
              <ArrowDown className="h-3 w-3" aria-hidden="true" />
            </span>
          </TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {violations.map((v) => (
          <TableRow key={v.id}>
            <TableCell className="font-medium">{v.id}</TableCell>
            <TableCell>{v.unit}</TableCell>
            <TableCell className="text-content-secondary">{v.kind}</TableCell>
            <TableCell className="text-content-secondary">{v.reported}</TableCell>
            <TableCell>
              <StatusBadge status={v.status} label={v.label} size="sm" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

export const WithSelectAll = () => (
  <div className="w-full rounded-md border border-edge bg-surface-card">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">
            <Checkbox defaultChecked aria-label="Select all violations" />
          </TableHead>
          <TableHead className="w-32">Case</TableHead>
          <TableHead className="w-20">Unit</TableHead>
          <TableHead>Alleged violation</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {violations.map((v) => (
          <TableRow key={v.id} data-state="selected">
            <TableCell>
              <Checkbox defaultChecked aria-label={`Select ${v.id}`} />
            </TableCell>
            <TableCell className="font-medium">{v.id}</TableCell>
            <TableCell>{v.unit}</TableCell>
            <TableCell className="text-content-secondary">{v.kind}</TableCell>
            <TableCell>
              <StatusBadge status={v.status} label={v.label} size="sm" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);
