/**
 * One contract on the page kit. A server component: the route loads the
 * contract with its bids ALREADY SEALED (`getContractRecord`) and this only
 * prints what it is given. While bidding is open, `contract.bidSummary.bids`
 * is empty, so no vendor, amount or note of a sealed bid is in this view's
 * props or its HTML; the count and the closing time are. The two client parts
 * are the bids table (rendered only once bidding has closed) and "Add bid"
 * (which is given the contract's id and nothing else).
 *
 * Managers of a condo or HOA only; the route turns everyone else away.
 */
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { PageLayout } from '@propertypro/ui/components/shared/page-layout';
import { Section, SectionHeader } from '@propertypro/ui/components/shared/section';
import type { AccessSentence } from '@propertypro/ui/components/shared/side-panel';
import { StatusGlyph } from '@propertypro/ui/components/shared/status-glyph';
import type { ContractRecordData } from '@/lib/services/contract-service';
import {
  bidCountLabel,
  contractStatus,
  contractTimeLeft,
  formatContractDate,
  formatContractDateTime,
  formatContractMoney,
  todayInTimeZone,
} from '@/lib/contracts/contract-rules';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { ContractAddBid } from './contract-add-bid';
import { ContractBidsTable } from './contract-bids-table';

interface ContractDetailPageProps {
  communityId: number;
  /** Sealed already: see the file comment. */
  contract: ContractRecordData;
  /** The community's IANA time zone; every time on the page is shown in it. */
  timeZone: string;
  /** The viewer may change contracts: Edit in the header, "Add bid" in Bids. */
  canWrite: boolean;
  about?: AccessSentence;
}

const LINK =
  'rounded-sm font-medium text-content-link underline underline-offset-2 hover:text-content-link-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2';
const TERM = 'text-content-secondary';

export function ContractDetailPage({ communityId, contract, timeZone, canWrite, about }: ContractDetailPageProps) {
  const status = contractStatus(contract.status);
  const { bidSummary } = contract;
  const closes = contract.biddingClosesAt ? formatContractDateTime(contract.biddingClosesAt, timeZone) : null;
  const today = todayInTimeZone(timeZone);

  return (
    <PageLayout
      template="detail"
      header={
        <PageHeader
          title={contract.title}
          icon={<FileText />}
          description="One vendor agreement: its terms, the bids received and the records linked to it."
          status={<StatusGlyph kind={status.kind} label={status.word} />}
          actions={
            canWrite ? (
              <Button asChild variant="outline">
                <Link href={`/contracts/${contract.id}/edit?communityId=${communityId}`}>Edit</Link>
              </Button>
            ) : undefined
          }
        />
      }
      panel={{
        template: 'detail',
        details: (
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            <dt className={TERM}>Vendor</dt>
            <dd className="text-content">{contract.vendorName}</dd>
            <dt className={TERM}>Start</dt>
            <dd className="text-content">{formatContractDate(contract.startDate)}</dd>
            <dt className={TERM}>End</dt>
            <dd className="text-content">
              {contract.endDate ? formatContractDate(contract.endDate) : 'Open-ended'}
            </dd>
            <dt className={TERM}>Bidding closes</dt>
            <dd className="text-content">{closes ?? 'Not set'}</dd>
            <dt className={TERM}>Conflict of interest</dt>
            <dd className="text-content">
              {contract.conflictOfInterest ? 'Declared' : 'None declared'}
              {contract.conflictOfInterest && contract.conflictOfInterestNote ? (
                <span className="mt-1 block whitespace-pre-line text-content-secondary">
                  {contract.conflictOfInterestNote}
                </span>
              ) : null}
            </dd>
          </dl>
        ),
        about,
      }}
    >
      <div className="flex flex-col gap-5">
        <Section>
          <SectionHeader title="Summary" />
          <div className="flex flex-col gap-4 px-4 py-4">
            {contract.description ? (
              // A reading measure: the section spans the column, the text does not.
              <p className="max-w-3xl whitespace-pre-line text-content">{contract.description}</p>
            ) : (
              <p className="text-sm text-content-secondary">No description.</p>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
              <dt className={TERM}>Value</dt>
              <dd className="tabular-nums text-content">
                {contract.contractValue ? formatContractMoney(contract.contractValue) : 'Not set'}
              </dd>
              <dt className={TERM}>Dates</dt>
              <dd className="text-content">
                {formatContractDate(contract.startDate)} to{' '}
                {contract.endDate ? formatContractDate(contract.endDate) : 'open-ended'}
                {contract.endDate && contract.status !== 'terminated' ? (
                  <span className="text-content-secondary"> ({contractTimeLeft(contract.endDate, today)})</span>
                ) : null}
              </dd>
            </dl>
          </div>
        </Section>

        <Section>
          <SectionHeader title="Bids" description={bidCountLabel(bidSummary.bidCount, bidSummary.embargoed)} />
          {bidSummary.embargoed ? (
            <p className="px-4 py-4 text-content" data-testid="bids-sealed">
              Bidding is sealed. {bidSummary.bidCount} received.
              {closes ? ` Opens ${closes}.` : ''}{' '}
              <span className="text-content-secondary">
                Nobody, managers included, can see a bid&apos;s vendor, amount or notes until then.
              </span>
            </p>
          ) : bidSummary.bids.length === 0 ? (
            <p className="px-4 py-4 text-sm text-content-secondary">No bids recorded yet.</p>
          ) : (
            <ContractBidsTable bids={bidSummary.bids} timeZone={timeZone} />
          )}
          {canWrite ? <ContractAddBid communityId={communityId} contractId={contract.id} /> : null}
        </Section>

        <Section>
          <SectionHeader title="Linked records" />
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 px-4 py-4">
            <dt className={TERM}>Document</dt>
            <dd className="text-content">
              {contract.document ? (
                <Link
                  href={`/communities/${communityId}/documents?doc=${contract.document.id}`}
                  className={LINK}
                >
                  {contract.document.title}
                </Link>
              ) : contract.documentId ? (
                `Document ${contract.documentId} (no longer available)`
              ) : (
                'None linked'
              )}
            </dd>
            <dt className={TERM}>Compliance item</dt>
            <dd className="text-content">
              {contract.complianceItem
                ? contract.complianceItem.title
                : contract.complianceChecklistItemId
                  ? `Item ${contract.complianceChecklistItemId} (no longer available)`
                  : 'None linked'}
            </dd>
          </dl>
        </Section>
      </div>
    </PageLayout>
  );
}
