import { EmailLayout } from '../components/email-layout';
import { ActionRow, CategoryMark, DataRows, FinePrint, Headline, Strong, type DataRow } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

export interface CalendarEventReminderEmailProps extends BaseEmailProps {
  recipientName: string;
  eventLabel: string;
  eventTitle: string;
  reminderTimingLabel: string;
  eventDateLabel: string;
  eventTimeLabel?: string | null;
  detailLines?: string[];
  ctaLabel: string;
  ctaUrl: string;
}

/**
 * Layout A7 · Meeting notice (reminder variant) — the event's when and where in
 * a panel, one action. A courtesy reminder, not a statutory notice, so it
 * carries no statute line.
 */
export function CalendarEventReminderEmail({
  branding,
  previewText,
  recipientName,
  eventLabel,
  eventTitle,
  reminderTimingLabel,
  eventDateLabel,
  eventTimeLabel,
  detailLines = [],
  ctaLabel,
  ctaUrl,
}: CalendarEventReminderEmailProps) {
  const rows: DataRow[] = [
    { label: 'When', value: `${eventDateLabel}${eventTimeLabel ? ` at ${eventTimeLabel}` : ''}` },
    ...detailLines.map((line) => ({ label: 'Details', value: line })),
  ];

  return (
    <EmailLayout
      branding={branding}
      previewText={previewText ?? `${eventLabel}: ${eventTitle} on ${eventDateLabel}`}
      mastheadContext="Calendar reminder"
    >
      <CategoryMark icon="calendar-coral" label={`${eventLabel} reminder`} tone="coral" />
      <Headline
        lede={
          <>
            Hi {recipientName} — this is your {reminderTimingLabel.toLowerCase()} reminder for <Strong>{eventTitle}</Strong>{' '}
            at <Strong>{branding.communityName}</Strong>.
          </>
        }
      >
        {eventTitle}
      </Headline>
      <DataRows variant="panel" rows={rows} />
      <ActionRow href={ctaUrl} label={ctaLabel} />
      <FinePrint>
        You can change calendar event reminder timing or turn these emails off in your notification settings at any
        time.
      </FinePrint>
    </EmailLayout>
  );
}
