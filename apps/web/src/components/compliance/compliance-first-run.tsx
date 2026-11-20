'use client';

/**
 * Compliance on day one: a calm countdown, not an alarm (spec
 * docs/design-system/patterns/empty-states.md §4.1 "Compliance"; board
 * "F-Compliance"; audit F-6, F-8).
 *
 * Shown while nothing is posted and nothing is overdue. No 0% score and no
 * "requirements are now in effect": records are grouped by WHEN they are due
 * (on a date / kept current over 12 months / only if they apply), each with
 * its own action. Compliance shows when; Documents is where files go.
 */

import * as React from 'react';
import { DocumentsScene, ProgressRing } from '@propertypro/ui';
import { requiredSectionStatute, unitThreshold, type CommunityType } from '@propertypro/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@propertypro/ui';
import { EmptyState } from '@/components/shared/empty-state';
import { ContextLinks, ContextSection } from '@/components/shared/setup-guide';
import { BOARD_ACTION_TEMPLATE_KEYS } from '@/lib/utils/compliance-calculator';
import { daysUntil, groupFirstRun, type FirstRunItem } from '@/lib/compliance/first-run';
import type { ChecklistItemData } from './compliance-checklist-item';

interface ComplianceFirstRunProps {
  communityId: number;
  communityType?: CommunityType;
  items: ChecklistItemData[];
  canWrite: boolean;
  /** Below the website rule's size threshold there is no posting clock. */
  clockOff: boolean;
  timeZone?: string;
  onUpload: (item: ChecklistItemData) => void;
  onNotApplicable: (item: ChecklistItemData) => void;
}

/** "1 record", "3 records". */
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The statute sentence, from the shared table (packages/shared site-diff
 * STATUTES) so it cannot drift from the website and Documents copy.
 */
function statuteSentence(communityType: CommunityType | undefined): string | null {
  const statute = communityType ? requiredSectionStatute(communityType) : null;
  const threshold = communityType ? unitThreshold(communityType) : null;
  if (!statute || !threshold) return null;
  const who = communityType === 'hoa_720' ? 'HOAs' : 'condo associations';
  return `Florida requires ${who} with ${threshold.minUnits} or more ${threshold.unitNoun} to post these records for owners (${statute}).`;
}

