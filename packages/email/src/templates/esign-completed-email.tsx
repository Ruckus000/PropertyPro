import { Heading, Text } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import { EmailCard } from '../components/email-card';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

export interface EsignCompletedEmailProps extends BaseEmailProps {
  senderName: string;
  documentName: string;
  completedAt: string;
  signerCount: number;
}

export function EsignCompletedEmail({
  branding,
  previewText,
  senderName,
  documentName,
  completedAt,
  signerCount,
}: EsignCompletedEmailProps) {
  const signerLabel = signerCount === 1 ? '1 signer' : `${signerCount} signers`;

  return (
    <EmailLayout
      branding={branding}
      accentColor={emailColors.accentGreen}
      previewText={previewText ?? `All signatures collected for "${documentName}"`}
    >
      <Heading as="h1" style={styles.heading}>
        All signatures collected
      </Heading>

      <Text style={styles.body}>Hi {senderName},</Text>
      <Text style={styles.body}>
        All signatures have been collected for the document below.
      </Text>

      {/* Success-styled card with green bg/border */}
      <EmailCard
        style={{
          backgroundColor: emailColors.alertSuccessBg,
          border: `1px solid ${emailColors.alertSuccessBorder}`,
        }}
      >
        <Text
          style={{
            fontSize: '15px',
            fontWeight: 600,
            color: emailColors.foreground,
            margin: '0 0 10px 0',
          }}
        >
          {documentName}
        </Text>
        <table width="100%" cellPadding={0} cellSpacing={0}>
          <tbody>
            <tr>
              <td style={styles.labelCell}>Signers</td>
              <td style={styles.valueCell}>{signerLabel}</td>
            </tr>
            <tr>
              <td style={styles.labelCell}>Completed</td>
              <td style={styles.valueCell}>{completedAt}</td>
            </tr>
          </tbody>
        </table>
      </EmailCard>

      <Text style={styles.body}>
        The fully executed document is now available in your documents portal.
      </Text>

      <Text style={styles.small}>
        This document is stored in your document repository at{' '}
        {branding.communityName}.
      </Text>
    </EmailLayout>
  );
}

export default EsignCompletedEmail;
