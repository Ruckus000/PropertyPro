import { Heading, Text } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import { EmailButton } from '../components/email-button';
import { EmailAlert } from '../components/email-alert';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

export interface AssessmentDueReminderEmailProps extends BaseEmailProps {
  recipientName: string;
  assessmentTitle: string;
  amountDue: string;
  dueDate: string;
  portalUrl: string;
}

export function AssessmentDueReminderEmail({
  branding,
  previewText,
  recipientName,
  assessmentTitle,
  amountDue,
  dueDate,
  portalUrl,
}: AssessmentDueReminderEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ??
        `Reminder: ${assessmentTitle} of ${amountDue} is due ${dueDate}`
      }
      accentColor={emailColors.accentWarning}
    >
      <Heading as="h1" style={styles.heading}>
        Assessment due reminder
      </Heading>

      <Text style={styles.body}>Hi {recipientName},</Text>
      <Text style={styles.body}>
        This is a friendly reminder that your assessment{' '}
        <strong>{assessmentTitle}</strong> of <strong>{amountDue}</strong> for{' '}
        <strong>{branding.communityName}</strong> is due on{' '}
        <strong>{dueDate}</strong>.
      </Text>

      <EmailAlert variant="warning">
        Please make your payment before the due date to avoid any late fees.
      </EmailAlert>

      <EmailButton href={portalUrl} variant="warning">
        Pay now
      </EmailButton>

      <Text style={styles.smallSpaced}>
        If you have already made this payment, please disregard this reminder.
        For questions about your assessment, please contact your association.
      </Text>
    </EmailLayout>
  );
}
