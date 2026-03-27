'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { COMMUNITY_TYPE_DISPLAY_NAMES } from '@propertypro/shared';

interface TemplateGalleryToolbarProps {
  search: string;
  communityType: 'all' | 'condo_718' | 'hoa_720' | 'apartment';
  lifecycle: 'all' | 'live' | 'needs_publish';
  countLabel: string;
  hasActiveFilters: boolean;
  creating: boolean;
  onSearchChange: (value: string) => void;
  onCommunityTypeChange: (value: 'all' | 'condo_718' | 'hoa_720' | 'apartment') => void;
  onLifecycleChange: (value: 'all' | 'live' | 'needs_publish') => void;
  onClearFilters: () => void;
  onCreateTemplate: () => void;
}

export function TemplateGalleryToolbar({
  search,
  communityType,
  lifecycle,
  countLabel,
  hasActiveFilters,
  creating,
  onSearchChange,
  onCommunityTypeChange,
  onLifecycleChange,
  onClearFilters,
  onCreateTemplate,
}: TemplateGalleryToolbarProps) {
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-1 flex-col gap-4">
            <div className="relative max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                aria-label="Search templates"
                placeholder="Search name, slug, tags, or summary"
                className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
            </div>

            <div className="flex items-center gap-3 lg:hidden">
              <button
                type="button"
                onClick={() => setShowMobileFilters((current) => !current)}
                aria-controls="template-gallery-filters"
                aria-expanded={showMobileFilters}
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                {showMobileFilters ? 'Hide Filters' : 'Filters'}
              </button>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    onClearFilters();
                    setShowMobileFilters(false);
                  }}
                  className="text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-gray-500">{countLabel}</p>
            <button
              type="button"
              onClick={onCreateTemplate}
              disabled={creating}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? 'Creating…' : 'New Template'}
            </button>
          </div>
        </div>

        <div
          id="template-gallery-filters"
          className={[
            showMobileFilters ? 'flex' : 'hidden',
            'flex-col gap-3 lg:flex lg:flex-row lg:flex-wrap lg:items-center',
          ].join(' ')}
        >
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <span className="font-medium text-gray-700">Community type</span>
            <select
              value={communityType}
              onChange={(event) => onCommunityTypeChange(event.target.value as 'all' | 'condo_718' | 'hoa_720' | 'apartment')}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            >
              <option value="all">All</option>
              <option value="condo_718">{COMMUNITY_TYPE_DISPLAY_NAMES.condo_718}</option>
              <option value="hoa_720">{COMMUNITY_TYPE_DISPLAY_NAMES.hoa_720}</option>
              <option value="apartment">{COMMUNITY_TYPE_DISPLAY_NAMES.apartment}</option>
            </select>
          </label>

          <div
            className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 p-1"
            role="group"
            aria-label="Lifecycle filter"
          >
            {[
              { id: 'all', label: 'All' },
              { id: 'live', label: 'Live' },
              { id: 'needs_publish', label: 'Needs publish' },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onLifecycleChange(option.id as 'all' | 'live' | 'needs_publish')}
                aria-pressed={lifecycle === option.id}
                className={[
                  'rounded-full px-3 py-1.5 text-sm font-medium transition',
                  lifecycle === option.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900',
                ].join(' ')}
              >
                {option.label}
              </button>
            ))}
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="hidden text-sm font-medium text-blue-600 hover:text-blue-700 lg:inline-flex"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
