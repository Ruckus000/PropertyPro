'use client';

/**
 * The portfolio's other pages, linked from the Communities toolbar. The
 * portfolio pages have no rail or tab row (see AppShell), so this is where
 * Reports and Templates live: two plain links from `md` up, one "More" menu
 * on a phone.
 *
 * Templates is a plan feature (`hasSitePortfolioTemplates`); the page passes
 * `showTemplates` from the server check, so nobody is sent to an upgrade wall.
 */
import Link from 'next/link';
import { BarChart3, LayoutTemplate, MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface PortfolioToolsProps {
  showTemplates: boolean;
}

export function PortfolioTools({ showTemplates }: PortfolioToolsProps) {
  const links = [
    { href: '/pm/reports', label: 'Reports', icon: BarChart3 },
    ...(showTemplates ? [{ href: '/pm/portfolio/templates', label: 'Templates', icon: LayoutTemplate }] : []),
  ];

  return (
    <>
      <nav aria-label="Portfolio tools" className="hidden items-center gap-1 md:flex">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-content-secondary transition-colors duration-quick hover:bg-surface-muted hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="More portfolio tools"
              className="inline-flex size-11 items-center justify-center rounded-md border border-edge bg-surface-card text-content transition-colors duration-quick hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <MoreHorizontal className="size-5" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {links.map(({ href, label, icon: Icon }) => (
              <DropdownMenuItem key={href} asChild>
                <Link href={href} className="min-h-11">
                  <Icon className="mr-2 size-4 text-content-tertiary" aria-hidden="true" />
                  {label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
