import { Heading, Text } from '@react-email/components';
import { EmailLayout } from '../components/email-layout';
import { EmailButton } from '../components/email-button';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

export interface SignupVerificationEmailProps extends BaseEmailProps {
  primaryContactName: string;
  communityName: string;
  verificationLink: string;
}

export function SignupVerificationEmail({
  branding,
  previewText,
  primaryContactName,
  communityName,
  verificationLink,
}: SignupVerificationEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ?? 'Verify your email to continue your PropertyPro signup'
      }
    >
      <Heading as="h1" style={styles.heading}>
        Verify your email address
      </Heading>
      <Text style={styles.body}>Hi {primaryContactName},</Text>
      <Text style={styles.body}>
        Thanks for starting signup for{' '}
        <strong>{communityName}</strong>. Confirm your email address to finish
        setting up your account.
      </Text>
      <div style={styles.buttonSection}>
        <EmailButton href={verificationLink}>Verify email</EmailButton>
      </div>
      <Text style={styles.smallSpaced}>
        For security, checkout stays locked until verification is complete. This
        link expires in 24 hours.
      </Text>
    </EmailLayout>
  );
}
