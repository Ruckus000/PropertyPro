import { emailColors, primitiveColors } from '@propertypro/tokens/email';

interface EmailCardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function EmailCard({ children, style }: EmailCardProps) {
  return (
    <table
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      style={{
        backgroundColor: primitiveColors.zinc[50],
        border: `1px solid ${emailColors.border}`,
        borderRadius: '6px',
        margin: '0 0 20px 0',
        ...style,
      }}
    >
      <tbody>
        <tr>
          <td style={{ padding: '14px 16px' }}>{children}</td>
        </tr>
      </tbody>
    </table>
  );
}
