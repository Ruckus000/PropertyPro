import { Heading, Text } from '@react-email/components';
import { EmailLayout } from '../components/email-layout';
import { EmailButton } from '../components/email-button';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

export interface WelcomeEmailProps extends BaseEmailProps {
  primaryContactName: string;
  communityName: string;
  loginUrl: string;
}

export function WelcomeEmail({
  branding,
  previewText,
  primaryContactName,
  communityName,
  loginUrl,
}: WelcomeEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ?? `Welcome to PropertyPro — your ${communityName} portal is ready`
      }
    >
      <Heading as="h1" style={styles.heading}>
        Welcome to your community portal
      </Heading>
      <Text style={styles.body}>Hi {primaryContactName},</Text>
      <Text style={styles.body}>
        Your community portal for <strong>{communityName}</strong> has been set
        up and is ready to use. You can now log in to manage documents, meetings,
        announcements, and compliance requirements.
      </Text>
      <div style={styles.buttonSection}>
        <EmailButton href={loginUrl}>Log in to your portal</EmailButton>
      </div>
      <Text style={styles.smallSpaced}>
        If you have questions, reply to this email or contact PropertyPro support.
      </Text>
    </EmailLayout>
  );
}
