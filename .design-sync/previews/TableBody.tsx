import type { ReactNode } from 'react';
import {
  Skeleton,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@propertypro/design-system';

const workOrders = [
  { id: 'WO-4471', unit: '512', summary: 'Water heater leaking into hallway', vendor: 'Gulf Coast Plumbing', due: '03 Sep 2026', status: 'in_progress', label: 'In progress' },
  { id: 'WO-4468', unit: '204', summary: 'Lobby door closer out of adjustment', vendor: 'Ameri-Door Services', due: '05 Sep 2026', status: 'assigned', label: 'Assigned' },
  { id: 'WO-4462', unit: 'Common', summary: 'Pool pump seal replacement', vendor: 'Blue Marlin Pools', due: '29 Aug 2026', status: 'overdue', label: 'Overdue' },
  { id: 'WO-4455', unit: '306', summary: 'Balcony railing corrosion inspection', vendor: 'Sandpiper Structural', due: '22 Aug 2026', status: 'completed', label: 'Completed' },
  { id: 'WO-4450', unit: '118', summary: 'Garage gate transmitter reprogram', vendor: 'Ameri-Door Services', due: '18 Aug 2026', status: 'completed', label: 'Completed' },
];

const Frame = ({ children }: { children: ReactNode }) => (
  <div className="w-full rounded-md border border-edge bg-surface-card">{children}</div>
);

const Head = () => (
  <TableHeader>
    <TableRow>
      <TableHead className="w-32">Work order</TableHead>
      <TableHead className="w-24">Unit</TableHead>
      <TableHead>Summary</TableHead>
      <TableHead>Vendor</TableHead>
      <TableHead>Due</TableHead>
      <TableHead>Status</TableHead>
    </TableRow>
  </TableHeader>
);

export const WorkOrderRows = () => (
  <Frame>
    <Table>
      <Head />
      <TableBody>
        {workOrders.map((wo) => (
          <TableRow key={wo.id}>
            <TableCell className="whitespace-nowrap font-medium">{wo.id}</TableCell>
            <TableCell>{wo.unit}</TableCell>
            <TableCell className="text-content-secondary">{wo.summary}</TableCell>
            <TableCell className="text-content-secondary">{wo.vendor}</TableCell>
            <TableCell className="whitespace-nowrap text-content-secondary">{wo.due}</TableCell>
            <TableCell className="whitespace-nowrap">
              <StatusBadge status={wo.status} label={wo.label} size="sm" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </Frame>
);

export const LoadingRows = () => (
  <Frame>
    <Table>
      <Head />
      <TableBody>
        {[0, 1, 2, 3, 4].map((i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-5 w-24" /></TableCell>
            <TableCell><Skeleton className="h-5 w-12" /></TableCell>
            <TableCell><Skeleton className="h-5 w-full" /></TableCell>
            <TableCell><Skeleton className="h-5 w-32" /></TableCell>
            <TableCell><Skeleton className="h-5 w-20" /></TableCell>
            <TableCell><Skeleton className="h-5 w-20" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </Frame>
);

export const NoResultsRow = () => (
  <Frame>
    <Table>
      <Head />
      <TableBody>
        <TableRow>
          <TableCell colSpan={6} className="h-24 text-center">
            <div className="flex flex-col items-center gap-2">
              <p className="text-content-tertiary">
                No work orders match “roof” in the last 90 days.
              </p>
              <p className="text-sm text-content-tertiary">
                Clear the filter to see all 14 open work orders.
              </p>
            </div>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </Frame>
);
