import React from 'react';
import Link from 'next/link';
import type { CommunityType } from '@propertypro/shared';

export interface PublicHomeCommunity {
  id: number;
  slug: string;
  name: string;
  communityType: CommunityType;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
}

interface PublicHomeProps {
  community: PublicHomeCommunity;
}

function formatAddress(community: PublicHomeCommunity): string {
  const parts = [
    community.addressLine1,
    community.addressLine2,
    [community.city, community.state].filter(Boolean).join(', '),
    community.zipCode,
  ].filter(Boolean);
  return parts.join(' ');
}

export function PublicHome({ community }: PublicHomeProps) {
  const isNoticesEnabled = community.communityType !== 'apartment';

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-content-link">PropertyPro Florida</p>
        <h1 className="text-4xl font-semibold text-content">{community.name}</h1>
        <p className="max-w-2xl text-sm text-content-secondary">
          Official community information portal. Residents can log in to access documents, announcements,
          and community updates.
        </p>
      </header>

      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        <article className="rounded-md border border-edge bg-surface-card p-5">
          <h2 className="text-sm font-semibold text-content">Community Address</h2>
          <p className="mt-2 text-sm text-content-secondary">
            {formatAddress(community) || 'Address unavailable'}
          </p>
        </article>
        <article className="rounded-md border border-edge bg-surface-card p-5">
          <h2 className="text-sm font-semibold text-content">Resident Portal</h2>
          <p className="mt-2 text-sm text-content-secondary">
            Log in to view private notices, meeting details, and documents.
          </p>
          <Link
            href="/auth/login"
            className="mt-4 inline-flex rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover"
          >
            Log In
          </Link>
        </article>
      </section>

      <nav className="mt-10 flex flex-wrap gap-3 text-sm">
        {isNoticesEnabled ? (
          <Link
            href={`/${community.slug}/notices`}
            className="rounded-md border border-edge-strong px-3 py-2 text-content-secondary hover:bg-surface-page"
          >
            Notices
          </Link>
        ) : null}
        <Link href="/legal/terms" className="rounded-md border border-edge-strong px-3 py-2 text-content-secondary hover:bg-surface-page">
          Terms of Service
        </Link>
        <Link href="/legal/privacy" className="rounded-md border border-edge-strong px-3 py-2 text-content-secondary hover:bg-surface-page">
          Privacy Policy
        </Link>
      </nav>
    </main>
  );
}
