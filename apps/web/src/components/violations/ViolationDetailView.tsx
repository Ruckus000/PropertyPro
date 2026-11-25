'use client';

/**
 * One violation case on the page kit (/violations/[id]).
 *
 * Status and severity sit beside the title, each a glyph with its word.
 * Managers and board seats (`canManage`) get the actions in the header and the
 * Details panel, which is the only place the reporter is named. A resident
 * gets neither: no panel, no actions, no reporter, and reads the unit above
 * the description instead.
 *
 * The case is loaded by the route's server component, so a completed action
 * asks the router to re-render that component (`router.refresh()`): the new
 * status arrives as props and a short-notice hearing toast stays on screen.
 */
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import DOMPurify from 'isomorphic-dompurify';
import { TriangleAlert } from 'lucide-react';
import { PageLayout } from '@propertypro/ui/components/shared/page-layout';
import { Section, SectionHeader } from '@propertypro/ui/components/shared/section';
import { StatusGlyph, type StatusGlyphKind } from '@propertypro/ui/components/shared/status-glyph';
import type { ViolationRecord } from '@/lib/services/violations-service';
import type { ViolationItem, ViolationFineItem } from '@/lib/api/violations';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { formatDeadlineStamp } from '@/lib/meetings/meeting-status';
import { formatDateOnly } from '@/lib/utils/format-date';
import {
  categoryLabel,
  SEVERITY_OPTIONS,
  VIOLATION_STATUS_LABELS,
  violationGlyph,
} from '@/lib/violations/vocabulary';
import { ViolationStatusTransition } from './ViolationStatusTransition';
import { FinesSummary } from './FinesSummary';

/** The mark beside the severity word. The word carries the meaning; the mark only ranks it. */
const SEVERITY_GLYPH: Record<ViolationRecord['severity'], StatusGlyphKind> = {
  minor: 'not-started',
  moderate: 'attention',
  major: 'overdue',
};

type ActionType = 'notice' | 'hearing' | 'fine' | 'resolve' | 'dismiss';

interface AvailableAction {
  label: string;
  action: ActionType;
  /** The one filled button. Everything else is an outline button. */
  primary?: boolean;
}

/**
 * `finesEnabled` reflects the per-community `violationFinesEnabled` legal gate.
 * When false the "Impose Fine" action is removed from the list rather than
 * rendered-and-disabled: a disabled button invites a support ticket asking how to
 * enable it, and the server 403s the call regardless. The server guard in
 * api/v1/violations/[id]/fine is authoritative — this is presentation only.
 * See docs/audits/2026-08-09-legal-risk-audit.md F-04.
 *
 * Listed in reading order: the outline buttons, then the primary at the right.
 */
function getAvailableActions(status: string, finesEnabled: boolean): AvailableAction[] {
  const actions = ((): AvailableAction[] => {
    switch (status) {
      case 'reported':
        return [{ label: 'Send Notice', action: 'notice', primary: true }];
      case 'noticed':
        return [
          { label: 'Impose Fine', action: 'fine' },
          { label: 'Schedule Hearing', action: 'hearing', primary: true },
        ];
      case 'hearing_scheduled':
        return [
          { label: 'Impose Fine', action: 'fine' },
          { label: 'Dismiss', action: 'dismiss' },
          { label: 'Resolve', action: 'resolve', primary: true },
        ];
      case 'fined':
        return [{ label: 'Resolve', action: 'resolve', primary: true }];
      default:
        return [];
    }
  })();

  // Fines are gated per-community; drop the action entirely when disabled.
  return actions.filter((a) => a.action !== 'fine' || finesEnabled);
}

const DL_CLASS = 'grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm';

interface ViolationDetailViewProps {
  /** IANA zone hearing times are shown and entered in (`membership.timezone`). */
  communityTimezone: string;
  violation: ViolationRecord;
  communityId: number;
  userId: string;
  /** Managers and board seats (canActAsBoard): the same rule as the API's admin writes. */
  canManage: boolean;
  /** Per-community `violationFinesEnabled` legal gate. Server guard is authoritative. */
  finesEnabled: boolean;
  /**
   * The reporter's standing in this community, for the Details panel. The
   * route looks it up for `canManage` viewers only; it is never drawn for
   * anyone else.
   */
  reportedByRole?: 'resident' | 'staff' | null;
  fines?: ViolationFineItem[];
}

