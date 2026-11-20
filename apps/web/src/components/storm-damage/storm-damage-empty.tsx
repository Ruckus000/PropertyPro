'use client';

/**
 * Storm Damage before any report exists (spec docs/design-system/patterns/
 * empty-states.md §4.1, §4.4; plan P4, D18).
 *
 * Managers get a two-step setup guide; residents a calm waiting state with
 * their one action, "Report damage". Both show the report's real fields and
 * the real status names (Logged → Reviewed by management → Archived). No step
 * for repairs exists, and the form has no photo field, so neither is drawn.
 *
 * STORM_DAMAGE_DISCLAIMER is legal copy (Fla. Stat. §626.854; no counsel
 * budget): it renders verbatim and in full, never collapsed, as a full-width
 * note under the hero. Only its position and styling changed.
 */

import * as React from 'react';
import Link from 'next/link';
import { StormCalmScene } from '@propertypro/ui';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import {
  ContextLinks,
  ContextRows,
  ContextSection,
  SetupGuide,
  type SetupStep,
} from '@/components/shared/setup-guide';
import { STORM_DAMAGE_DISCLAIMER, STORM_DAMAGE_STATUS_NOTE } from '@/lib/constants/storm-disclaimers';
import {
  STORM_DAMAGE_CATEGORY_LABELS,
  STORM_DAMAGE_SEVERITY_LABELS,
  STORM_DAMAGE_STATUS_LABELS,
} from './types';

const HELP = { href: '/help/building/storm-damage', label: '' };

/** The report form's fields, with its own labels and in its order (storm-damage-form-dialog.tsx). */
function ReportFields() {
  const fields: Array<{ label: string; detail: string }> = [
    { label: 'Location', detail: 'The building, floor or common area' },
    { label: 'Type of damage', detail: Object.values(STORM_DAMAGE_CATEGORY_LABELS).join(', ') },
    { label: 'Severity', detail: Object.values(STORM_DAMAGE_SEVERITY_LABELS).join(', ') },
    { label: 'When did it happen?', detail: 'Optional' },
    { label: 'Description', detail: 'What was damaged and how' },
  ];
  return (
    <ol className="divide-y divide-edge rounded-md border border-edge">
      {fields.map((field, index) => (
        <li key={field.label} className="flex items-start gap-3 px-4 py-3">
          <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full border border-edge text-xs font-semibold tabular-nums text-content-secondary">
            {index + 1}
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-medium text-content">{field.label}</span>
            <span className="text-xs text-content-secondary">{field.detail}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** The real status names, in order, and the note that they are tracking only. */
function StatusTrack() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-content">{Object.values(STORM_DAMAGE_STATUS_LABELS).join(' → ')}</p>
      <p className="text-xs text-content-secondary">{STORM_DAMAGE_STATUS_NOTE}</p>
    </div>
  );
}

/** The §626.854 notice, verbatim and complete. A note, not an alert: nothing is wrong. */
export function StormDamageNotice() {
  return (
    <div role="note" aria-label="About these records" className="rounded-md border border-status-warning-border bg-status-warning-bg px-4 py-4 md:px-6">
      <p className="max-w-[75ch] text-sm text-content">{STORM_DAMAGE_DISCLAIMER}</p>
    </div>
  );
}

export function StormDamageEmpty({
  communityId,
  canManage,
  onReport,
}: {
  communityId: number;
  canManage: boolean;
  onReport: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {canManage ? (
        <ManagerSetup communityId={communityId} onReport={onReport} />
      ) : (
        <EmptyState
          size="hero"
          eyebrow="Storm damage"
          title="Your damage reports appear here"
          description="After a storm, record any building or common-area damage you noticed so management has it on file."
          illustration={<StormCalmScene size="hero" />}
          action={<Button onClick={onReport}>Report damage</Button>}
          aside={
            <>
              <ContextSection title="What a report includes">
                <ReportFields />
              </ContextSection>
              <ContextSection title="What happens after you send it">
                <StatusTrack />
              </ContextSection>
              <ContextSection title="Help">
                <ContextLinks links={[{ ...HELP, label: 'Report storm damage' }]} />
              </ContextSection>
            </>
          }
        />
      )}
      <StormDamageNotice />
    </div>
  );
}

function ManagerSetup({ communityId, onReport }: { communityId: number; onReport: () => void }) {
  const steps: SetupStep[] = [
    {
      id: 'log',
      label: 'Log the first report',
      done: false,
      heading: 'Log the first report',
      description: 'Every report asks for the same five things, so reviews are quick. Residents file their own from their portal.',
      action: <Button onClick={onReport}>Report damage</Button>,
      content: <ReportFields />,
    },
    {
      id: 'review',
      label: 'Review and track',
      done: false,
      disabledReason: 'Opens with the first report.',
      heading: 'Review and track',
      items: Object.values(STORM_DAMAGE_STATUS_LABELS).map((label) => ({ label })),
    },
  ];

  return (
    <SetupGuide
      eyebrow="Storm damage"
      title="One place for every damage report"
      description="When residents or staff log damage after a storm, it lands here so management can review it in one place instead of chasing texts."
      facts={[{ label: 'Residents file from their own portal' }, { label: 'Status tracked to archive' }]}
      illustration={<StormCalmScene size="hero" />}
      steps={steps}
      context={
        <>
          <ContextSection title="Before storm season">
            <p className="text-sm text-content-secondary">
              Tell residents where to report. A short announcement saves a pile of texts after a storm.
            </p>
            <Button asChild variant="outline" className="self-start">
              <Link href={`/announcements/new?communityId=${communityId}`}>New announcement</Link>
            </Button>
          </ContextSection>
          <ContextSection title="What happens to a report">
            <StatusTrack />
          </ContextSection>
          <ContextSection title="Who sees what">
            <ContextRows
              rows={[
                { label: 'Residents', detail: 'File reports and see only their own.' },
                { label: 'Management', detail: 'Sees every report and moves its status.' },
              ]}
            />
          </ContextSection>
          <ContextSection title="Help">
            <ContextLinks links={[{ ...HELP, label: 'Review storm damage reports' }]} />
          </ContextSection>
        </>
      }
    />
  );
}
