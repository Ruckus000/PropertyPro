import { Fragment } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbLink {
  label: string;
  href: string;
}

export interface BreadcrumbsProps {
  /** Linked parent crumbs, in order from root to immediate parent. */
  items?: BreadcrumbLink[];
  /** Current page label. Unlinked, marked with aria-current="page". */
  currentLabel: string;
  className?: string;
}

/**
 * Breadcrumb trail for the PageHeader breadcrumb slot.
 *
 * Renders <ol> only — PageHeader wraps this in <nav aria-label="Breadcrumb">,
 * so a nested <nav> would create a duplicate landmark for screen readers.
 */
export function Breadcrumbs({ items = [], currentLabel, className }: BreadcrumbsProps) {
  return (
    <ol className={cn('flex flex-wrap items-center gap-1.5 text-sm', className)}>
      {items.map((item) => (
        <Fragment key={item.href}>
          <li>
            <Link
              href={item.href}
              className="text-content-secondary hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-sm"
            >
              {item.label}
            </Link>
          </li>
          <li aria-hidden="true" className="text-content-tertiary">
            <ChevronRight size={14} />
          </li>
        </Fragment>
      ))}
      <li className="min-w-0">
        <span
          aria-current="page"
          className="font-medium text-content-secondary truncate block max-w-full sm:max-w-[40ch]"
        >
          {currentLabel}
        </span>
      </li>
    </ol>
  );
}
