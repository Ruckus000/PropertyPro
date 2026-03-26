import { Heading, Text } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import { EmailButton } from '../components/email-button';
import { EmailCard } from '../components/email-card';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

export interface AssessmentPaymentReceivedEmailProps extends BaseEmailProps {
  recipientName: string;
  amountPaid: string;
  assessmentTitle: string;
  dueDate: string;
  paymentDate: string;
  remainingBalance: string;
  portalUrl: string;
}

export function AssessmentPaymentReceivedEmail({
  branding,
  previewText,
  recipientName,
  amountPaid,
  assessmentTitle,
  dueDate,
  paymentDate,
  remainingBalance,
  portalUrl,
}: AssessmentPaymentReceivedEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={previewText ?? `Payment of ${amountPaid} received`}
      accentColor={emailColors.accentGreen}
    >
      <Heading as="h1" style={styles.heading}>
        Payment received
      </Heading>

      <Text style={styles.body}>Hi {recipientName},</Text>
      <Text style={styles.body}>
        Your payment of <strong>{amountPaid}</strong> for{' '}
        <strong>{assessmentTitle}</strong> (due {dueDate}) has been successfully
        processed on {paymentDate}.
      </Text>

      <EmailCard style={{ backgroundColor: emailColors.alertSuccessBg, border: `1px solid ${emailColors.alertSuccessBorder}` }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={styles.labelCell}>Assessment</td>
              <td style={styles.valueCell}>{assessmentTitle}</td>
            </tr>
            <tr>
              <td style={styles.labelCell}>Amount</td>
              <td style={styles.valueCell}>{amountPaid}</td>
            </tr>
            <tr>
              <td style={styles.labelCell}>Date</td>
              <td style={styles.valueCell}>{paymentDate}</td>
            </tr>
            <tr>
              <td style={styles.labelCell}>Balance</td>
              <td style={{ ...styles.valueCell, color: emailColors.alertSuccessText, fontWeight: 600 }}>
                {remainingBalance}
              </td>
            </tr>
          </tbody>
        </table>
      </EmailCard>

      <EmailButton href={portalUrl} variant="default">
        View payment history
      </EmailButton>

      <Text style={styles.smallSpaced}>
        This is a confirmation of your payment. No further action is required.
        If you have questions, please contact your association.
      </Text>
    </EmailLayout>
  );
}
