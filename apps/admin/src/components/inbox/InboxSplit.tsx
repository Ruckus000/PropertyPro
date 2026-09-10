import type { ReactNode } from 'react';
import { MailQuestion } from 'lucide-react';
import { EmptyState } from '@propertypro/ui';

interface InboxSplitProps {
  list: ReactNode;
  detail: ReactNode | null;
}

/**
 * Master-detail layout for the inbox: a fixed-width thread list on the left,
 * the open thread (or a "select a thread" placeholder) on the right.
 *
 * No `mobile` boolean prop (the brief's original shape) — every page that
 * renders this is `dynamic = 'force-dynamic'`, so there is no server-side
 * source for a viewport read; that would mean UA sniffing or a client hook
 * with a hydration mismatch. The grid below already expresses the rule in
 * CSS: below `md`, exactly one column shows — `detail` when present,
 * otherwise `list` — matching "mobile shows detail ?? list".
 *
 * The placeholder lives HERE, not in the caller, precisely so that rule holds:
 * if the caller always passed a non-null `detail` (an EmptyState instead of
 * `null` when nothing is selected), the mobile CSS below would hide the list
 * on `/inbox` too, leaving a phone with neither a thread nor a list.
 */
export function InboxSplit({ list, detail }: InboxSplitProps) {
  return (
    <div className="grid gap-4 md:[grid-template-columns:minmax(300px,380px)_minmax(0,1fr)]">
      <div className={detail ? 'hidden md:block' : ''}>{list}</div>
      <div className={`min-w-0 ${detail ? 'block' : 'hidden md:block'}`}>
        {detail ?? (
          <EmptyState
            icon={MailQuestion}
            title="Select a thread"
            description="Pick a conversation from the list to read and reply."
            size="md"
          />
        )}
      </div>
    </div>
  );
}
