'use client';

/**
 * Theme Presets table — read-only catalog view (PR #6a).
 *
 * Renders the list of platform theme presets seeded by migration 0004
 * (and any subsequent additions). CRUD lands in later slices; for now
 * this is a discovery / inspection surface for platform admins.
 */
import { Star, Archive } from 'lucide-react';

export interface ThemePresetRow {
  id: number;
  slug: string;
  displayName: string;
  description: string | null;
  tokens: {
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    headingFont?: string;
    bodyFont?: string;
  };
  tier: 'essentials' | 'professional' | 'pm';
  isArchived: boolean;
  isFeatured: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  presets: ThemePresetRow[];
}

function TierBadge({ tier }: { tier: ThemePresetRow['tier'] }) {
  const palette: Record<ThemePresetRow['tier'], string> = {
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

function Swatch({ color, label }: { color?: string; label: string }) {
  if (!color) return null;
  return (
    <span
      aria-label={`${label} ${color}`}
      title={`${label}: ${color}`}
      className="inline-block h-4 w-4 rounded border border-gray-200"
      style={{ backgroundColor: color }}
    />
  );
}

export function ThemePresetsTable({ presets }: Props) {
  if (presets.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
        <p className="text-sm text-gray-500">No theme presets configured.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              Preset
            </th>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              Slug
            </th>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              Tokens
            </th>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              Tier
            </th>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              Status
            </th>
            <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              v
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {presets.map((preset) => (
            <tr key={preset.id} data-testid={`theme-preset-row-${preset.slug}`}>
              <td className="px-4 py-3 align-top">
                <div className="flex items-center gap-2">
                  {preset.isFeatured && (
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-label="Featured" />
                  )}
                  <span className="text-sm font-medium text-gray-900">{preset.displayName}</span>
                </div>
                {preset.description && (
                  <p className="mt-1 max-w-md text-xs text-gray-500">{preset.description}</p>
                )}
              </td>
              <td className="px-4 py-3 align-top">
                <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">{preset.slug}</code>
              </td>
              <td className="px-4 py-3 align-top">
                <div className="flex items-center gap-1.5">
                  <Swatch color={preset.tokens?.primaryColor} label="Primary" />
                  <Swatch color={preset.tokens?.secondaryColor} label="Secondary" />
                  <Swatch color={preset.tokens?.accentColor} label="Accent" />
                </div>
                {(preset.tokens?.headingFont || preset.tokens?.bodyFont) && (
                  <p className="mt-1 text-xs text-gray-500">
                    {preset.tokens?.headingFont}
                    {preset.tokens?.headingFont && preset.tokens?.bodyFont ? ' / ' : ''}
                    {preset.tokens?.bodyFont}
                  </p>
                )}
              </td>
              <td className="px-4 py-3 align-top">
                <TierBadge tier={preset.tier} />
              </td>
              <td className="px-4 py-3 align-top">
                {preset.isArchived ? (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                    <Archive className="h-3 w-3" aria-hidden="true" />
                    Archived
                  </span>
                ) : (
                  <span className="text-xs text-green-700">Active</span>
                )}
              </td>
              <td className="px-4 py-3 align-top text-xs text-gray-600">{preset.version}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
