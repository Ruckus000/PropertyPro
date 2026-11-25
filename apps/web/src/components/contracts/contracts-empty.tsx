/**
 * Contracts & Vendors with no contracts (spec docs/design-system/patterns/
 * empty-states.md §4.1; plan docs/superpowers/plans/2026-11-20-empty-states-amenities-vendors-assessments.md A4).
 *
 * Managers only (the page redirects everyone else), condo and HOA only. A single
 * action, so no step row; the header's "Add contract" is hidden while empty and
 * this owns the one filled one, a link to the New contract page. Every line
 * comes from the contract form's fields (`contract-form.tsx`), the 90/60/30-day
 * windows in lib/services/contract-renewal-alerts.ts (shown on this page only:
 * no cron or email reads them) and help article `manager/website/contracts.mdx`.
 */

import Link from 'next/link';
import { PropScene } from '@propertypro/ui';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { ContextLinks, ContextRows, ContextSection } from '@/components/shared/setup-guide';

/** The contract form's fields, in its order. */
const CONTRACT_FIELDS = [
  { label: 'Title, vendor name and start date', detail: 'Required' },
  { label: 'Contract value and end date', detail: 'Optional; the end date drives expiration alerts' },
  { label: 'Status', detail: 'Draft, Active, Expired or Terminated' },
  { label: 'Bidding closes at', detail: 'Bids stay sealed until this time' },
  { label: 'Conflict of interest', detail: 'Check it if a director or officer has a financial interest, and add a note' },
];

export function ContractsFirstRun({
  communityId,
  canWrite = true,
}: {
  communityId: number;
  /** The viewer may add contracts; without it the hero offers no action. */
  canWrite?: boolean;
}) {
  return (
    <EmptyState
      size="hero"
      eyebrow="Contracts & Vendors"
      title="Keep every vendor agreement in one place"
      description="Log each contract with its vendor and dates, and this page lists the ones that are ending soon."
      illustration={<PropScene size="hero" prop="clipboard" />}
      action={
        canWrite ? (
          <Button asChild>
            <Link href={`/contracts/new?communityId=${communityId}`}>Add contract</Link>
          </Button>
        ) : undefined
      }
      aside={
        <>
          <ContextSection title="What a contract has">
            <ContextRows rows={CONTRACT_FIELDS} />
          </ContextSection>
          <ContextSection title="Expiration Alerts">
            <p className="text-sm text-content-secondary">
              This page lists contracts ending within 90, 60 and 30 days, and ones that have expired. The alerts
              show here only; nothing is emailed.
            </p>
          </ContextSection>
          <ContextSection title="The signed copy">
            <p className="text-sm text-content-secondary">
              Owners can't see this page, so upload the signed PDF to a Documents category they can open, then
              enter its ID in Linked Document ID.
            </p>
            <ContextLinks links={[{ href: `/communities/${communityId}/documents`, label: 'Documents' }]} />
          </ContextSection>
          <ContextSection title="Help">
            <ContextLinks links={[{ href: '/help/website/contracts', label: 'Track vendor contracts' }]} />
          </ContextSection>
        </>
      }
    />
  );
}
