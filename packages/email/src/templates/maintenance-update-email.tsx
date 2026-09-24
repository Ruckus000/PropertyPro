import { EmailLayout } from '../components/email-layout';
import {
  ActionRow,
  CategoryMark,
  DataRows,
  FinePrint,
  Headline,
  Paragraph,
  Quote,
  SectionLabel,
  StatusPill,
  Strong,
} from '../components/email-blocks';
import { toneColors, type EmailTone } from '../components/theme';
import type { BaseEmailProps } from '../types';

export interface MaintenanceUpdateEmailProps extends BaseEmailProps {
  recipientName: string;
  requestTitle: string;
  previousStatus: string;
  newStatus: string;
  notes?: string;
  portalUrl: string;
}

/**
 * Layout A2 · Announcement (maintenance variant) — what changed on a request,
 * as a before/after pair of status pills, with the manager's notes quoted in
 * their own words when there are any.
 */
export function MaintenanceUpdateEmail({
  branding,
  previewText,
  recipientName,
  requestTitle,
  previousStatus,
  newStatus,
  notes,
  portalUrl,
}: MaintenanceUpdateEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={previewText ?? `Update on your maintenance request: ${requestTitle}`}
      mastheadContext="Maintenance request"
    >
      <CategoryMark icon="megaphone-slate" label="Maintenance request update" tone="meta" />
      <Headline>{requestTitle}</Headline>
      <Paragraph tight>Hi {recipientName},</Paragraph>
      <Paragraph>
        There has been an update to a maintenance request at <Strong>{branding.communityName}</Strong>.
      </Paragraph>
      <DataRows
        rows={[
          { label: 'Previous status', value: <StatusPill tone={getStatusTone(previousStatus)}>{previousStatus}</StatusPill> },
          { label: 'Current status', value: <StatusPill tone={getStatusTone(newStatus)}>{newStatus}</StatusPill> },
        ]}
      />
      {notes && (
        <>
          <SectionLabel>Notes</SectionLabel>
          <Quote>{notes}</Quote>
        </>
      )}
      <ActionRow href={portalUrl} label="View request" />
      <FinePrint>This notification was sent because you submitted or are assigned to this maintenance request.</FinePrint>
    </EmailLayout>
  );
}

function getStatusTone(status: string): EmailTone {
  const lower = status.toLowerCase();
  if (lower === 'completed' || lower === 'resolved') return 'green';
  if (lower === 'rejected' || lower === 'cancelled') return 'red';
  return 'amber';
}

// Keep legacy name for any external references
function getStatusColor(status: string): string {
  return toneColors(getStatusTone(status)).text;
}

export { getStatusColor };
