import { Heading, Text } from '@react-email/components';
import { EmailLayout } from '../components/email-layout';
import { EmailButton } from '../components/email-button';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

export interface PasswordResetEmailProps extends BaseEmailProps {
  userName: string;
  resetUrl: string;
  expiresInMinutes?: number;
}

export function PasswordResetEmail({
  branding,
  previewText,
  userName,
  resetUrl,
  expiresInMinutes = 60,
}: PasswordResetEmailProps) {
  const expirationText = `${expiresInMinutes} minute${expiresInMinutes !== 1 ? 's' : ''}`;

  return (
    <EmailLayout
      branding={branding}
      previewText={previewText ?? 'Reset your password'}
    >
      <Heading as="h1" style={styles.heading}>
        Reset your password
      </Heading>
      <Text style={styles.body}>Hi {userName},</Text>
      <Text style={styles.body}>
        We received a request to reset the password for your{' '}
        <strong>{branding.communityName}</strong> account. Click the button
        below to choose a new password.
      </Text>
      <div style={styles.buttonSection}>
        <EmailButton href={resetUrl}>Reset password</EmailButton>
      </div>
      <Text style={styles.smallSpaced}>
        This link expires in {expirationText}. If you did not request a
        password reset, you can safely ignore this email. Your password will
        not be changed.
      </Text>
    </EmailLayout>
  );
}
