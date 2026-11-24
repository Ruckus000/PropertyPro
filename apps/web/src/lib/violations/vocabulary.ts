/**
 * Shared violation vocabulary for the redesigned Violations views.
 *
 * Pure constants and helpers. Type-only imports keep this module free of
 * runtime db imports, so it loads without DATABASE_URL.
 */
import type { ViolationSeverity, ViolationStatus } from '@propertypro/db';
import type { StatusGlyphKind } from '@propertypro/ui/components/shared/status-glyph';

export const VIOLATION_CATEGORIES = [
  { value: 'noise', label: 'Noise' },
  { value: 'parking', label: 'Parking' },
  { value: 'unauthorized_modification', label: 'Unauthorized Modification' },
  { value: 'pet', label: 'Pet Violation' },
  { value: 'trash', label: 'Trash / Debris' },
  { value: 'common_area_misuse', label: 'Common Area Misuse' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'property_damage', label: 'Property Damage' },
  { value: 'other', label: 'Other' },
] as const satisfies readonly { value: string; label: string }[];

export function categoryLabel(value: string): string {
  const match = VIOLATION_CATEGORIES.find((c) => c.value === value);
  return match ? match.label : value;
}

export const VIOLATION_STATUS_LABELS: Record<ViolationStatus, string> = {
  reported: 'Reported',
  noticed: 'Noticed',
  hearing_scheduled: 'Hearing scheduled',
  fined: 'Fined',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

export const SEVERITY_OPTIONS: readonly { value: ViolationSeverity; label: string }[] = [
  { value: 'minor', label: 'Minor' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'major', label: 'Major' },
];

export const OPEN_STATUSES: readonly ViolationStatus[] = [
  'reported',
  'noticed',
  'hearing_scheduled',
  'fined',
];

const GLYPH_BY_STATUS: Record<ViolationStatus, StatusGlyphKind> = {
  reported: 'attention',
  noticed: 'in-progress',
  hearing_scheduled: 'in-progress',
  fined: 'overdue',
  resolved: 'done',
  dismissed: 'not-started',
};

export function violationGlyph(status: ViolationStatus): StatusGlyphKind {
  return GLYPH_BY_STATUS[status];
}