export function ComplianceFirstRun({
  communityId,
  communityType,
  items,
  canWrite,
  clockOff,
  timeZone,
  onUpload,
  onNotApplicable,
}: ComplianceFirstRunProps) {
  const groups = groupFirstRun(items);
  const now = new Date();
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', timeZone }).format(new Date(iso));
  const dueDate = groups.firstDeadline ? formatDate(groups.firstDeadline) : null;
  // Required records only: a conditional board record may not apply at all.
  const boardActions = items.filter(
    (i) => BOARD_ACTION_TEMPLATE_KEYS.has(i.templateKey) && i.isApplicable !== false && !i.isConditional,
  ).length;
  const statute = statuteSentence(communityType);

  // Owners and board members read Compliance but cannot post: no counts, no
  // to-do language, just what will appear here (spec §2, Waiting).
  if (!canWrite) {
    return (
      <EmptyState
        size="hero"
        eyebrow="Compliance"
        title="Your association's posted records appear here"
        description="As management posts the records owners can see, each one shows here with the date it was posted."
        illustration={<DocumentsScene size="hero" next={false} />}
      />
    );
  }

  const row = (item: FirstRunItem) => {
    const data = item as ChecklistItemData;
    return (
      <li key={item.id} className="flex min-h-14 flex-wrap items-center gap-3 py-3">
        <span className="min-w-0 flex-[1_1_16rem]">
          <span className="block text-sm font-medium text-content">{item.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-content-secondary">
            {item.isConditional && item.deadline && !clockOff
              ? `Post it, or mark it as not applying, by ${formatDate(item.deadline)}`
              : 'Not posted'}
            {BOARD_ACTION_TEMPLATE_KEYS.has(item.templateKey) && <Badge variant="neutral">Board action</Badge>}
          </span>
        </span>
        {canWrite && (
          <span className="flex flex-wrap gap-2">
            {item.isConditional && (
              <Button variant="ghost" size="sm" onClick={() => onNotApplicable(data)} aria-label={`Doesn't apply to us: ${item.title}`}>
                Doesn&apos;t apply to us
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => onUpload(data)} aria-label={`Upload: ${item.title}`}>
              Upload
            </Button>
          </span>
        )}
      </li>
    );
  };

  const group = (title: string, meta: string, description: string, list: FirstRunItem[]) =>
    list.length > 0 && (
      <section aria-label={title} className="rounded-md border border-edge bg-surface-card px-4 py-4 md:px-6">
        <p className="text-xs tabular-nums text-content-secondary">{meta}</p>
        <h3 className="mt-1 text-lg font-semibold text-content">{title}</h3>
        <p className="mt-2 max-w-[65ch] text-sm text-content-secondary">{description}</p>
        <ul className="mt-2 divide-y divide-edge">{list.map(row)}</ul>
      </section>
    );

  return (
    <div className="flex flex-col gap-6">
      <EmptyState
        size="hero"
        eyebrow="Compliance"
        title={clockOff || !dueDate ? 'Post the records owners can see' : 'Your 30-day posting window has started'}
        description={[
          statute,
          clockOff
            ? 'This association is below that size, so posting is recommended and no posting deadlines apply.'
            : dueDate
              ? `${count(groups.due.length, 'of them is', 'of them are')} due 30 days after this checklist was created: ${dueDate}.`
              : null,
        ]
          .filter(Boolean)
          .join(' ')}
        illustration={<DocumentsScene size="hero" next={false} />}
        action={
          <div className="flex flex-col gap-3">
            <ul className="flex flex-wrap items-center gap-2" aria-label="Where things stand">
              <li className="mr-2 inline-flex items-center gap-2 text-sm text-content-secondary">
                <ProgressRing done={0} total={groups.required} />
                <span>
                  <b className="font-semibold tabular-nums text-content">0 of {groups.required}</b> required posted
                </span>
              </li>
              {!clockOff && groups.firstDeadline && (
                <li className="inline-flex min-h-8 items-center rounded-full border border-edge px-3 text-xs text-content">
                  {count(daysUntil(groups.firstDeadline, now), 'day', 'days')} left
                </li>
              )}
              {groups.conditional.length > 0 && (
                <li className="inline-flex min-h-8 items-center rounded-full border border-edge px-3 text-xs text-content">
                  {groups.conditional.length} more only if {groups.conditional.length === 1 ? 'it applies' : 'they apply'}
                </li>
              )}
            </ul>
            <p className="text-sm text-content-secondary">
              Nothing is late.
              {boardActions > 0 &&
                ` ${count(boardActions, 'record needs', 'records need')} your board to act; ${boardActions === 1 ? 'it is' : 'they are'} marked below.`}
            </p>
          </div>
        }
        aside={
          <>
            <ContextSection title="How readiness is counted">
              <p className="text-sm text-content-secondary">
                Records posted on time, divided by records that apply. Marking one &ldquo;doesn&rsquo;t apply&rdquo; never lowers it.
              </p>
            </ContextSection>
            <ContextSection title="Where files go">
              <p className="text-sm text-content-secondary">
                Every upload here is filed in Documents and linked to its record.
              </p>
              <ContextLinks links={[{ href: `/communities/${communityId}/documents`, label: 'Open Documents' }]} />
            </ContextSection>
            <ContextSection title="Help">
              <ContextLinks
                links={[
                  { href: '/help/compliance/posting-requirements', label: 'Which records Florida requires you to post' },
                  { href: '/help/compliance/compliance-score', label: 'How the compliance score works' },
                ]}
              />
            </ContextSection>
          </>
        }
      />

      {group(
        'Post by the deadline',
        dueDate ? `Due ${dueDate} · 0 of ${groups.due.length}` : `0 of ${groups.due.length}`,
        'Post each by the deadline, 30 days after this checklist was created, and post the new one whenever it changes.',
        groups.due,
      )}
      {group(
        'Keep current, rolling 12 months',
        `No single deadline · 0 of ${groups.rolling.length}`,
        'These are never finished: each new one is posted as it happens.',
        groups.rolling,
      )}
      {group(
        'Post these',
        `0 of ${groups.once.length}`,
        'No posting deadline applies at this size. Post each, and post the new one whenever it changes.',
        groups.once,
      )}
      {group(
        'Only if they apply',
        count(groups.conditional.length, 'record', 'records'),
        'Some buildings need these. If one doesn’t apply to your association, mark it so and give a short reason. It leaves the count.',
        groups.conditional,
      )}
    </div>
  );
}
