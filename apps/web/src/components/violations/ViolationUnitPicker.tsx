'use client';

/**
 * The unit `<select>` both violation report forms use: staff filing on a
 * resident's behalf, and residents, who report the unit where the problem is —
 * a neighbour's, or their own (D1). Lists every unit in the community, sorted
 * by label with numeric collation, from `/api/v1/units` (residents hold
 * `units:read`). `ownUnitIds` marks the viewer's own homes so a resident does
 * not file against their own household by mistake.
 */
import { useMemo } from 'react';
import { useUnits } from '@/hooks/use-units';
import { formatUnitLabel } from '@/lib/units/format-unit-label';

interface UnitOption {
  id: number;
  unitNumber: string;
  building: string | null;
}

export type ViolationUnitOptions = ReturnType<typeof useViolationUnitOptions>;

interface ViolationUnitPickerProps {
  id: string;
  label: string;
  /** From `useViolationUnitOptions` — the form also needs it to gate submit. */
  options: ViolationUnitOptions;
  value: number | '';
  onChange: (value: number | '') => void;
  error?: string;
  ownUnitIds?: readonly number[];
  disabled?: boolean;
}

export function useViolationUnitOptions(communityId: number) {
  const unitsQuery = useUnits(communityId);
  const units = useMemo<UnitOption[]>(() => {
    return (unitsQuery.data ?? [])
      .map((unit) => ({ unit, label: formatUnitLabel(unit) }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
      .map(({ unit }) => unit);
  }, [unitsQuery.data]);
  const error = unitsQuery.error
    ? unitsQuery.error instanceof Error
      ? unitsQuery.error.message
      : 'Failed to load units'
    : '';
  return { units, loading: unitsQuery.isLoading, error };
}

export function ViolationUnitPicker({
  id,
  label,
  options,
  value,
  onChange,
  error,
  ownUnitIds,
  disabled,
}: ViolationUnitPickerProps) {
  const { units, loading, error: loadError } = options;

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-content-secondary">
        {label} <span aria-hidden="true" className="text-status-danger">*</span>
      </label>
      {loadError ? (
        <p role="alert" className="rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger">
          {loadError}
        </p>
      ) : (
        <select
          id={id}
          value={value === '' ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          disabled={disabled || loading || units.length === 0}
          className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus disabled:opacity-50"
        >
          <option value="">
            {loading ? 'Loading units…' : units.length === 0 ? 'No units available' : 'Select a unit…'}
          </option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {formatUnitLabel(u)}
              {ownUnitIds?.includes(u.id) ? ' (your unit)' : ''}
            </option>
          ))}
        </select>
      )}
      {error && <p className="mt-1 text-xs text-status-danger">{error}</p>}
    </div>
  );
}
