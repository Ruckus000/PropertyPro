'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';

interface BoardChromeProps {
  communityId: number;
  communityName: string;
  electionsEnabled: boolean;
  children: React.ReactNode;
}

const BOARD_TABS = [
  {
    id: 'polls',
    label: 'Polls',
    href: (communityId: number) => `/communities/${communityId}/board/polls`,
  },
  {
    id: 'forum',
    label: 'Forum',
    href: (communityId: number) => `/communities/${communityId}/board/forum`,
  },
  {
    id: 'elections',
    label: 'Elections',
    href: (communityId: number) => `/communities/${communityId}/board/elections`,
  },
] as const;

export function isBoardTabActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BoardChrome({
  communityId,
  communityName,
  electionsEnabled,
  children,
}: BoardChromeProps) {
  const pathname = usePathname();
  const tabs = BOARD_TABS.filter((tab) => tab.id !== 'elections' || electionsEnabled);
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-content-tertiary">
          {communityName}
        </p>
        <PageHeader title="Community Board" />
        {/* Not a lede: while elections are gated behind attorney review, the
            page says so. With elections live there is nothing to explain. */}
        {!electionsEnabled && (
          <p className="max-w-2xl text-sm text-content-secondary">
            Polls and forum discussions live here. Elections appear after attorney review is complete.
          </p>
        )}
      </header>

      <nav
        className="flex flex-wrap items-center gap-2 border-b border-edge pb-3"
        aria-label="Board sections"
      >
        {tabs.map((tab) => {
          const href = tab.href(communityId);
          const active = isBoardTabActive(pathname, href);

          return (
            <Link
              key={tab.id}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium transition-colors duration-quick',
                active
                  ? 'bg-interactive text-content-inverse shadow-sm'
                  : 'bg-surface-muted text-content-secondary hover:bg-surface-hover hover:text-content',
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-6">{children}</div>
    </div>
  );
}
