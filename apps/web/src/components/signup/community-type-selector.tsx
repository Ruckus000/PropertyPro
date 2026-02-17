'use client';

import type { CommunityType } from '@propertypro/shared';

interface CommunityTypeSelectorProps {
  value: CommunityType;
  onChange: (value: CommunityType) => void;
  disabled?: boolean;
}

const COMMUNITY_TYPE_OPTIONS: ReadonlyArray<{
  value: CommunityType;
  label: string;
  description: string;
}> = [
  {
    value: 'condo_718',
    label: 'Condominium (718)',
    description: 'Florida condominium association compliance workflows.',
  },
  {
    value: 'hoa_720',
    label: 'HOA (720)',
    description: 'Florida HOA transparency and owner communication workflows.',
  },
  {
    value: 'apartment',
    label: 'Apartment',
    description: 'Operational tools for rentals and lease-driven communities.',
  },
];

export function CommunityTypeSelector({
  value,
  onChange,
  disabled = false,
}: CommunityTypeSelectorProps) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-gray-700">Community Type</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {COMMUNITY_TYPE_OPTIONS.map((option) => {
          const isSelected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={`rounded-md border px-3 py-3 text-left transition-colors ${
                isSelected
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-300 bg-white hover:border-gray-400'
              } disabled:cursor-not-allowed disabled:opacity-60`}
              aria-pressed={isSelected}
            >
              <span className="block text-sm font-semibold text-gray-900">{option.label}</span>
              <span className="mt-1 block text-xs text-gray-600">{option.description}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
