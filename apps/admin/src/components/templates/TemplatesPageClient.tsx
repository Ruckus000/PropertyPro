'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { COMMUNITY_TYPE_DISPLAY_NAMES } from '@propertypro/shared';
import type { PublicSiteTemplateListItem } from '@/lib/templates/types';
import { TemplateGallery } from './TemplateGallery';
import { TemplateGalleryToolbar } from './TemplateGalleryToolbar';

interface TemplatesPageClientProps {
  initialTemplates: PublicSiteTemplateListItem[];
}

function filterTemplates(
  templates: PublicSiteTemplateListItem[],
  filters: {
    search: string;
    communityType: 'all' | 'condo_718' | 'hoa_720' | 'apartment';
    lifecycle: 'all' | 'live' | 'needs_publish';
  },
) {
  const query = filters.search.trim().toLowerCase();

  return templates.filter((template) => {
    if (filters.communityType !== 'all' && template.communityType !== filters.communityType) {
      return false;
    }

    if (filters.lifecycle === 'live' && template.lifecycleState !== 'published_current') {
      return false;
    }

    if (
      filters.lifecycle === 'needs_publish'
      && template.lifecycleState !== 'published_with_unpublished_changes'
    ) {
      return false;
    }

    if (!query) return true;

    const haystack = [
      template.name,
      template.slug,
      template.summary,
      COMMUNITY_TYPE_DISPLAY_NAMES[template.communityType],
      ...template.tags,
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  });
}

function getCountLabel(total: number, filtered: number, hasActiveFilters: boolean) {
  if (!hasActiveFilters) {
    return `${total} template${total === 1 ? '' : 's'}`;
  }

  return `${filtered} of ${total} template${total === 1 ? '' : 's'}`;
}

export function TemplatesPageClient({ initialTemplates }: TemplatesPageClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [communityType, setCommunityType] = useState<'all' | 'condo_718' | 'hoa_720' | 'apartment'>('all');
  const [lifecycle, setLifecycle] = useState<'all' | 'live' | 'needs_publish'>('all');
  const [creating, setCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasActiveFilters = Boolean(search.trim()) || communityType !== 'all' || lifecycle !== 'all';
  const filteredTemplates = filterTemplates(initialTemplates, {
    search,
    communityType,
    lifecycle,
  });
  const countLabel = getCountLabel(initialTemplates.length, filteredTemplates.length, hasActiveFilters);

  async function handleCreateTemplate() {
    setCreating(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/admin/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityType: communityType === 'all' ? 'condo_718' : communityType,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMessage(payload.error?.message ?? 'Failed to create template');
        return;
      }

      router.push(`/templates/${payload.data.id}`);
      router.refresh();
    } catch {
      setErrorMessage('Failed to create template');
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-gray-900">Templates</h1>
        <p className="max-w-3xl text-sm leading-6 text-gray-500">
          Manage the global public site templates used for future demos. Publishing makes a template available for new demos only.
        </p>
      </div>

      {errorMessage && (
        <div
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {errorMessage}
        </div>
      )}

      <TemplateGalleryToolbar
        search={search}
        communityType={communityType}
        lifecycle={lifecycle}
        countLabel={countLabel}
        hasActiveFilters={hasActiveFilters}
        creating={creating}
        onSearchChange={setSearch}
        onCommunityTypeChange={setCommunityType}
        onLifecycleChange={setLifecycle}
        onClearFilters={() => {
          setSearch('');
          setCommunityType('all');
          setLifecycle('all');
        }}
        onCreateTemplate={handleCreateTemplate}
      />

      {initialTemplates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Create your first public template</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            Templates define the public demo website used for future demos. Publishing makes a template available for new demos only.
          </p>
          <button
            type="button"
            onClick={handleCreateTemplate}
            disabled={creating}
            className="mt-5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creating ? 'Creating…' : 'Create Template'}
          </button>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">No templates match these filters</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            Try a different search or clear filters to see more templates.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setCommunityType('all');
              setLifecycle('all');
            }}
            className="mt-5 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <TemplateGallery templates={filteredTemplates} />
      )}
    </section>
  );
}
