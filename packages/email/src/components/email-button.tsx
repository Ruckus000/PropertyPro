import { Button } from '@react-email/components';
import type { ReactNode } from 'react';
import { emailTheme as c, toneFill, type EmailTone } from './theme';

/**
 * The single filled action in an email. Legacy variant names are kept for
 * existing callers; each maps onto a Florida Modern tone.
 */
export type ButtonVariant =
  | 'default'
  | 'destructive'
  | 'warning'
  | 'success'
  | 'violet'
  | 'teal'
  | 'neutral'
  | 'secondary';

interface EmailButtonProps {
  href: string;
  variant?: ButtonVariant;
  children: ReactNode;
}

const VARIANT_TONE: Record<Exclude<ButtonVariant, 'secondary'>, EmailTone> = {
  default: 'coral',
  destructive: 'red',
  warning: 'amber',
  success: 'green',
  violet: 'violet',
  teal: 'teal',
  neutral: 'neutral',
};

export function buttonVariantForTone(tone: EmailTone): ButtonVariant {
  const entry = Object.entries(VARIANT_TONE).find(([, value]) => value === tone);
  return (entry?.[0] as ButtonVariant | undefined) ?? 'default';
}

export function EmailButton({ href, variant = 'default', children }: EmailButtonProps) {
  const secondary = variant === 'secondary';
  return (
    <Button
      href={href}
      className="fm-btn"
      style={{
        display: 'inline-block',
        backgroundColor: secondary ? c.card : toneFill(VARIANT_TONE[variant]),
        color: secondary ? c.ink : c.onFill,
        border: secondary ? `1px solid ${c.border}` : undefined,
        padding: secondary ? '12px 25px' : '13px 26px',
        borderRadius: '9px',
        fontSize: '15px',
        fontWeight: 600,
        lineHeight: '20px',
        textDecoration: 'none',
        letterSpacing: '-0.1px',
      }}
    >
      {children}
    </Button>
  );
}
