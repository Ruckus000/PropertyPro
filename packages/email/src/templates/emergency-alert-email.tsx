import { Heading, Text } from '@react-email/components';
import { EmailLayout } from '../components/email-layout';
import type { BaseEmailProps } from '../types';

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
    bgColor: '#dc2626',
    textColor: '#ffffff',
    borderColor: '#b91c1c',
  },
  urgent: {
    label: 'URGENT',
    bgColor: '#ea580c',
    textColor: '#ffffff',
    borderColor: '#c2410c',
  },
  info: {
    label: 'NOTICE',
    bgColor: '#2563eb',
    textColor: '#ffffff',
    borderColor: '#1d4ed8',
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
  color: '#ffffff',
  fontSize: '18px',
  fontWeight: 'bold',
  letterSpacing: '2px',
  margin: '0',
};

const headingStyle: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: 'bold',
  color: '#111827',
  margin: '0 0 16px 0',
};

const textStyle: React.CSSProperties = {
  fontSize: '16px',
  color: '#374151',
  lineHeight: '24px',
  margin: '0 0 16px 0',
};

function alertBoxStyle(borderColor: string): React.CSSProperties {
  return {
    backgroundColor: '#fef2f2',
    padding: '16px',
    margin: '16px 0',
    borderRadius: '8px',
    borderLeft: `4px solid ${borderColor}`,
  };
}

const alertBodyStyle: React.CSSProperties = {
  fontSize: '15px',
  color: '#1f2937',
  lineHeight: '24px',
  margin: '0 0 4px 0',
};

const timestampStyle: React.CSSProperties = {
  fontSize: '13px',
  color: '#6b7280',
  margin: '8px 0 24px 0',
};

const dividerStyle: React.CSSProperties = {
  borderTop: '1px solid #e5e7eb',
  margin: '24px 0',
};

const footerStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#9ca3af',
  lineHeight: '18px',
  margin: '0',
};
