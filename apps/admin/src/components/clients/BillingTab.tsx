import { CreditCard } from 'lucide-react';
import { Card, CardContent, EmptyState } from '@propertypro/ui';

interface BillingTabProps {
  /** Unused for now — Wave 3c's real implementation reads by community. */
  communityId: number;
}

/**
 * Stub for the client workspace's Billing tab. Wave 3c (Task 17's third
 * slice) replaces this file's body with real subscription/invoice
 * management; this slice only needs the tab to exist and render something
 * reasonable.
 */
export function BillingTab({ communityId: _communityId }: BillingTabProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <EmptyState
          icon={CreditCard}
          title="Billing arrives in Wave 3"
          description="Subscription and invoice management for this community will live here."
        />
      </CardContent>
    </Card>
  );
}
