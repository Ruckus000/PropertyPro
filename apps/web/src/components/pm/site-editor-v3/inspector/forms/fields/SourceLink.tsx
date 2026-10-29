'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A link from a section's panel to the place its content comes from.
 *
 * Same tab, on purpose: the form saves what is in it when it closes, so leaving
 * the editor loses nothing, and a second tab is one more thing for a board
 * volunteer to lose track of.
 */
export function SourceLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-sm font-medium text-interactive underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
        className,
      )}
    >
      {children}
    </Link>
  );
}
