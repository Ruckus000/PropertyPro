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
import { Button } from '@/components/ui/button';
import { Badge } from '@propertypro/ui';
import { EmptyState } from '@/components/shared/empty-state';
import { ContextLinks, ContextSection } from '@/components/shared/setup-guide';
import { BOARD_ACTION_TEMPLATE_KEYS } from '@/lib/utils/compliance-calculator';
import { daysUntil, groupFirstRun, type FirstRunItem } from '@/lib/compliance/first-run';
import type { ChecklistItemData } from './compliance-checklist-item';

interface ComplianceFirstRunProps {
  communityId: number;
  items: ChecklistItemData[];
  canWrite: boolean;
  /** Below the website rule's size threshold there is no posting clock. */
  clockOff: boolean;
  timeZone?: string;
  onUpload: (item: ChecklistItemData) => void;
  onNotApplicable: (item: ChecklistItemData) => void;
}

export function ComplianceFirstRun({
  communityId,
  items,
  canWrite,
  clockOff,
  timeZone,
  onUpload,
  onNotApplicable,
}: ComplianceFirstRunProps) {
  const groups = groupFirstRun(items);
  const condo = items[0]?.templateKey.startsWith('718_') ?? true;
  const now = new Date();
  const dueDate = groups.firstDeadline
    ? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', timeZone }).format(new Date(groups.firstDeadline))
    : null;
  const boardActions = items.filter((i) => BOARD_ACTION_TEMPLATE_KEYS.has(i.templateKey) && i.isApplicable !== false).length;
  const statute = condo
    ? 'Florida requires condo associations with 25 or more units to post these records for owners (§718.111(12)(g)).'
    : 'Florida requires HOAs with 100 or more parcels to post these records for owners (§720.303(4)).';

  const row = (item: FirstRunItem) => {
    const data = item as ChecklistItemData;
    return (
      <li key={item.id} className="flex min-h-14 flex-wrap items-center gap-3 py-3">
        <span className="min-w-0 flex-[1_1_16rem]">
          <span className="block text-sm font-medium text-content">{item.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-content-secondary">
            Not posted
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
        description={
          clockOff || !dueDate
            ? `${statute} This association is below that size, so posting is recommended and no deadlines apply.`
            : `${statute} ${groups.due.length} of them are due 30 days after this checklist was created: ${dueDate}.`
        }
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
                  {daysUntil(groups.firstDeadline, now)} days left
                </li>
              )}
              {groups.conditional.length > 0 && (
                <li className="inline-flex min-h-8 items-center rounded-full border border-edge px-3 text-xs text-content">
                  {groups.conditional.length} more only if they apply
                </li>
              )}
            </ul>
            <p className="text-sm text-content-secondary">
              Nothing is late.
              {boardActions > 0 && ` ${boardActions} ${boardActions === 1 ? 'record needs' : 'records need'} your board to act; ${boardActions === 1 ? 'it is' : 'they are'} marked below.`}
            </p>
          </div>
        }
        aside={
          <>
            <ContextSection title="How readiness is counted">
              <p className="text-sm text-content-secondary">
                Posted records divided by records that apply. Marking one &ldquo;doesn&rsquo;t apply&rdquo; never lowers it.
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
        'Post once, by the deadline',
        dueDate ? `Due ${dueDate} · 0 of ${groups.due.length}` : `0 of ${groups.due.length}`,
        'Each of these is posted once. The deadline is 30 days after this checklist was created.',
        groups.due,
      )}
      {group(
        'Keep current, rolling 12 months',
        `No single deadline · 0 of ${groups.rolling.length}`,
        'These are never finished: each new one is posted as it happens.',
        groups.rolling,
      )}
      {group('Post once', `0 of ${groups.once.length}`, 'Each of these is posted once.', groups.once)}
      {group(
        'Only if they apply',
        `${groups.conditional.length} records`,
        'Some buildings need these. If one doesn’t apply to your association, mark it so and give a short reason. It leaves the count.',
        groups.conditional,
      )}
    </div>
  );
}
