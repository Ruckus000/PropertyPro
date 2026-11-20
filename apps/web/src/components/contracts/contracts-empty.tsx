/**
 * Contracts & Vendors with no contracts (spec docs/design-system/patterns/
 * empty-states.md §4.1; plan docs/superpowers/plans/2026-11-20-empty-states-amenities-vendors-assessments.md A4).
 *
 * Managers only (the page redirects everyone else), condo and HOA only. A single
 * action, so no step row; the toolbar's "Add Contract" is hidden while empty and
 * this owns the one filled one. Every line comes from ContractForm's fields, the
 * 90/60/30-day windows in lib/services/contract-renewal-alerts.ts and help article
 * `manager/website/contracts.mdx`.
 */

import { PropScene } from '@propertypro/ui';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { ContextLinks, ContextRows, ContextSection } from '@/components/shared/setup-guide';

/** ContractForm's fields, in its order. */
const CONTRACT_FIELDS = [
  { label: 'Title, vendor name and start date', detail: 'Required' },
  { label: 'Contract value and end date', detail: 'Optional; the end date drives expiration alerts' },
  { label: 'Bidding closes at', detail: 'Bids stay sealed until this date' },
  { label: 'Conflict of interest', detail: 'Check it if a director or officer has a financial interest' },
];

export function ContractsFirstRun({ communityId, onAdd }: { communityId: number; onAdd: () => void }) {
  return (
    <EmptyState
      size="hero"
      eyebrow="Contracts & Vendors"
      title="Keep every vendor agreement in one place"
      description="Log each contract with its vendor and dates, and you'll be warned before it ends."
      illustration={<PropScene size="hero" prop="clipboard" />}
      action={<Button onClick={onAdd}>Add Contract</Button>}
      aside={
        <>
          <ContextSection title="What a contract has">
            <ContextRows rows={CONTRACT_FIELDS} />
          </ContextSection>
          <ContextSection title="Warnings you'll get">
            <p className="text-sm text-content-secondary">
              Expiration Alerts list contracts ending within 90, 60 and 30 days, and ones that have expired.
            </p>
          </ContextSection>
          <ContextSection title="The signed copy">
            <p className="text-sm text-content-secondary">
              Upload the PDF in Documents first, then enter its ID in Linked Document ID.
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