export function ViolationDetailView({
  communityTimezone,
  violation,
  communityId,
  userId,
  canManage,
  finesEnabled,
  reportedByRole = null,
  fines,
}: ViolationDetailViewProps) {
  const router = useRouter();
  const [activeAction, setActiveAction] = useState<ActionType | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  /** The action whose form was just cancelled: its button gets focus back. */
  const [returnFocusTo, setReturnFocusTo] = useState<ActionType | null>(null);
  // Pending until the refreshed case arrives. Until then the header would
  // still offer the OLD status's actions, so they are disabled.
  const [refreshing, startRefresh] = useTransition();

  // The header buttons are put away while a form is open, and the form is gone
  // once it closes. Either way focus would fall to <body>; send it on instead.
  useEffect(() => {
    if (activeAction) formRef.current?.focus();
  }, [activeAction]);
  useEffect(() => {
    if (!returnFocusTo) return;
    actionsRef.current
      ?.querySelector<HTMLButtonElement>(`[data-action="${returnFocusTo}"]`)
      ?.focus();
    setReturnFocusTo(null);
  }, [returnFocusTo]);

  const actions = canManage ? getAvailableActions(violation.status, finesEnabled) : [];
  const unit = violation.unitLabel ?? `Unit #${violation.unitId}`;
  const category = categoryLabel(violation.category);
  const severityWord =
    SEVERITY_OPTIONS.find((s) => s.value === violation.severity)?.label ?? violation.severity;
  const dismissed = violation.status === 'dismissed';

  const reporter =
    violation.reportedByUserId === null
      ? null
      : violation.reportedByUserId === userId
        ? 'You'
        : reportedByRole === 'resident'
          ? 'A resident'
          : reportedByRole === 'staff'
            ? 'Staff'
            : null;

  // Map ViolationRecord to ViolationItem shape for the transition component
  const violationItem: ViolationItem = {
    id: violation.id,
    communityId: violation.communityId,
    unitId: violation.unitId,
    reportedByUserId: violation.reportedByUserId,
    category: violation.category,
    description: violation.description,
    status: violation.status,
    severity: violation.severity,
    evidenceDocumentIds: violation.evidenceDocumentIds,
    noticeDate: violation.noticeDate,
    hearingDate: violation.hearingDate ? new Date(violation.hearingDate).toISOString() : null,
    hearingLocation: violation.hearingLocation ?? null,
    resolutionDate: violation.resolutionDate ? new Date(violation.resolutionDate).toISOString() : null,
    resolutionNotes: violation.resolutionNotes,
    createdAt: new Date(violation.createdAt).toISOString(),
    updatedAt: new Date(violation.updatedAt).toISOString(),
  };

  const evidenceCount = violation.evidenceDocumentIds.length;

  return (
    <PageLayout
      template="detail"
      header={
        <PageHeader
          title={`Violation #${violation.id}`}
          icon={<TriangleAlert />}
          description="A violation case: what was reported and what has happened since."
          status={
            <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <StatusGlyph
                kind={violationGlyph(violation.status)}
                label={VIOLATION_STATUS_LABELS[violation.status]}
              />
              <StatusGlyph
                kind={SEVERITY_GLYPH[violation.severity]}
                label={`${severityWord} severity`}
              />
            </span>
          }
          actions={
            actions.length > 0 && !activeAction ? (
              <div ref={actionsRef} className="flex flex-wrap items-center gap-2 sm:justify-end">
                {actions.map(({ label, action, primary }) => (
                  <Button
                    key={action}
                    type="button"
                    data-action={action}
                    variant={primary ? 'default' : 'outline'}
                    disabled={refreshing}
                    onClick={() => setActiveAction(action)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            ) : undefined
          }
        />
      }
      panel={
        canManage
          ? {
              template: 'detail',
              details: (
                <dl className={DL_CLASS}>
                  <dt className="text-content-secondary">Unit</dt>
                  <dd className="text-content">{unit}</dd>
                  <dt className="text-content-secondary">Category</dt>
                  <dd className="text-content">{category}</dd>
                  <dt className="text-content-secondary">Reported</dt>
                  <dd className="text-content">
                    {formatDeadlineStamp(violation.createdAt, communityTimezone)}
                  </dd>
                  {reporter ? (
                    <>
                      <dt className="text-content-secondary">Reported by</dt>
                      <dd className="text-content">{reporter}</dd>
                    </>
                  ) : null}
                </dl>
              ),
            }
          : undefined
      }
    >
      <div className="flex flex-col gap-5">
        {/* Active transition form */}
        {activeAction ? (
          <div ref={formRef} tabIndex={-1}>
            <ViolationStatusTransition
              violation={violationItem}
              communityId={communityId}
              communityTimezone={communityTimezone}
              actorUserId={userId}
              action={activeAction}
              onComplete={() => {
                setActiveAction(null);
                startRefresh(() => router.refresh());
                // The focused form is gone; the title is the one thing sure to
                // be there whatever the new status offers.
                const title = document.querySelector<HTMLElement>('[data-page-header] h1');
                if (title) {
                  title.tabIndex = -1;
                  title.focus();
                }
              }}
              onCancel={() => {
                setReturnFocusTo(activeAction);
                setActiveAction(null);
              }}
            />
          </div>
        ) : null}

        <Section>
          <SectionHeader title="Description" />
          <div className="flex flex-col gap-3 px-4 py-4">
            {/* Staff read these in the Details panel; a resident has no panel. */}
            {!canManage ? (
              <p className="text-sm text-content-secondary">{`${category} · ${unit}`}</p>
            ) : null}
            <p className="max-w-3xl whitespace-pre-wrap text-sm text-content">
              {violation.description}
            </p>
          </div>
        </Section>

        <Section>
          <SectionHeader title="Timeline" />
          <dl className={`${DL_CLASS} px-4 py-4`}>
            <dt className="text-content-secondary">Reported</dt>
            <dd className="text-content">
              {formatDeadlineStamp(violation.createdAt, communityTimezone)}
            </dd>
            {violation.noticeDate ? (
              <>
                <dt className="text-content-secondary">Notice sent</dt>
                <dd className="text-content">{formatDateOnly(violation.noticeDate)}</dd>
              </>
            ) : null}
            {violation.hearingDate ? (
              <>
                <dt className="text-content-secondary">Hearing</dt>
                <dd className="text-content">
                  {formatDeadlineStamp(violation.hearingDate, communityTimezone)}
                </dd>
              </>
            ) : null}
            {violation.hearingLocation ? (
              <>
                <dt className="text-content-secondary">Hearing location</dt>
                <dd className="text-content">{violation.hearingLocation}</dd>
              </>
            ) : null}
            {violation.resolutionDate ? (
              <>
                <dt className="text-content-secondary">{dismissed ? 'Dismissed' : 'Resolved'}</dt>
                <dd className="text-content">
                  {formatDeadlineStamp(violation.resolutionDate, communityTimezone)}
                </dd>
              </>
            ) : null}
          </dl>
        </Section>

        {/* Resolution notes — sanitized once on write (PR 7); sanitized again on render. */}
        {violation.resolutionNotes ? (
          <Section>
            <SectionHeader title={dismissed ? 'Dismissal reason' : 'Resolution notes'} />
            <div
              className="max-w-3xl px-4 py-4 text-sm text-content [&_a]:underline [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:my-1 [&_ul]:ml-5 [&_ul]:list-disc"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(violation.resolutionNotes) }}
            />
          </Section>
        ) : null}

        {evidenceCount > 0 ? (
          <Section>
            <SectionHeader title="Evidence" />
            {/* ponytail: the case carries document ids only, so this cannot name or link the files. Trigger: the route loads the evidence documents' titles. */}
            <p className="px-4 py-4 text-sm text-content-secondary">
              {`${evidenceCount} ${evidenceCount === 1 ? 'document' : 'documents'} on file (document ${
                evidenceCount === 1 ? 'ID' : 'IDs'
              } ${violation.evidenceDocumentIds.join(', ')}).`}
            </p>
          </Section>
        ) : null}

        {/* Fines */}
        {fines ? <FinesSummary fines={fines} /> : null}
      </div>
    </PageLayout>
  );
}
