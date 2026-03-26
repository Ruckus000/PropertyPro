import { Button } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';

type ButtonVariant = 'default' | 'destructive' | 'warning' | 'success' | 'violet';

interface EmailButtonProps {
  href: string;
  variant?: ButtonVariant;
  children: React.ReactNode;
}

const variantColors: Record<ButtonVariant, string> = {
  default: emailColors.buttonDefault,
  destructive: emailColors.buttonDestructive,
  warning: emailColors.buttonWarning,
  success: emailColors.buttonSuccess,
  violet: emailColors.buttonViolet,
};

export function EmailButton({ href, variant = 'default', children }: EmailButtonProps) {
  return (
    <Button
      href={href}
      style={{
        display: 'inline-block',
        backgroundColor: variantColors[variant],
        color: emailColors.buttonDefaultText,
        padding: '10px 20px',
        borderRadius: '6px',
        fontSize: '14px',
        fontWeight: 600,
        textDecoration: 'none',
        letterSpacing: '-0.1px',
      }}
    >
      {children}
    </Button>
  );
}
