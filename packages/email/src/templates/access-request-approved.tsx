import { Heading, Text } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import { EmailButton } from '../components/email-button';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

export interface AccessRequestApprovedEmailProps extends BaseEmailProps {
  recipientName: string;
  loginUrl: string;
}

export function AccessRequestApprovedEmail({
  branding,
  previewText,
  recipientName,
  loginUrl,
}: AccessRequestApprovedEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={previewText ?? 'Your access request has been approved'}
      accentColor={emailColors.accentGreen}
    >
      <Heading as="h1" style={styles.heading}>
        Access request approved
      </Heading>
      <Text style={styles.body}>Hi {recipientName},</Text>
      <Text style={styles.body}>
        Your request to join <strong>{branding.communityName}</strong> has been
        approved. You now have full access to the resident portal.
      </Text>

      <div style={styles.buttonSection}>
        <EmailButton href={loginUrl} variant="default">
          Log in
        </EmailButton>
      </div>

      <Text style={styles.smallSpaced}>
        If you have any questions, please contact your community manager.
      </Text>
    </EmailLayout>
  );
}
