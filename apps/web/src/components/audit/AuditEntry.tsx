'use client';

/**
 * The audit trail list: one plain sentence per event, grouped under day
 * headings. The actor and the item are bold buttons that narrow the page to
 * them; the rest of the row opens the side panel (a "stretched" button behind
 * the text, so no button is nested in another).
 *
 * Repeated routine events on the same day collapse into one line
 * ("Maria Lopez and 11 others opened Budget 2026.pdf").
 */
import { AlertTriangle, Building2, Check, Info, Users, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  dayHeading,
  dayKey,
  describeAuditEvent,
  formatDateTime,
  formatTime,
  type AuditTone,
  type DescribeContext,
  type DescribedEvent,
} from '@/lib/audit/describe-event';
import type { AuditLogEntry, AuditScope } from '@/lib/audit/types';

export interface AuditListItem {
  /** Stable key: the first entry's id. */
  key: string;
  entries: AuditLogEntry[];
  described: DescribedEvent;
  /** For a collapsed group: how many people, and the line to show. */
  group: { count: number; actorText: string } | null;
}

/**
 * Collapses consecutive routine entries that share a day, an action and a
 * resource type into one item. Non-routine entries are never merged.
 */
function sameValues(a: AuditLogEntry, b: AuditLogEntry): boolean {
  return JSON.stringify([a.oldValues, a.newValues]) === JSON.stringify([b.oldValues, b.newValues]);
}

