import { Heading, Text } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import { EmailButton } from '../components/email-button';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

export interface AccountRecoveredEmailProps extends BaseEmailProps {
  recipientName: string;
  portalUrl?: string;
}

export function AccountRecoveredEmail({
  branding,
  previewText,
  recipientName,
  portalUrl,
}: AccountRecoveredEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ?? 'Your account has been restored — you can sign in again'
      }
      accentColor={emailColors.accentGreen}
    >
      <Heading as="h1" style={styles.heading}>
        Account restored
      </Heading>

      <Text style={styles.body}>Hi {recipientName},</Text>

      <Text style={styles.body}>
        Your account has been successfully restored and your deletion request
        has been canceled.
      </Text>

      <Text style={styles.body}>
        Your documents, settings, and access are fully restored. You can sign
        in again using your previous credentials.
      </Text>

      {portalUrl && (
        <EmailButton href={portalUrl} variant="default">
          Log in
        </EmailButton>
      )}

      <Text style={styles.smallSpaced}>
        If you did not request account recovery, please contact support
        immediately so we can secure your account.
      </Text>
    </EmailLayout>
  );
}
