/**
 * PM Portfolio Community Filters — P3-45
 *
 * URL-param-driven filter controls for the PM portfolio page.
 * Filtering is server-authoritative; this component only updates query params.
 */
'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

const COMMUNITY_TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'condo_718', label: 'Condo (§718)' },
  { value: 'hoa_720', label: 'HOA (§720)' },
  { value: 'apartment', label: 'Apartment' },
] as const;

export function CommunityFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentType = searchParams.get('communityType') ?? '';
  const currentSearch = searchParams.get('search') ?? '';

  const updateParams = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <label htmlFor="communityType" className="whitespace-nowrap text-sm font-medium text-content-secondary">
          Type
        </label>
        <select
          id="communityType"
          value={currentType}
          onChange={(e) => updateParams('communityType', e.target.value)}
          className="rounded-sm border border-edge bg-surface-card px-3 py-1.5 text-sm text-content shadow-e0 focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
        >
          {COMMUNITY_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="search" className="whitespace-nowrap text-sm font-medium text-content-secondary">
          Search
        </label>
        <input
          id="search"
          type="search"
          value={currentSearch}
          onChange={(e) => updateParams('search', e.target.value)}
          placeholder="Name or slug..."
          className="rounded-sm border border-edge bg-surface-card px-3 py-1.5 text-sm text-content shadow-e0 placeholder:text-content-placeholder focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
        />
      </div>
    </div>
  );
}
