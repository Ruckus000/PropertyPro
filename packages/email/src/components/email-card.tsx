import type { ReactNode } from 'react';
import { emailTheme as c } from './theme';

interface EmailCardProps {
  children: ReactNode;
  style?: React.CSSProperties;
}

/** A quiet bordered panel on the masthead tint — for quoted text and free-form detail. */
export function EmailCard({ children, style }: EmailCardProps) {
  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      style={{
        backgroundColor: c.masthead,
        border: `1px solid ${c.border}`,
        borderRadius: '10px',
        margin: '0 0 28px 0',
        ...style,
      }}
    >
      <tbody>
        <tr>
          <td style={{ padding: '18px 20px' }}>{children}</td>
        </tr>
      </tbody>
    </table>
  );
}
