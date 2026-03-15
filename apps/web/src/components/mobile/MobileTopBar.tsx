'use client';

import { usePathname } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { toInitials } from '@propertypro/shared';

interface MobileTopBarProps {
  communityName: string;
  userName: string | null;
  communityId: number;
}

const PAGE_TITLES: Record<string, string> = {
  '/mobile': 'Home',
  '/mobile/documents': 'Documents',
  '/mobile/meetings': 'Meetings',
  '/mobile/announcements': 'Announcements',
  '/mobile/maintenance': 'Maintenance',
  '/mobile/more': 'More',
};

function resolveTitle(pathname: string): string {
  for (const [prefix, title] of Object.entries(PAGE_TITLES)) {
    if (prefix === '/mobile' ? pathname === '/mobile' || pathname === '/mobile/' : pathname.startsWith(prefix)) {
      return title;
    }
  }
  return 'Home';
}

export function MobileTopBar({ communityName, userName, communityId }: MobileTopBarProps) {
  const pathname = usePathname();
  const title = resolveTitle(pathname);
  const initials = toInitials(userName);
  const isHome = pathname === '/mobile' || pathname === '/mobile/';

  return (
    <header className="mobile-top-bar">
      <div className="mobile-top-bar-inner">
        {/* Left: community icon + context */}
        <div className="mobile-top-bar-left">
          <div className="mobile-top-bar-icon">
            <Building2 size={16} strokeWidth={2} aria-hidden="true" />
          </div>
          <div className="mobile-top-bar-context">
            <span className="mobile-top-bar-community">{communityName}</span>
            {!isHome && <span className="mobile-top-bar-title">{title}</span>}
          </div>
        </div>

        {/* Right: user avatar */}
        <a
          href={`/mobile/more?communityId=${communityId}`}
          className="mobile-top-bar-avatar"
          aria-label="Account menu"
        >
          {initials}
        </a>
      </div>
    </header>
  );
}
