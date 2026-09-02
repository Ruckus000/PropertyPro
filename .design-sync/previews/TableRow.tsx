import type { ReactNode } from 'react';
import {
  Button,
  Checkbox,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@propertypro/design-system';
import { ChevronRight } from 'lucide-react';

const arcRequests = [
  { id: 'ARC-2026-31', unit: '705', scope: 'Impact-rated window replacement', submitted: '21 Aug 2026', status: 'review', label: 'Under review' },
  { id: 'ARC-2026-29', unit: '402', scope: 'Screened balcony enclosure', submitted: '17 Aug 2026', status: 'submitted', label: 'Submitted' },
  { id: 'ARC-2026-27', unit: '118', scope: 'Exterior door repaint — Coral 340', submitted: '11 Aug 2026', status: 'compliant', label: 'Approved' },
  { id: 'ARC-2026-24', unit: '306', scope: 'Roof-mounted solar array', submitted: '04 Aug 2026', status: 'rejected', label: 'Denied' },
];

const Frame = ({ children }: { children: ReactNode }) => (
  <div className="w-full rounded-md border border-edge bg-surface-card">{children}</div>
);

const Head = ({ withSelect = false }: { withSelect?: boolean }) => (
  <TableHeader>
    <TableRow>
      {withSelect ? <TableHead className="w-12" /> : null}
      <TableHead className="w-36">Request</TableHead>
      <TableHead className="w-20">Unit</TableHead>
      <TableHead>Proposed work</TableHead>
      <TableHead>Submitted</TableHead>
      <TableHead>Status</TableHead>
    </TableRow>
  </TableHeader>
);

export const DefaultRows = () => (
  <Frame>
    <Table>
      <Head />
      <TableBody>
        {arcRequests.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-medium">{r.id}</TableCell>
            <TableCell>{r.unit}</TableCell>
            <TableCell className="text-content-secondary">{r.scope}</TableCell>
            <TableCell className="text-content-secondary">{r.submitted}</TableCell>
            <TableCell>
              <StatusBadge status={r.status} label={r.label} size="sm" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </Frame>
);

export const SelectedRows = () => (
  <Frame>
    <Table>
      <Head withSelect />
      <TableBody>
        {arcRequests.map((r, i) => (
          <TableRow key={r.id} data-state={i < 2 ? 'selected' : undefined}>
            <TableCell>
              <Checkbox defaultChecked={i < 2} aria-label={`Select ${r.id}`} />
            </TableCell>
            <TableCell className="font-medium">{r.id}</TableCell>
            <TableCell>{r.unit}</TableCell>
            <TableCell className="text-content-secondary">{r.scope}</TableCell>
            <TableCell className="text-content-secondary">{r.submitted}</TableCell>
            <TableCell>
              <StatusBadge status={r.status} label={r.label} size="sm" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </Frame>
);

export const RowsWithAction = () => (
  <Frame>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-36">Request</TableHead>
          <TableHead className="w-20">Unit</TableHead>
          <TableHead>Proposed work</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-32 text-right">Review</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {arcRequests.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-medium">{r.id}</TableCell>
            <TableCell>{r.unit}</TableCell>
            <TableCell className="text-content-secondary">{r.scope}</TableCell>
            <TableCell>
              <StatusBadge status={r.status} label={r.label} size="sm" />
            </TableCell>
            <TableCell className="text-right">
              <Button variant="ghost" size="sm">
                Open
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </Frame>
);
