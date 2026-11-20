'use client';

/**
 * Meetings before the first one exists (spec docs/design-system/patterns/
 * empty-states.md §4.1 "Meetings", §4.4; plan P6; audit F-11).
 *
 * Managers: Schedule → Post the notice → Minutes. Meeting types are the
 * slots, grouped by how much notice the app expects (getNoticeLeadDays:
 * board and committee 48 hours; annual, special and budget 14 days). The app
 * warns inside the window and never blocks. Residents: a calm waiting state.
 *
 * "First run" is the all-time meeting count, never the month on screen: an
 * empty month on a community with meetings is just an empty month (F-11).
 */

import * as React from 'react';
import { DocumentsScene } from '@propertypro/ui';
import { CalendarClock, CalendarDays } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import {
  ContextLinks,
  ContextSection,
  SetupGuide,
  SetupSlot,
  SetupSlotList,
  type SetupStep,
} from '@/components/shared/setup-guide';
import { Button } from '@/components/ui/button';
import type { MeetingTypeOption } from './meeting-form';

const TYPE_LABELS: Record<MeetingTypeOption, string> = {
  board: 'Board meeting',
  committee: 'Committee meeting',
  annual: 'Annual meeting',
  special: 'Special meeting',
  budget: 'Budget meeting',
};

const NOTICE_GROUPS: Array<{ label: string; notice: string; types: MeetingTypeOption[] }> = [
  { label: '48 hours’ notice', notice: 'Post the notice 48 hours ahead', types: ['board', 'committee'] },
  { label: '14 days’ notice', notice: 'Post the notice 14 days ahead', types: ['annual', 'special', 'budget'] },
];

export function MeetingsSetup({ onSchedule }: { onSchedule: (type: MeetingTypeOption) => void }) {
  const steps: SetupStep[] = [
    {
      id: 'schedule',
      label: 'Schedule',
      done: false,
      heading: 'Schedule your first meeting',
      description: 'Pick the kind of meeting. Its type sets how much notice the app expects.',
      action: <Button onClick={() => onSchedule('board')}>Schedule a meeting</Button>,
      content: (
        <div className="flex flex-col gap-6">
          {NOTICE_GROUPS.map((group) => (
            <section key={group.label} aria-label={group.label} className="flex flex-col gap-3">
              <h4 className="text-sm font-semibold text-content">{group.label}</h4>
              <SetupSlotList label={group.label}>
                {group.types.map((type) => (
                  <SetupSlot
                    key={type}
                    title={TYPE_LABELS[type]}
                    description={group.notice}
                    addLabel="Schedule"
                    icon={<CalendarDays className="size-5" />}
                    onAdd={() => onSchedule(type)}
                  />
                ))}
              </SetupSlotList>
            </section>
          ))}
        </div>
      ),
    },
    {
      id: 'notice',
      label: 'Post the notice',
      done: false,
      disabledReason: 'Opens once a meeting is scheduled.',
      heading: 'Post the notice',
      items: [{ label: 'Notice' }, { label: 'Agenda' }],
    },
    {
      id: 'minutes',
      label: 'Minutes',
      done: false,
      disabledReason: 'Opens after the first meeting.',
      heading: 'Post the minutes',
      items: [{ label: 'Approved minutes' }],
    },
  ];

  return (
    <SetupGuide
      eyebrow="Meetings & calendar"
      title="Run meetings residents can follow"
      description="Schedule a meeting, post its notice in time, then post the minutes. Each step shows up on the calendar and the schedule."
      facts={[{ icon: <CalendarClock aria-hidden="true" className="size-4" />, label: 'Warns inside the notice window, never blocks' }]}
      illustration={<DocumentsScene size="hero" />}
      steps={steps}
      context={
        <>
          <ContextSection title="How much notice">
            <p className="text-sm text-content-secondary">
              Board and committee meetings: 48 hours. Annual, special and budget meetings: 14 days. If a notice goes
              up later than that, the app says so; it never stops you.
            </p>
          </ContextSection>
          <ContextSection title="Help">
            <ContextLinks
              links={[
                { href: '/help/meetings/schedule-meeting', label: 'Schedule a meeting and post the notice' },
                { href: '/help/meetings/post-minutes', label: 'Post approved minutes' },
              ]}
            />
          </ContextSection>
        </>
      }
    />
  );
}

export function MeetingsWaiting({ communityId }: { communityId: number }) {
  return (
    <EmptyState
      size="hero"
      eyebrow="Meetings & calendar"
      title="Meetings and their notices appear here"
      description="When a meeting is scheduled, it shows on the calendar and the schedule, with its notice and agenda. Minutes follow once they're approved."
      illustration={<DocumentsScene size="hero" next={false} />}
      aside={
        <>
          <ContextSection title="How you'll hear">
            <p className="text-sm text-content-secondary">
              A notice when a meeting is scheduled, by email (right away or in your digest, as your notification
              settings say) and here.
            </p>
            <ContextLinks
              links={[{ href: `/settings?tab=notifications&communityId=${communityId}`, label: 'Notification settings' }]}
            />
          </ContextSection>
          <ContextSection title="Help">
            <ContextLinks links={[{ href: '/help/meetings/meeting-notices', label: 'Find meetings, agendas and minutes' }]} />
          </ContextSection>
        </>
      }
    />
  );
}
