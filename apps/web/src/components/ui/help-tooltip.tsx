'use client';

/**
 * <HelpTooltip articleSlug? articleCategory? content> — small "?" icon button
 * that opens a tooltip with inline guidance and an optional "Read full guide"
 * link to the help article. Built on the Radix tooltip wrapper at
 * apps/web/src/components/ui/tooltip.tsx.
 *
 * Designed for compliance-flow forms where the field name alone isn't enough
 * (quorum, secret-ballot, SIRS dates, ARC denial reasons, 14-day notices).
 * The link target is the canonical /help/<category>/<slug> route; if no slug
 * is provided, the tooltip is informational only.
 */

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, HelpCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface HelpTooltipProps {
  /** Inline guidance shown inside the tooltip. */
  content: ReactNode;
  /** Optional: link the tooltip to a help article. Use the article's slug. */
  articleSlug?: string;
  /** Required when articleSlug is set. The article's category. */
  articleCategory?: string;
  /** Optional community id for the article link query string. */
  communityId?: number;
  /** Visually-hidden label for the trigger button. Defaults to "Help". */
  label?: string;
  /** Override classes on the trigger. */
  className?: string;
}

export function HelpTooltip({
  content,
  articleSlug,
  articleCategory,
  communityId,
  label = 'Help',
  className,
}: HelpTooltipProps) {
  const articleHref =
    articleSlug && articleCategory
      ? `/help/${articleCategory}/${articleSlug}${communityId ? `?communityId=${communityId}` : ''}`
      : null;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className={cn(
              'inline-flex size-5 items-center justify-center rounded-full text-content-tertiary transition-colors hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
              className,
            )}
          >
            <HelpCircle size={14} aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          className="max-w-xs whitespace-normal text-left"
          side="top"
        >
          <p className="text-xs leading-5">{content}</p>
          {articleHref && (
            <Link
              href={articleHref}
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2"
            >
              Read full guide
              <ArrowUpRight size={11} aria-hidden="true" />
            </Link>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
