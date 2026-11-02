'use client';

/**
 * Side panel for one audit entry (or one collapsed group): the sentence, the
 * exact time, why it matters, what changed (old → new), and where to go next.
 * Radix handles focus: it moves into the panel, Esc closes it, and focus
 * returns to the row that opened it.
 */
import { useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  describeAuditEvent,
  formatDateTime,
  type AuditTone,
  type DescribeContext,
} from '@/lib/audit/describe-event';
import type { AuditScope } from '@/lib/audit/types';
import { AuditAvatar, AuditBadge, AuditSentence, ToneIcon, type AuditListItem } from './AuditEntry';

const NOTE_CLASSES: Record<AuditTone, string> = {
  danger: 'bg-status-danger-bg text-status-danger border-status-danger-border',
  warning: 'bg-status-warning-bg text-status-warning border-status-warning-border',
  info: 'bg-surface-muted text-content-secondary border-edge',
  success: 'bg-status-success-bg text-status-success border-status-success-border',
};

interface AuditDetailSheetProps {
  communityId: number;
  item: AuditListItem | null;
  ctx: DescribeContext;
  onClose: () => void;
  onScope: (scope: AuditScope, label: string) => void;
}

export function AuditDetailSheet({ communityId, item, ctx, onClose, onScope }: AuditDetailSheetProps) {
  // The panel is opened by state, not by a trigger (a shared link can open it
  // with nothing focused), so return focus to the row explicitly on close.
  const lastKey = useRef<string | null>(null);
  if (item) lastKey.current = item.key;
  // Keep showing the last entry while the panel slides closed, instead of an
  // empty panel for the length of the animation.
  const [shown, setShown] = useState<AuditListItem | null>(item);
  if (item && item !== shown) setShown(item);

  return (
    <Sheet open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md"
        onCloseAutoFocus={(event) => {
          const row = lastKey.current
            ? document.querySelector<HTMLElement>(`[data-audit-row="${CSS.escape(lastKey.current)}"]`)
            : null;
          if (row) {
            event.preventDefault();
            row.focus();
          }
        }}
      >
        {shown && <SheetBody communityId={communityId} item={item ?? shown} ctx={ctx} onScope={onScope} />}
      </SheetContent>
    </Sheet>
  );
}

function SheetBody({
  communityId,
  item,
  ctx,
  onScope,
}: {
  communityId: number;
  item: AuditListItem;
  ctx: DescribeContext;
  onScope: (scope: AuditScope, label: string) => void;
}) {
  const { described, group } = item;
  const first = item.entries[0]!;
  const isGroup = group !== null;
  const showDeletionLink = !isGroup && described.badge?.label === 'Deleted' && first.resourceType === 'document';

  return (
    <>
      <SheetHeader className="space-y-3 border-b border-edge p-6 pr-14 text-left">
        <AuditAvatar described={described} group={isGroup && group.actorText.includes(' and ')} />
        <SheetTitle className="text-lg font-normal leading-snug text-content-secondary">
          <AuditSentence described={described} actorText={group?.actorText} />
        </SheetTitle>
        <SheetDescription className="text-sm text-content-tertiary">
          {isGroup
            ? `${group.count} times on ${formatDateTime(first.createdAt, ctx.timeZone).split(' at ')[0]}`
            : formatDateTime(first.createdAt, ctx.timeZone, true)}
        </SheetDescription>
        {described.badge && (
          <div className="-ml-1.5">
            <AuditBadge tone={described.badge.tone} label={described.badge.label} />
          </div>
        )}
      </SheetHeader>

      <div className="flex-1 space-y-6 p-6">
        {described.note && (
          <div className={cn('flex gap-3 rounded-md border p-3 text-sm leading-relaxed', NOTE_CLASSES[described.note.tone])} role="note">
            <ToneIcon tone={described.note.tone} className="mt-0.5 size-4 shrink-0" />
            <p>{described.note.text}</p>
          </div>
        )}

        {isGroup ? (
          <section aria-labelledby="audit-group-who">
            <h3 id="audit-group-who" className="mb-2 text-sm font-medium text-content">
              Each time
            </h3>
            <ul className="divide-y divide-edge rounded-md border border-edge">
              {item.entries.map((entry) => {
                const one = describeAuditEvent(entry, ctx);
                return (
                  <li key={entry.id} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate text-content">
                      {one.actor.name}
                      {one.object && !described.object && <span className="text-content-secondary"> · {one.object.label}</span>}
                    </span>
                    <span className="shrink-0 text-content-tertiary">
                      {new Date(entry.createdAt).toLocaleTimeString('en-US', { timeZone: ctx.timeZone, hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : (
          described.changes.length > 0 && (
            <section aria-labelledby="audit-changes">
              <h3 id="audit-changes" className="mb-2 text-sm font-medium text-content">
                What changed
              </h3>
              <dl className="divide-y divide-edge rounded-md border border-edge">
                {described.changes.map((change) => (
                  <div key={change.label} className="px-3 py-2.5">
                    <dt className="text-sm text-content-secondary">{change.label}</dt>
                    <dd className="mt-0.5 flex flex-wrap items-center gap-x-2 text-base text-content">
                      {change.before !== null && change.after !== null ? (
                        <>
                          <span className="text-content-tertiary line-through">{change.before}</span>
                          <ArrowRight className="size-4 text-content-tertiary" aria-label="changed to" />
                          <span>{change.after}</span>
                        </>
                      ) : change.after !== null ? (
                        <span>{change.after}</span>
                      ) : (
                        <span className="text-content-tertiary line-through">{change.before}</span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )
        )}

        <div className="flex flex-col gap-2">
          {showDeletionLink && (
            <Button asChild>
              <Link href={`/communities/${communityId}/compliance`}>Open compliance checklist</Link>
            </Button>
          )}
          {described.object?.scope && (
            <Button variant="outline" onClick={() => onScope(described.object!.scope!, described.object!.label)}>
              See all activity for {described.object.label}
            </Button>
          )}
          {!isGroup && described.actor.userId && !described.actor.viaSupport && (
            <Button
              variant="outline"
              onClick={() => onScope({ kind: 'person', userId: described.actor.userId! }, described.actor.name)}
            >
              See everything {described.actor.name} did
            </Button>
          )}
        </div>

        {!isGroup && <p className="font-mono text-xs text-content-tertiary">Record #{first.id}</p>}
      </div>
    </>
  );
}
