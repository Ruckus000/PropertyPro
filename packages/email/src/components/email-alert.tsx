import { Text } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';

type AlertVariant = 'danger' | 'warning' | 'success' | 'info';

interface EmailAlertProps {
  variant: AlertVariant;
  title?: string;
  children: React.ReactNode;
}

const variantStyles: Record<AlertVariant, { bg: string; border: string; text: string }> = {
  danger: {
    bg: emailColors.alertDangerBg,
    border: emailColors.alertDangerBorder,
    text: emailColors.alertDangerText,
  },
  warning: {
    bg: emailColors.alertWarningBg,
    border: emailColors.alertWarningBorder,
    text: emailColors.alertWarningText,
  },
  success: {
    bg: emailColors.alertSuccessBg,
    border: emailColors.alertSuccessBorder,
    text: emailColors.alertSuccessText,
  },
  info: {
    bg: emailColors.alertInfoBg,
    border: emailColors.alertInfoBorder,
    text: emailColors.alertInfoText,
  },
};

export function EmailAlert({ variant, title, children }: EmailAlertProps) {
  const colors = variantStyles[variant];

  return (
    <table
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      style={{
        backgroundColor: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: '6px',
        margin: '0 0 20px 0',
      }}
    >
      <tbody>
        <tr>
          <td style={{ padding: '14px 16px' }}>
            {title && (
              <Text style={{ fontSize: '14px', fontWeight: 600, color: emailColors.foreground, margin: '0 0 6px 0' }}>
                {title}
              </Text>
            )}
            <Text style={{ fontSize: '14px', color: colors.text, lineHeight: '1.6', margin: '0' }}>
              {children}
            </Text>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
