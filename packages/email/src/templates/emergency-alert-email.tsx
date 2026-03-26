import { Heading, Text } from '@react-email/components';
import { EmailLayout } from '../components/email-layout';
import type { BaseEmailProps } from '../types';
import { emailColors, primitiveColors } from '@propertypro/tokens/email';

export type EmergencyAlertSeverity = 'emergency' | 'urgent' | 'info';

export interface EmergencyAlertEmailProps extends BaseEmailProps {
  recipientName: string;
  alertTitle: string;
  alertBody: string;
  severity: EmergencyAlertSeverity;
  sentAt: string;
}

const SEVERITY_CONFIG: Record<
  EmergencyAlertSeverity,
  { label: string; bgColor: string; textColor: string; borderColor: string }
> = {
  emergency: {
    label: 'EMERGENCY',
    bgColor: primitiveColors.red[600],
    textColor: emailColors.textInverse,
    borderColor: emailColors.dangerForeground,
  },
  urgent: {
    label: 'URGENT',
    bgColor: primitiveColors.orange[600],
    textColor: emailColors.textInverse,
    borderColor: primitiveColors.orange[700],
  },
  info: {
    label: 'NOTICE',
    bgColor: emailColors.interactivePrimary,
    textColor: emailColors.textInverse,
    borderColor: emailColors.interactivePrimaryHover,
  },
};

export function EmergencyAlertEmail({
  branding,
  previewText,
  recipientName,
  alertTitle,
  alertBody,
  severity,
  sentAt,
}: EmergencyAlertEmailProps) {
  const config = SEVERITY_CONFIG[severity];

  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ?? `${config.label}: ${alertTitle} — ${branding.communityName}`
      }
    >
      {/* Severity banner */}
      <div style={bannerStyle(config.bgColor, config.borderColor)}>
        <Text style={bannerTextStyle}>{config.label}</Text>
      </div>

      <Heading as="h1" style={headingStyle}>
        {alertTitle}
      </Heading>

      <Text style={textStyle}>Hi {recipientName},</Text>

      <Text style={textStyle}>
        This is an emergency notification from{' '}
        <strong>{branding.communityName}</strong>.
      </Text>

      <div style={alertBoxStyle(config.borderColor)}>
        {alertBody.split('\n').map((line, i) => (
          <Text key={i} style={alertBodyStyle}>
            {line || '\u00A0'}
          </Text>
        ))}
      </div>

      <Text style={timestampStyle}>
        Sent at {sentAt}
      </Text>

      <hr style={dividerStyle} />

      <Text style={footerStyle}>
        This is an emergency notification from {branding.communityName}. Emergency
        notifications cannot be unsubscribed from as they pertain to the safety and
        well-being of community residents.
      </Text>
    </EmailLayout>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

function bannerStyle(bg: string, border: string): React.CSSProperties {
  return {
    backgroundColor: bg,
    border: `2px solid ${border}`,
    borderRadius: '6px',
    padding: '12px 16px',
    textAlign: 'center' as const,
    margin: '0 0 20px 0',
  };
}

const bannerTextStyle: React.CSSProperties = {
  color: emailColors.textInverse,
  fontSize: '18px',
  fontWeight: 'bold',
  letterSpacing: '2px',
  margin: '0',
};

const headingStyle: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: 'bold',
  color: emailColors.textPrimary,
  margin: '0 0 16px 0',
};

const textStyle: React.CSSProperties = {
  fontSize: '16px',
  color: emailColors.textSecondary,
  lineHeight: '24px',
  margin: '0 0 16px 0',
};

function alertBoxStyle(borderColor: string): React.CSSProperties {
  return {
    backgroundColor: emailColors.dangerBackground,
    padding: '16px',
    margin: '16px 0',
    borderRadius: '8px',
    borderLeft: `4px solid ${borderColor}`,
  };
}

const alertBodyStyle: React.CSSProperties = {
  fontSize: '15px',
  color: primitiveColors.gray[800],
  lineHeight: '24px',
  margin: '0 0 4px 0',
};

const timestampStyle: React.CSSProperties = {
  fontSize: '13px',
  color: emailColors.textDisabled,
  margin: '8px 0 24px 0',
};

const dividerStyle: React.CSSProperties = {
  borderTop: `1px solid ${emailColors.borderDefault}`,
  margin: '24px 0',
};

const footerStyle: React.CSSProperties = {
  fontSize: '12px',
  color: emailColors.textDisabled,
  lineHeight: '18px',
  margin: '0',
};
