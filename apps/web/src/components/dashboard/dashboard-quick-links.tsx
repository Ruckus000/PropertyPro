import React from 'react';
import Link from 'next/link';

interface DashboardQuickLinksProps {
  communityId: number;
}

export function DashboardQuickLinks({ communityId }: DashboardQuickLinksProps) {
  const links = [
    {
      href: `/communities/${communityId}/documents`,
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
    <section className="rounded-md border border-edge bg-surface-card p-5">
      <h2 className="text-lg font-semibold text-content">Quick Links</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {links.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            className="rounded-md border border-edge px-3 py-2 text-sm text-content-secondary hover:bg-surface-hover"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
