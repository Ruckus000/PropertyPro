import { Heading, Text } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import { EmailButton } from '../components/email-button';
import { EmailCard } from '../components/email-card';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

export interface AccountDeletionInitiatedEmailProps extends BaseEmailProps {
  recipientName: string;
  coolingEndDate: string;
  purgeDate: string;
  cancelUrl: string;
}

export function AccountDeletionInitiatedEmail({
  branding,
  previewText,
  recipientName,
  coolingEndDate,
  purgeDate,
  cancelUrl,
}: AccountDeletionInitiatedEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ??
        'Account deletion has been initiated — you can cancel within 30 days'
      }
      accentColor={emailColors.accentNeutral}
    >
      <Heading as="h1" style={styles.heading}>
        Account deletion initiated
      </Heading>

      <Text style={styles.body}>Hi {recipientName},</Text>

      <Text style={styles.body}>
        We have received a request to delete your account. Here is what happens
        next:
      </Text>

      <EmailCard>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td style={{ padding: '14px 16px', borderBottom: '1px solid #E4E4E7' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: emailColors.foreground, marginBottom: '4px' }}>
                  Days 1–7: Cooling off
                </div>
                <div style={{ fontSize: '13px', color: emailColors.mutedForeground }}>
                  Account stays active. Cancel anytime.
                </div>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '14px 16px', borderBottom: '1px solid #E4E4E7' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: emailColors.foreground, marginBottom: '4px' }}>
                  Days 8–30: Recovery window
                </div>
                <div style={{ fontSize: '13px', color: emailColors.mutedForeground }}>
                  Account deactivated, data preserved.
                </div>
              </td>
            </tr>
            <tr>
              <td style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: emailColors.foreground, marginBottom: '4px' }}>
                  After day 30: Permanent purge
                </div>
                <div style={{ fontSize: '13px', color: emailColors.mutedForeground }}>
                  All personal data permanently deleted.
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </EmailCard>

      <Text style={styles.body}>Changed your mind?</Text>

      <EmailButton href={cancelUrl} variant="destructive">
        Cancel deletion
      </EmailButton>

      <Text style={styles.smallSpaced}>
        If you did not request account deletion, please cancel immediately and
        contact support. This action was initiated from your account settings.
      </Text>
    </EmailLayout>
  );
}
