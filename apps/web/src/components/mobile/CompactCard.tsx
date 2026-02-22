/**
 * P3-49: Touch-friendly compact card for mobile list pages.
 *
 * Minimum height 44px (WCAG / Apple HIG touch target requirement).
 * Renders as an <a> when href is provided, otherwise a <div>.
 */
import Link from 'next/link';

interface CompactCardProps {
  title: string;
  subtitle?: string;
  meta?: string;
  href?: string;
}

export function CompactCard({ title, subtitle, meta, href }: CompactCardProps) {
  const inner = (
    <>
      <span className="mobile-card-title">{title}</span>
      {subtitle && <span className="mobile-card-subtitle">{subtitle}</span>}
      {meta && <span className="mobile-card-meta">{meta}</span>}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="mobile-card">
        {inner}
      </Link>
    );
  }

  return <div className="mobile-card">{inner}</div>;
}
