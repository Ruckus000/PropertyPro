import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

interface AdminPageHeaderProps {
  title: string;
  description?: string;
  /** Badges / meta line under the title. */
  eyebrow?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
}

/**
 * Admin paints its page title: unlike apps/web (whose PageHeader renders an
 * sr-only h1 because that app has a breadcrumb trail naming the page), the
 * admin console has no breadcrumb trail, so the Fraunces h1 here is how a
 * screen names itself. Do not reuse or mimic web's PageHeader — the two apps
 * made opposite decisions on purpose.
 */
export function AdminPageHeader({
  title,
  description,
  eyebrow,
  actions,
  backHref,
  backLabel,
}: AdminPageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {backHref && (
          <Link
            href={backHref}
            className="mb-1 inline-flex items-center gap-1 text-sm text-content-tertiary hover:text-content"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            {backLabel ?? 'Back'}
          </Link>
        )}
        <h1 className="font-display text-2xl font-medium tracking-tight md:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-content-secondary">{description}</p>}
        {eyebrow && <div className="mt-2 flex flex-wrap items-center gap-2">{eyebrow}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