export function buildAuditListItems(entries: AuditLogEntry[], ctx: DescribeContext): AuditListItem[] {
  const items: AuditListItem[] = [];
  for (const entry of entries) {
    const described = describeAuditEvent(entry, ctx);
    const prev = items[items.length - 1];
    const head = prev?.entries[0];
    const sameKind =
      head !== undefined &&
      head.action === entry.action &&
      head.resourceType === entry.resourceType &&
      dayKey(head.createdAt, ctx.timeZone) === dayKey(entry.createdAt, ctx.timeZone);
    // Routine entries collapse by kind ("12 owners opened …"). Anything else
    // collapses only when it is an exact repeat: the same sentence AND the same
    // recorded values, such as a record printed several times. resource_id
    // alone is not enough — role changes are recorded against the community,
    // so three people promoted on one day share it — and an edit's diff would
    // be hidden. Each repeat still has its own line in the details panel.
    const exactRepeat =
      sameKind &&
      prev !== undefined &&
      head.userId === entry.userId &&
      head.resourceId === entry.resourceId &&
      prev.described.sentence === described.sentence &&
      sameValues(head, entry);
    if (prev && sameKind && ((described.routine && prev.described.routine) || exactRepeat)) {
      prev.entries.push(entry);
      continue;
    }
    items.push({ key: String(entry.id), entries: [entry], described, group: null });
  }

  // Finish each group: name the people, and drop the object if it differs.
  for (const item of items) {
    if (item.entries.length < 2) continue;
    const first = item.entries[0]!;
    const sameObject = item.entries.every((e) => e.resourceId === first.resourceId);
    const described = describeAuditEvent(first, ctx, { withoutObject: !sameObject });
    const actors = Array.from(new Set(item.entries.map((e) => describeAuditEvent(e, ctx).actor.name)));
    const actorText =
      actors.length === 1
        ? actors[0]!
        : `${actors[0]} and ${actors.length - 1} ${actors.length - 1 === 1 ? 'other' : 'others'}`;
    item.described = described;
    item.group = { count: item.entries.length, actorText };
  }
  return items;
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

const TONE_CLASSES: Record<AuditTone, string> = {
  danger: 'bg-status-danger-bg text-status-danger border-status-danger-border',
  warning: 'bg-status-warning-bg text-status-warning border-status-warning-border',
  info: 'bg-status-info-bg text-status-info border-status-info-border',
  success: 'bg-status-success-bg text-status-success border-status-success-border',
};

export function AuditBadge({ tone, label }: { tone: AuditTone; label: string }) {
  return (
    <span
      className={cn(
        'ml-1.5 inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-px align-middle text-xs font-medium',
        TONE_CLASSES[tone],
      )}
    >
      <ToneIcon tone={tone} />
      {label}
    </span>
  );
}

const TONE_ICONS: Record<AuditTone, LucideIcon> = {
  danger: X,
  warning: AlertTriangle,
  info: Info,
  success: Check,
};

/** An icon per tone, so a badge or note never relies on colour alone. */
export function ToneIcon({ tone, className }: { tone: AuditTone; className?: string }) {
  const Icon = TONE_ICONS[tone];
  return <Icon className={cn('size-3', className)} aria-hidden="true" />;
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

export function AuditAvatar({ described, group }: { described: DescribedEvent; group?: boolean }) {
  const base = 'flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-medium text-content-secondary';
  if (group) {
    return (
      <span className={base} aria-hidden="true">
        <Users className="size-4" />
      </span>
    );
  }
  if (described.actor.kind === 'platform' || described.actor.viaSupport) {
    return (
      <span className={base} aria-hidden="true">
        <Building2 className="size-4" />
      </span>
    );
  }
  const initials = described.actor.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <span className={base} aria-hidden="true">
      {initials || '?'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sentence
// ---------------------------------------------------------------------------

interface SentenceProps {
  described: DescribedEvent;
  actorText?: string;
  onScope?: (scope: AuditScope, label: string) => void;
}

/** Actor and item in bold; clickable when they can narrow the page. */
export function AuditSentence({ described, actorText, onScope }: SentenceProps) {
  const actorScope: AuditScope | null =
    !actorText && described.actor.userId ? { kind: 'person', userId: described.actor.userId } : null;
  const actorLabel = actorText ?? (described.actor.viaSupport ? `PropertyPro support (signed in as ${described.actor.name})` : described.actor.name);

  return (
    <>
      <Bold label={actorLabel} scope={described.actor.viaSupport ? null : actorScope} onScope={onScope} />{' '}
      {described.verb}
      {described.object && (
        <>
          {' '}
          <Bold label={described.object.label} scope={described.object.scope} onScope={onScope} />
        </>
      )}
      {described.trailing && <> {described.trailing}</>}
    </>
  );
}

function Bold({
  label,
  scope,
  onScope,
}: {
  label: string;
  scope: AuditScope | null;
  onScope?: (scope: AuditScope, label: string) => void;
}) {
  if (!scope || !onScope) return <span className="font-medium text-content">{label}</span>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onScope(scope, label);
      }}
      className="relative z-10 rounded-sm text-left font-medium text-content underline-offset-4 hover:text-content-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      title={`Show only activity for ${label}`}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

interface AuditEventListProps {
  items: AuditListItem[];
  timeZone: string;
  selectedKey: string | null;
  onOpen: (item: AuditListItem, trigger: HTMLElement) => void;
  onScope: (scope: AuditScope, label: string) => void;
}

export function AuditEventList({ items, timeZone, selectedKey, onOpen, onScope }: AuditEventListProps) {
  const sections: Array<{ heading: string; items: AuditListItem[] }> = [];
  for (const item of items) {
    const heading = dayHeading(item.entries[0]!.createdAt, timeZone);
    const last = sections[sections.length - 1];
    if (last && last.heading === heading) last.items.push(item);
    else sections.push({ heading, items: [item] });
  }

  return (
    <div>
      {sections.map((section) => (
        <section key={section.heading} aria-label={section.heading}>
          <h2 className="pb-1 pt-5 text-sm font-medium text-content-secondary">{section.heading}</h2>
          <ul className="-mx-3">
            {section.items.map((item) => (
              <AuditRow
                key={item.key}
                item={item}
                timeZone={timeZone}
                selected={item.key === selectedKey}
                onOpen={onOpen}
                onScope={onScope}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function AuditRow({
  item,
  timeZone,
  selected,
  onOpen,
  onScope,
}: {
  item: AuditListItem;
  timeZone: string;
  selected: boolean;
  onOpen: AuditEventListProps['onOpen'];
  onScope: AuditEventListProps['onScope'];
}) {
  const first = item.entries[0]!;
  const { described, group } = item;
  const time = group ? `${group.count} times` : formatTime(first.createdAt, timeZone);
  const exact = formatDateTime(first.createdAt, timeZone, true);

  return (
    <li
      className={cn(
        // Phones: the time goes under the sentence, so the sentence gets the width.
        'relative grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1 rounded-md px-3 py-3',
        'sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center',
        selected ? 'bg-surface-muted' : 'hover:bg-surface-hover',
      )}
    >
      {/* Covers the whole row; the bold names sit above it (z-10). */}
      <button
        type="button"
        onClick={(e) => onOpen(item, e.currentTarget)}
        aria-label={`Details: ${group ? `${group.actorText} ${described.verb}` : described.sentence}`}
        aria-current={selected ? 'true' : undefined}
        data-audit-row={item.key}
        className="absolute inset-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      />
      <AuditAvatar described={described} group={group !== null && group.actorText.includes(' and ')} />
      <p className="text-base leading-snug text-content-secondary">
        <AuditSentence described={described} actorText={group?.actorText} onScope={onScope} />
        {described.badge && <AuditBadge tone={described.badge.tone} label={described.badge.label} />}
      </p>
      <span
        className="col-start-2 whitespace-nowrap text-sm text-content-tertiary sm:col-start-auto"
        title={group ? undefined : exact}
      >
        {time}
      </span>
    </li>
  );
}
