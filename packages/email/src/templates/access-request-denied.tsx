import { Heading, Text } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import { EmailCard } from '../components/email-card';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

export interface AccessRequestDeniedEmailProps extends BaseEmailProps {
  recipientName: string;
  reason?: string;
}

export function AccessRequestDeniedEmail({
  branding,
  previewText,
  recipientName,
  reason,
}: AccessRequestDeniedEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={previewText ?? 'Update on your access request'}
      accentColor={emailColors.accentBorder}
    >
      <Heading as="h1" style={styles.heading}>
        Access request update
      </Heading>
      <Text style={styles.body}>Hi {recipientName},</Text>
      <Text style={styles.body}>
        Your request to join <strong>{branding.communityName}</strong> was not
        approved at this time.
      </Text>

      {reason && (
        <EmailCard>
          <Text style={{ ...styles.body, margin: 0 }}>
            <strong>Reason:</strong> {reason}
          </Text>
        </EmailCard>
      )}

      <Text style={styles.body}>
        If you believe this is an error or have questions, please contact your
        community administrator directly.
      </Text>

      <Text style={styles.small}>
        This is an automated message. Please do not reply to this email.
      </Text>
    </EmailLayout>
  );
}
