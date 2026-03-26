import { Heading, Section, Text } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import { EmailButton } from '../components/email-button';
import { EmailAlert } from '../components/email-alert';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

export interface EsignReminderEmailProps extends BaseEmailProps {
  signerName: string;
  documentName: string;
  signingUrl: string;
  reminderNumber: number;
  expiresAt?: string;
}

function formatOrdinal(n: number): string {
  const suffixes: Record<string, string> = {
    one: 'st',
    two: 'nd',
    few: 'rd',
    other: 'th',
  };
  const pr = new Intl.PluralRules('en-US', { type: 'ordinal' });
  const rule = pr.select(n);
  return `${n}${suffixes[rule] ?? 'th'}`;
}

export function EsignReminderEmail({
  branding,
  previewText,
  signerName,
  documentName,
  signingUrl,
  reminderNumber,
  expiresAt,
}: EsignReminderEmailProps) {
  const ordinal = formatOrdinal(reminderNumber);

  return (
    <EmailLayout
      branding={branding}
      accentColor={emailColors.accentWarning}
      previewText={
        previewText ??
        `Reminder: Your signature is needed on "${documentName}"`
      }
    >
      <Heading as="h1" style={styles.heading}>
        Signature reminder
      </Heading>

      <Text style={styles.body}>Hi {signerName},</Text>
      <Text style={styles.body}>
        Reminder #{reminderNumber} — a document from{' '}
        <strong>{branding.communityName}</strong> is awaiting your signature.
      </Text>

      <EmailAlert variant="warning" title={documentName}>
        {expiresAt
          ? `This signing request expires on ${expiresAt}. Please sign before the deadline to avoid delays.`
          : 'Please review and sign the document at your earliest convenience.'}
      </EmailAlert>

      <Section style={styles.buttonSection}>
        <EmailButton href={signingUrl} variant="warning">
          Sign now
        </EmailButton>
      </Section>

      <Text style={styles.smallSpaced}>
        If you have already signed this document, please disregard this reminder.
      </Text>
    </EmailLayout>
  );
}

export default EsignReminderEmail;
