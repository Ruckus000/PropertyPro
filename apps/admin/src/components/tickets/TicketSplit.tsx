import type { ReactNode } from 'react';
import { TicketCheck } from 'lucide-react';
import { EmptyState } from '@propertypro/ui';

interface TicketSplitProps {
  list: ReactNode;
  detail: ReactNode | null;
}

/**
 * Master-detail layout for the ticket queue: the queue on the left, the open
 * ticket (or a "select a ticket" placeholder) on the right.
 *
 * Deliberately the same shape as `InboxSplit`, down to the CSS, because it is
 * the same rule: below `md` exactly one column shows — `detail` when there is
 * one, otherwise `list`. There is no `mobile` prop because both pages that
 * render this are `dynamic = 'force-dynamic'`, so a server-side viewport read
 * would mean UA sniffing or a hydration mismatch.
 *
 * The placeholder lives HERE rather than in the caller for the reason
 * `InboxSplit` records: if `/tickets` passed a non-null `detail` holding an
 * EmptyState, the mobile rule below would hide the queue on a phone and leave
 * it with neither a ticket nor a list.
 */
export function TicketSplit({ list, detail }: TicketSplitProps) {
  return (
    <div className="grid gap-4 md:[grid-template-columns:minmax(300px,380px)_minmax(0,1fr)]">
      <div className={detail ? 'hidden md:block' : ''}>{list}</div>
      <div className={`min-w-0 ${detail ? 'block' : 'hidden md:block'}`}>
        {detail ?? (
          <EmptyState
            icon={TicketCheck}
            title="Select a ticket"
            description="Pick a ticket from the queue to read its history and move it along."
            size="md"
          />
        )}
      </div>
    </div>
  );
}
