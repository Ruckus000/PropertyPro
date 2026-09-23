import { Img } from '@react-email/components';
import type { ReactNode } from 'react';
import { emailIconUrl, type EmailIcon } from './email-assets';
import { toneColors, type EmailTone } from './theme';

type AlertVariant = 'danger' | 'warning' | 'success' | 'info';

interface EmailAlertProps {
  variant: AlertVariant;
  title?: ReactNode;
  children: ReactNode;
  /** Suppress the 28px glyph (e.g. when the email's category mark already says it). */
  hideIcon?: boolean;
}

const VARIANTS: Record<AlertVariant, { tone: EmailTone; icon: EmailIcon; alt: string }> = {
  danger: { tone: 'red', icon: 'alert-red', alt: 'Critical' },
  warning: { tone: 'amber', icon: 'warn-amber', alt: 'Warning' },
  success: { tone: 'green', icon: 'check-green', alt: 'Done' },
  info: { tone: 'teal', icon: 'shield-teal', alt: 'Note' },
};

/**
 * Left-rule alert panel: a 3px rule, a 28px glyph, a title and a body. Colour
 * is never the only signal — the glyph's alt text and the title carry it too.
 */
export function EmailAlert({ variant, title, children, hideIcon = false }: EmailAlertProps) {
  const { tone, icon, alt } = VARIANTS[variant];
  const colours = toneColors(tone);

  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      style={{
        backgroundColor: colours.bg,
        borderLeft: `3px solid ${colours.rule}`,
        borderRadius: '0 8px 8px 0',
        margin: '0 0 28px 0',
      }}
    >
      <tbody>
        <tr>
          {!hideIcon && (
            <td style={{ padding: '19px 16px 19px 20px', verticalAlign: 'top', width: '28px' }}>
              <Img src={emailIconUrl(icon)} width={28} height={28} alt={alt} style={{ display: 'block', width: '28px', height: '28px' }} />
            </td>
          )}
          <td style={{ padding: hideIcon ? '17px 20px' : '19px 20px 19px 0', verticalAlign: 'top' }}>
            {title && (
              <div style={{ fontSize: '14px', fontWeight: 600, color: colours.ink, margin: '0 0 3px 0', lineHeight: 1.45 }}>{title}</div>
            )}
            <div style={{ fontSize: '13px', color: colours.ink, lineHeight: 1.6 }}>{children}</div>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
