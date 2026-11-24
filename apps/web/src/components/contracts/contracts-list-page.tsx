'use client';

/**
 * Contracts list on the page kit: five columns, and each row opens the
 * contract's own page. Adding and editing happen on their own pages, so this
 * one ships neither the form nor the bids.
 *
 * Managers of a condo or HOA only; the route's `page.tsx` turns everyone else
 * away before this renders.
 */
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { PageLayout } from '@propertypro/ui/components/shared/page-layout';
import { Section, SectionError, SectionHeader } from '@propertypro/ui/components/shared/section';
import type { AccessSentence } from '@propertypro/ui/components/shared/side-panel';
import { StatusGlyph } from '@propertypro/ui/components/shared/status-glyph';
import { useContracts } from '@/hooks/use-contracts';
import {
  bidCountLabel,
  contractStatus,
  contractTimeLeft,
  formatContractDate,
  todayInTimeZone,
} from '@/lib/contracts/contract-rules';
import { formatMoney } from '@/lib/utils/format-money';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ContractRecord, ExpirationAlert } from './types';

// Only an empty community renders it, so it loads on demand (perf-check budget).
const ContractsFirstRun = dynamic(
  () => import('./contracts-empty').then((m) => m.ContractsFirstRun),
  { loading: () => <div className="min-h-96 animate-pulse rounded-md bg-surface-muted" aria-hidden="true" /> },
);

interface ContractsListPageProps {
  communityId: number;
  /** The community's IANA time zone: "time left" counts from the community's today. */
  timeZone: string;
  /** The viewer may add contracts: the header offers "Add contract". */
  canWrite: boolean;
  /** Built by the server page with describeAccess. */
  about?: AccessSentence;
}

/** A contract's own page. */
export function contractHref(communityId: number, contractId: number): string {
  return `/contracts/${contractId}?communityId=${communityId}`;
}

// The Contract column takes the slack (`w-full` head, `max-w-0` cell, so a long
// title truncates and never sets the table's width); every other column is as
// wide as its content. Value and Bids wait for 768px, so a phone does not scroll sideways.
const FIT = 'whitespace-nowrap';
const MD = 'hidden md:table-cell';
// A link standing alone is a touch target: 44px tall below 768px.
const TOUCH = 'inline-flex min-h-11 items-center md:min-h-0';
const FOCUS =
  'rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2';

export function ContractsListPage({ communityId, timeZone, canWrite, about }: ContractsListPageProps) {
  const query = useContracts({ communityId });
  const contracts = query.data?.contracts ?? [];
  const alerts = query.data?.alerts ?? [];
  // The first-run hero owns the one action while there is nothing to list.
  const isFirstRun = query.isSuccess && contracts.length === 0;

  return (
    <PageLayout
      template="list"
      records="table"
      header={
        <PageHeader
          title="Contracts & Vendors"
          icon={<FileText />}
          description="Vendor agreements for this association, with their end dates and bids."
          actions={
            canWrite && !isFirstRun ? (
              <Button asChild>
                <Link href={`/contracts/new?communityId=${communityId}`}>Add contract</Link>
              </Button>
            ) : undefined
          }
        />
      }
      // "About" alone is not drawn as a panel: PageLayout puts the sentence under the header.
      panel={{ template: 'list', about }}
    >
      {query.isLoading ? (
        <Section>
          <div className="space-y-3 p-4" role="status" aria-label="Loading contracts">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </Section>
      ) : query.isError ? (
        <Section>
          <SectionError
            // The server's reason when it gave one (a lapsed subscription says so).
            message={`We couldn't load contracts. ${
              query.error instanceof Error && query.error.message !== 'Failed to load contracts'
                ? query.error.message
                : 'Please try again.'
            }`}
            onRetry={() => void query.refetch()}
          />
        </Section>
      ) : isFirstRun ? (
        <ContractsFirstRun communityId={communityId} canWrite={canWrite} />
      ) : (
        <div className="flex flex-col gap-5">
          {alerts.length > 0 ? <ExpirationAlerts alerts={alerts} communityId={communityId} /> : null}
          <ContractsTable contracts={contracts} communityId={communityId} today={todayInTimeZone(timeZone)} />
        </div>
      )}
    </PageLayout>
  );
}

/**
 * The contracts ending within 90 days, and the expired ones, as the API lists
 * them. A plain section, not an alert: it is standing information, there on
 * every visit, and each line says its state in words.
 */
function ExpirationAlerts({ alerts, communityId }: { alerts: ExpirationAlert[]; communityId: number }) {
  return (
    <Section>
      <SectionHeader
        title="Expiration Alerts"
        description="Contracts ending within 90 days, and ones that have expired."
      />
      <ul className="divide-y divide-edge-subtle">
        {alerts.map((alert) => (
          <li key={alert.contractId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
            <StatusGlyph
              kind={alert.window === 'expired' ? 'overdue' : 'attention'}
              label={
                alert.window === 'expired'
                  ? 'Expired'
                  : alert.daysUntilExpiry === 0
                    ? 'Expires today'
                    : alert.daysUntilExpiry === 1
                      ? 'Expires in 1 day'
                      : `Expires in ${alert.daysUntilExpiry} days`
              }
            />
            <Link
              href={contractHref(communityId, alert.contractId)}
              className={`${TOUCH} min-w-0 font-medium text-content hover:underline ${FOCUS}`}
            >
              <span className="truncate">{alert.title}</span>
            </Link>
            <span className="text-sm text-content-secondary">{alert.vendorName}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function ContractsTable({
  contracts,
  communityId,
  today,
}: {
  contracts: ContractRecord[];
  communityId: number;
  today: string;
}) {
  return (
    <Section>
      <Table aria-label="Contracts">
        <TableHeader className="bg-surface-subtle">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-full">Contract</TableHead>
            <TableHead className={`${MD} ${FIT}`}>Value</TableHead>
            <TableHead className={FIT}>Ends</TableHead>
            <TableHead className={FIT}>Status</TableHead>
            <TableHead className={`${MD} ${FIT}`}>Bids</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contracts.map((contract) => {
            const status = contractStatus(contract.status);
            return (
              <TableRow key={contract.id}>
                <TableCell className="max-w-0">
                  <Link
                    href={contractHref(communityId, contract.id)}
                    className={`${TOUCH} max-w-full font-medium text-content hover:underline ${FOCUS}`}
                  >
                    <span className="truncate">{contract.title}</span>
                  </Link>
                  <span className="block truncate text-sm text-content-secondary">
                    {contract.vendorName}
                    {contract.conflictOfInterest ? ' · Conflict declared' : ''}
                  </span>
                </TableCell>
                <TableCell className={`${MD} ${FIT}`}>{formatMoney(contract.contractValue)}</TableCell>
                <TableCell className={FIT}>
                  {contract.endDate ? (
                    <>
                      <span className="block">{formatContractDate(contract.endDate)}</span>
                      {contract.status === 'terminated' ? null : (
                        <span className="block text-sm text-content-secondary">
                          {contractTimeLeft(contract.endDate, today)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-content-secondary">Open-ended</span>
                  )}
                </TableCell>
                <TableCell className={FIT}>
                  <StatusGlyph kind={status.kind} label={status.word} />
                </TableCell>
                <TableCell className={`${MD} ${FIT}`}>
                  {bidCountLabel(contract.bidSummary.bidCount, contract.bidSummary.embargoed)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Section>
  );
}
