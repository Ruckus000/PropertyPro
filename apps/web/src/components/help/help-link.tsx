import Link from 'next/link';
import { CircleHelp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HelpLinkProps {
  category: string;
  slug: string;
  label?: string;
  className?: string;
}

/**
 * Contextual help link — renders a small ? icon that links to a help article.
 *
 * Intentionally simple (no server-side slug validation).
 * If the article doesn't exist, the link 404s — a natural signal to update.
 */
export function HelpLink({ category, slug, label, className }: HelpLinkProps) {
  return (
    <Link
      href={`/help/${category}/${slug}`}
      className={cn(
        'inline-flex items-center gap-1 text-xs text-content-tertiary transition-colors hover:text-[var(--interactive-primary)]',
        className,
      )}
      title={label ?? 'Learn more'}
    >
      <CircleHelp size={14} aria-hidden="true" />
      {label && <span>{label}</span>}
    </Link>
  );
}
