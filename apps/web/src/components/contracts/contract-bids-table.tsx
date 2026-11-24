'use client';

/**
 * The bids on a contract, once bidding has closed. A client component only
 * because the shared `Table` measures itself (it adds a tab stop when it
 * overflows); the contract's page is a server component and cannot render it
 * directly.
 *
 * It is handed the bids the server already decided to show. While bidding is
 * sealed the page does not render this at all, and has no bid to give it.
 */
import type { ContractRecordBid } from '@/lib/services/contract-service';
import { formatContractDateTime, formatContractMoney } from '@/lib/contracts/contract-rules';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const FIT = 'whitespace-nowrap';

export function ContractBidsTable({ bids, timeZone }: { bids: ContractRecordBid[]; timeZone: string }) {
  return (
    <Table aria-label="Bids">
      <TableHeader className="bg-surface-subtle">
        <TableRow className="hover:bg-transparent">
          <TableHead className={FIT}>Vendor</TableHead>
          <TableHead className={FIT}>Amount</TableHead>
          <TableHead className={FIT}>Received</TableHead>
          <TableHead className="w-full">Notes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {bids.map((bid) => (
          <TableRow key={bid.id}>
            <TableCell className="font-medium text-content">{bid.vendorName}</TableCell>
            <TableCell className={FIT}>{formatContractMoney(bid.bidAmount)}</TableCell>
            <TableCell className={FIT}>
              {bid.submittedAt ? formatContractDateTime(bid.submittedAt, timeZone) : '—'}
            </TableCell>
            <TableCell className="whitespace-pre-line text-content-secondary">{bid.notes ?? '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
