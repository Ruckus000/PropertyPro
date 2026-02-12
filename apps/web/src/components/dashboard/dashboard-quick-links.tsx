import React from 'react';
import Link from 'next/link';

interface DashboardQuickLinksProps {
  communityId: number;
}

export function DashboardQuickLinks({ communityId }: DashboardQuickLinksProps) {
  const links = [
    {
      href: `/documents?communityId=${communityId}`,
      label: 'Documents',
    },
    {
      href: `/settings?communityId=${communityId}`,
      label: 'Settings',
    },
    {
      href: `/maintenance?communityId=${communityId}`,
      label: 'Maintenance',
    },
  ];

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-gray-900">Quick Links</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {links.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
