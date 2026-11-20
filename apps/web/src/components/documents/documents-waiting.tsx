/**
 * Documents for a resident before anything is posted: the "Waiting" state
 * (spec docs/design-system/patterns/empty-states.md §4.4). No steps, no
 * counts, no compliance language.
 *
 * "What you'll be able to open" follows the document access policy
 * (`packages/shared/src/access-policies.ts`): condo/HOA tenants read the
 * declaration and the rules (plus inspection reports only if the association
 * opts in); apartment tenants read the resident-facing folders.
 */

import * as React from 'react';
import type { CommunityType } from '@propertypro/shared';
import { DocumentsScene } from '@propertypro/ui';
import { EmptyState } from '@/components/shared/empty-state';
import { ContextLinks, ContextRows, ContextSection } from '@/components/shared/setup-guide';

export function ResidentDocumentsWaiting({
  communityId,
  communityType,
}: {
  communityId: number;
  communityType: CommunityType;
}) {
  const apartment = communityType === 'apartment';
  return (
    <EmptyState
      size="hero"
      eyebrow="Documents"
      title={apartment ? 'Your community’s documents will appear here' : 'Your association’s documents will appear here'}
      description={
        apartment
          ? 'When management posts a document you’re allowed to open, it lands on this page.'
          : 'When your board or management posts a document you’re allowed to open, it lands on this page.'
      }
      illustration={<DocumentsScene size="hero" next={false} />}
      aside={
        <>
          <ContextSection title="What you'll be able to open">
            <ContextRows
              rows={
                apartment
                  ? [{ label: 'Tenants', detail: 'Leases, the rules, the community handbook and move-in and move-out papers' }]
                  : [
                      { label: 'Owners', detail: 'Every document the association posts' },
                      {
                        label: 'Tenants',
                        detail: 'The declaration and the rules, plus inspection reports if your association shares them',
                      },
                    ]
              }
            />
          </ContextSection>
          <ContextSection title="How you'll hear">
            <p className="text-sm text-content-secondary">
              An email when a document you can open is posted (right away or in your digest, as your
              notification settings say), and a notification here.
            </p>
            <ContextLinks
              links={[{ href: `/settings?tab=notifications&communityId=${communityId}`, label: 'Notification settings' }]}
            />
          </ContextSection>
          <ContextSection title="Help">
            <ContextLinks links={[{ href: '/help/documents/find-documents', label: 'Find and open documents' }]} />
          </ContextSection>
        </>
      }
    />
  );
}
