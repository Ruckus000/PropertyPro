import { Heading, Text } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import { EmailCard } from '../components/email-card';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

export interface AccountDeletionExecutedEmailProps extends BaseEmailProps {
  recipientName: string;
  purgeDate: string;
}

export function AccountDeletionExecutedEmail({
  branding,
  previewText,
  recipientName,
  purgeDate,
}: AccountDeletionExecutedEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={previewText ?? 'Your account has been deleted'}
      accentColor={emailColors.accentNeutral}
    >
      <Heading as="h1" style={styles.heading}>
        Account deleted
      </Heading>

      <Text style={styles.body}>Hi {recipientName},</Text>

      <Text style={styles.body}>
        Your account has been deactivated as requested. You can no longer sign
        in with your previous credentials.
      </Text>

      <EmailCard>
        <div style={{ fontSize: '14px', fontWeight: 600, color: emailColors.foreground, marginBottom: '6px' }}>
          Recovery window: until {purgeDate}
        </div>
        <div style={{ fontSize: '13px', color: emailColors.mutedForeground }}>
          Your anonymised account record is retained until{' '}
          <strong>{purgeDate}</strong>. If you deleted your account by mistake,
          contact our support team before that date to request recovery.
        </div>
      </EmailCard>

      <Text style={styles.body}>
        To reach support, reply to this email or visit our help centre. Please
        have this email on hand as proof of your identity.
      </Text>

      <Text style={styles.small}>
        Thank you for using {branding.communityName}. We are sorry to see you
        go.
      </Text>
    </EmailLayout>
  );
}
