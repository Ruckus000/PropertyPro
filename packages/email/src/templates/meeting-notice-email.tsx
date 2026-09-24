import { EmailLayout } from '../components/email-layout';
import { ActionRow, CategoryMark, DataRows, FinePrint, Headline, MultilineText, Strong } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

export interface MeetingNoticeEmailProps extends BaseEmailProps {
  recipientName: string;
  meetingTitle: string;
  meetingDate: string;
  meetingTime: string;
  location: string;
  agendaUrl?: string;
  meetingType: 'board' | 'owner' | 'special';
}

const MEETING_TYPE_LABEL: Record<MeetingNoticeEmailProps['meetingType'], string> = {
  board: 'Board meeting',
  owner: 'Owner meeting',
  special: 'Special meeting',
};

/**
 * Layout A7 · Meeting notice — serve a legally sufficient notice a person will
 * actually read. The notice fields are the hero, and the statute line names the
 * notice window, so the email is its own proof of service.
 */
export function MeetingNoticeEmail({
  branding,
  previewText,
  recipientName,
  meetingTitle,
  meetingDate,
  meetingTime,
  location,
  agendaUrl,
  meetingType,
}: MeetingNoticeEmailProps) {
  const noticeWindow = meetingType === 'owner' || meetingType === 'special' ? '14 days' : '48 hours';
  const typeLabel = MEETING_TYPE_LABEL[meetingType];

  return (
    <EmailLayout
      branding={branding}
      previewText={previewText ?? `Meeting notice: ${meetingTitle} on ${meetingDate}`}
      mastheadContext="Official meeting notice"
      mastheadChip={{ label: typeLabel, tone: 'coral' }}
    >
      <CategoryMark icon="calendar-coral" label="Meeting notice · §718.112" tone="coral" />
      <Headline
        lede={
          <>
            Hi {recipientName} — this is an official notice for the following meeting at{' '}
            <Strong>{branding.communityName}</Strong>.
          </>
        }
      >
        {meetingTitle}
      </Headline>
      <DataRows
        variant="panel"
        rows={[
          { label: 'Type', value: typeLabel },
          { label: 'Date', value: meetingDate },
          { label: 'Time', value: meetingTime },
          { label: 'Location', value: <MultilineText text={location} /> },
        ]}
      />
      {agendaUrl && <ActionRow href={agendaUrl} label="View meeting agenda" />}
      <FinePrint>
        Per Florida Statute §718.112, this notice is provided at least {noticeWindow} before the meeting as required by
        law.
      </FinePrint>
    </EmailLayout>
  );
}
