/**
 * Assessments with none created (spec docs/design-system/patterns/empty-states.md
 * §4.1; plan docs/superpowers/plans/2026-11-20-empty-states-amenities-vendors-assessments.md A1–A3).
 *
 * Managers only: the Assessments tab is the admin side of Payments, so there is
 * no resident waiting state here (owners see PaymentPortal). A single action, so
 * no step row; the tab's own header is hidden while empty and this owns the one
 * filled "Create Assessment". Every line is lifted from the dialog's fields and
 * help article `manager/payments/create-assessment.mdx`, so the two agree.
 */

import { PropScene } from '@propertypro/ui';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { ContextLinks, ContextRows, ContextSection } from '@/components/shared/setup-guide';

/** The create dialog's fields, in its order (assessment-manager.tsx). */
const ASSESSMENT_FIELDS = [
  { label: 'Title and amount', detail: 'Every unit is charged the same amount' },
  { label: 'Frequency', detail: 'Monthly, Quarterly, Annual or One-Time' },
  { label: 'Due day', detail: 'The day of the month the charge is due' },
  { label: 'Late fee and grace days', detail: 'Added once to a charge still unpaid after the grace days (15 by default), while online payments are on' },
];

export function AssessmentsFirstRun({
  communityId,
  onCreate,
}: {
  communityId: number;
  onCreate: () => void;
}) {
  return (
    <EmptyState
      size="hero"
      eyebrow="Assessments"
      title="Set up the dues your units pay"
      description="Create an assessment once and PropertyPro charges every unit when it falls due, then tracks who has paid."
      illustration={<PropScene size="hero" prop="coins" />}
      action={<Button onClick={onCreate}>Create Assessment</Button>}
      aside={
        <>
          <ContextSection title="What an assessment has">
            <ContextRows rows={ASSESSMENT_FIELDS} />
          </ContextSection>
          <ContextSection title="When units are charged">
            <p className="text-sm text-content-secondary">
              Monthly, Quarterly and Annual assessments are charged to every unit in your Directory on the 1st of
              each month they fall due. One-Time assessments are not charged by that monthly run.
            </p>
            <ContextLinks links={[{ href: `/dashboard/directory?communityId=${communityId}`, label: 'Directory' }]} />
          </ContextSection>
          <ContextSection title="Who sees it">
            <p className="text-sm text-content-secondary">
              Unit owners see their charges in Payments. Tenants don&apos;t see assessments.
            </p>
          </ContextSection>
          <ContextSection title="Help">
            <ContextLinks
              links={[
                { href: '/help/payments/create-assessment', label: 'Create dues and special assessments' },
                { href: '/help/payments/online-payments', label: 'Set up online payments' },
              ]}
            />
          </ContextSection>
        </>
      }
    />
  );
}
