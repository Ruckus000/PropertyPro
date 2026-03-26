import { Heading, Section, Text } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import { EmailButton } from '../components/email-button';
import { EmailAlert } from '../components/email-alert';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

export interface ComplianceAlertEmailProps extends BaseEmailProps {
  recipientName: string;
  alertTitle: string;
  alertDescription: string;
  dueDate?: string;
  dashboardUrl: string;
  severity: 'info' | 'warning' | 'critical';
}

const severityBadge: Record<
  'info' | 'warning' | 'critical',
  { bg: string; color: string; label: string }
> = {
  critical: { bg: emailColors.alertDangerBg, color: emailColors.alertDangerText, label: 'Critical' },
  warning: { bg: emailColors.alertWarningBg, color: emailColors.alertWarningText, label: 'Warning' },
  info: { bg: emailColors.alertInfoBg, color: emailColors.alertInfoText, label: 'Info' },
};

export function ComplianceAlertEmail({
  branding,
  previewText,
  recipientName,
  alertTitle,
  alertDescription,
  dueDate,
  dashboardUrl,
  severity,
}: ComplianceAlertEmailProps) {
  const badge = severityBadge[severity];

  return (
    <EmailLayout
      branding={branding}
      accentColor={emailColors.accentRed}
      previewText={previewText ?? `Compliance alert: ${alertTitle}`}
    >
      {/* Heading + badge side by side */}
      <table width="100%" cellPadding={0} cellSpacing={0} style={{ margin: '0 0 20px 0' }}>
        <tbody>
          <tr>
            <td style={{ verticalAlign: 'middle' }}>
              <Heading as="h1" style={{ ...styles.heading, margin: '0' }}>
                Compliance alert
              </Heading>
            </td>
            <td style={{ verticalAlign: 'middle', textAlign: 'right' as const, paddingLeft: '12px' }}>
              <span
                style={{
                  display: 'inline-block',
                  background: badge.bg,
                  color: badge.color,
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.3px',
                }}
              >
                {badge.label}
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <Text style={styles.body}>Hi {recipientName},</Text>
      <Text style={styles.body}>
        A compliance item requires your attention at{' '}
        <strong>{branding.communityName}</strong>.
      </Text>

      <EmailAlert variant="danger" title={`Missing: ${alertTitle}`}>
        {alertDescription}
        {dueDate && (
          <>
            {' '}Due by:{' '}
            <strong style={{ color: emailColors.alertDangerText }}>{dueDate}</strong>
          </>
        )}
      </EmailAlert>

      <Section style={styles.buttonSection}>
        <EmailButton href={dashboardUrl} variant="destructive">
          View compliance dashboard
        </EmailButton>
      </Section>

      <Text style={{ ...styles.smallSpaced, fontStyle: 'italic' }}>
        Florida Statute §718.111(12)(g) requires timely posting of association documents.
        Failure to comply may result in regulatory action.
      </Text>
    </EmailLayout>
  );
}
