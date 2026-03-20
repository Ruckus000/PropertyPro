export const dynamic = 'force-dynamic';

/**
 * Mobile "More" page — overflow menu for sections not in the bottom tab bar.
 *
 * Shows links to: Maintenance, Settings, and Sign Out.
 */
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { Wrench, Settings, LogOut } from 'lucide-react';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';


interface MoreLink {
  label: string;
  href: string;
  icon: React.ElementType;
}

export default async function MobileMorePage() {
  const requestHeaders = await headers();
  const communityId = Number(requestHeaders.get('x-community-id'));

  if (!Number.isInteger(communityId) || communityId <= 0) {
    redirect('/auth/login');
  }

  let userId: string;
  try {
    userId = await requireAuthenticatedUserId();
  } catch {
    redirect('/auth/login');
  }

  try {
    await requireCommunityMembership(communityId, userId!);
  } catch {
    redirect('/auth/login');
  }

  const links: MoreLink[] = [
    { label: 'Maintenance', href: `/mobile/maintenance?communityId=${communityId}`, icon: Wrench },
    { label: 'Settings', href: `/settings?communityId=${communityId}`, icon: Settings },
  ];

  return (
    <div>
      <ul className="divide-y divide-edge-subtle dark:divide-edge">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <li key={link.label}>
              <Link
                href={link.href}
                className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-content active:bg-surface-hover dark:text-content dark:active:bg-surface-hover"
              >
                <Icon size={20} className="text-content-disabled dark:text-content-secondary" aria-hidden="true" />
                {link.label}
              </Link>
            </li>
          );
        })}
        <li>
          <Link
            href="/auth/login"
            className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium text-status-danger active:bg-surface-hover dark:text-status-danger dark:active:bg-surface-hover"
          >
            <LogOut size={20} aria-hidden="true" />
            Sign Out
          </Link>
        </li>
      </ul>
    </div>
  );
}
