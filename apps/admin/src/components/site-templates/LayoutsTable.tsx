'use client';

/**
 * Layouts catalog table — read-only catalog view (PR #6b).
 *
 * Renders the list of code-shipped layouts (Tidewater / Boulevard /
 * Sable) with their seed metadata. Editing the inline metadata
 * (display name, tagline, tier, featured, archived) lands in a later
 * slice.
 */
import { Star, Archive } from 'lucide-react';

export interface LayoutRow {
  id: number;
  slug: string;
  displayName: string;
  tagline: string | null;
  description: string | null;
  tier: 'essentials' | 'professional' | 'pm';
  isArchived: boolean;
  isFeatured: boolean;
  defaultPresetSlug: string | null;
  version: string;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  layouts: LayoutRow[];
}

function TierBadge({ tier }: { tier: LayoutRow['tier'] }) {
  const palette: Record<LayoutRow['tier'], string> = {
    essentials: 'bg-blue-100 text-blue-800',
    professional: 'bg-purple-100 text-purple-800',
    pm: 'bg-amber-100 text-amber-800',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${palette[tier]}`}>
      {tier}
    </span>
  );
}

export function LayoutsTable({ layouts }: Props) {
  if (layouts.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
        <p className="text-sm text-gray-500">No layouts configured.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              Layout
            </th>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              Slug
            </th>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              Default Preset
            </th>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              Tier
            </th>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              Status
            </th>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              Version
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {layouts.map((layout) => (
            <tr key={layout.id} data-testid={`layout-row-${layout.slug}`}>
              <td className="px-4 py-3 align-top">
                <div className="flex items-center gap-2">
                  {layout.isFeatured && (
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-label="Featured" />
                  )}
                  <span className="text-sm font-medium text-gray-900">{layout.displayName}</span>
                </div>
                {layout.tagline && (
                  <p className="mt-0.5 text-xs italic text-gray-600">{layout.tagline}</p>
                )}
                {layout.description && (
                  <p className="mt-1 max-w-md text-xs text-gray-500">{layout.description}</p>
                )}
              </td>
              <td className="px-4 py-3 align-top">
                <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">{layout.slug}</code>
              </td>
              <td className="px-4 py-3 align-top text-xs text-gray-700">
                {layout.defaultPresetSlug ? (
                  <code className="rounded bg-gray-100 px-1.5 py-0.5">{layout.defaultPresetSlug}</code>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="px-4 py-3 align-top">
                <TierBadge tier={layout.tier} />
              </td>
              <td className="px-4 py-3 align-top">
                {layout.isArchived ? (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                    <Archive className="h-3 w-3" aria-hidden="true" />
                    Archived
                  </span>
                ) : (
                  <span className="text-xs text-green-700">Active</span>
                )}
              </td>
              <td className="px-4 py-3 align-top text-xs text-gray-600">{layout.version}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
