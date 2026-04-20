import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';

export interface ArticleBreadcrumbsProps {
  communityId: number;
  category: string;
  currentTitle: string;
}

/**
 * Breadcrumb trail for a help article.
 *
 * Rendered inside PageHeader's breadcrumb slot, which already wraps this in
 * a <nav aria-label="Breadcrumb">. We intentionally use <ol> here rather than
 * a second <nav> to avoid a nested landmark duplicate for screen readers.
 */
export function ArticleBreadcrumbs({
  communityId,
  category,
  currentTitle,
}: ArticleBreadcrumbsProps) {
  const categoryHref = `/help/${category}?communityId=${communityId}`;
  const categoryLabel = category.replace(/-/g, ' ');
  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs text-content-tertiary">
      <li className="inline-flex items-center">
        <Link
          href={`/help?communityId=${communityId}`}
          className="inline-flex items-center gap-1 hover:text-content"
        >
          <Home className="h-3 w-3" aria-hidden="true" />
          Help Center
        </Link>
      </li>
      <li className="inline-flex items-center" aria-hidden="true">
        <ChevronRight className="h-3 w-3" />
      </li>
      <li className="inline-flex items-center">
        <Link href={categoryHref} className="capitalize hover:text-content">
          {categoryLabel}
        </Link>
      </li>
      <li className="inline-flex items-center" aria-hidden="true">
        <ChevronRight className="h-3 w-3" />
      </li>
      <li className="inline-flex items-center">
        <span className="font-medium text-content-secondary" aria-current="page">
          {currentTitle}
        </span>
      </li>
    </ol>
  );
}
