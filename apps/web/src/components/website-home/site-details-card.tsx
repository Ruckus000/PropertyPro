/**
 * The website home's "Details on your site" (spec C2): the community profile
 * fields the public site shows, as it shows them. A field not added yet is
 * left off the site, and says so, with a link to the Community profile in
 * Settings (ruling R10).
 */
import Link from 'next/link';
import { EyeOff } from 'lucide-react';
import type { CommunityProfile } from '@/lib/services/community-profile-service';
import { cn } from '@/lib/utils';
import { TOUCH } from './touch';

export const NOT_ADDED = "Not added yet, so it's hidden on the site";

export interface SiteDetailsCardProps {
  communityId: number;
  profile: CommunityProfile;
}

function addressOf(profile: CommunityProfile): string | null {
  const stateZip = [profile.state, profile.zipCode].filter(Boolean).join(' ');
  const parts = [profile.addressLine1, profile.addressLine2, profile.city, stateZip].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

export function SiteDetailsCard({ communityId, profile }: SiteDetailsCardProps) {
  const fields: Array<{ label: string; value: string | null }> = [
    { label: 'Name', value: profile.name },
    { label: 'Address', value: addressOf(profile) },
    { label: 'Public phone', value: profile.contactPhone },
    { label: 'Public email', value: profile.contactEmail },
    { label: 'Office hours', value: profile.officeHours },
  ];
  return (
    <section
      aria-labelledby="site-details-heading"
      className="space-y-3 rounded-md border border-edge bg-surface-card p-5"
    >
      <h2 id="site-details-heading" className="text-lg font-semibold text-content">
        Details on your site
      </h2>
      <dl className="divide-y divide-edge-subtle">
        {fields.map(({ label, value }) => (
          <div key={label} className="grid gap-1 py-2 first:pt-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-3">
            <dt className="text-sm font-medium text-content-secondary">{label}</dt>
            <dd className="min-w-0 break-words text-sm text-content">
              {value?.trim() ? (
                value
              ) : (
                <span className="flex items-center gap-1.5 text-content-secondary">
                  <EyeOff className="size-4 shrink-0" aria-hidden="true" />
                  {NOT_ADDED}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <Link
        href={`/settings?communityId=${communityId}#community-profile`}
        className={cn('inline-flex items-center text-sm font-medium text-content-link underline', TOUCH)}
      >
        Edit in Community profile
      </Link>
    </section>
  );
}
