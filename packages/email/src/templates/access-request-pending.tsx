import { Heading, Text } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import { EmailButton } from '../components/email-button';
import { EmailCard } from '../components/email-card';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

export interface AccessRequestPendingEmailProps extends BaseEmailProps {
  adminName: string;
  requesterName: string;
  requesterEmail: string;
  claimedUnit?: string;
  role?: string;
  dashboardUrl: string;
}

export function AccessRequestPendingEmail({
  branding,
  previewText,
  adminName,
  requesterName,
  requesterEmail,
  claimedUnit,
  role,
  dashboardUrl,
}: AccessRequestPendingEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={previewText ?? 'New resident access request'}
    >
      <Heading as="h1" style={styles.heading}>
        New access request
      </Heading>
      <Text style={styles.body}>Hi {adminName},</Text>
      <Text style={styles.body}>
        A resident has requested portal access and is waiting for your review.
      </Text>

      <EmailCard>
        <table cellPadding={0} cellSpacing={0} style={{ width: '100%' }}>
          <tbody>
            <tr>
              <td style={styles.labelCell}>Name</td>
              <td style={styles.valueCell}>{requesterName}</td>
            </tr>
            <tr>
              <td style={styles.labelCell}>Email</td>
              <td style={styles.valueCell}>{requesterEmail}</td>
            </tr>
            {claimedUnit && (
              <tr>
                <td style={styles.labelCell}>Unit</td>
                <td style={styles.valueCell}>{claimedUnit}</td>
              </tr>
            )}
            {role && (
              <tr>
                <td style={styles.labelCell}>Role</td>
                <td style={styles.valueCell}>{role}</td>
              </tr>
            )}
          </tbody>
        </table>
      </EmailCard>

      <div style={styles.buttonSection}>
        <EmailButton href={dashboardUrl} variant="default">
          Review request
        </EmailButton>
      </div>

      <Text style={styles.smallSpaced}>
        This notification was sent to you as an administrator of{' '}
        {branding.communityName}. Only admins receive access request alerts.
      </Text>
    </EmailLayout>
  );
}
