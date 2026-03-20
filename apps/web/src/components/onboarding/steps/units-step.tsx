'use client';

import { FormEvent, useState } from 'react';
import type { UnitDraftData } from '@/lib/onboarding/apartment-wizard-types';

export interface UnitData extends UnitDraftData {}

interface UnitsStepProps {
  onNext: (units: UnitData[]) => Promise<void> | void;
  onBack: () => void;
  initialData?: UnitData[];
}

function createEmptyUnit(): UnitData {
  return {
    unitNumber: '',
    floor: null,
    bedrooms: null,
    bathrooms: null,
    sqft: null,
    rentAmount: null,
  };
}

function parseIntegerInput(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function parseRentInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function UnitsStep({ onNext, onBack, initialData }: UnitsStepProps) {
  const [units, setUnits] = useState<UnitData[]>(
    initialData && initialData.length > 0 ? initialData : [createEmptyUnit()],
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleAddUnit() {
    setUnits((previous) => [...previous, createEmptyUnit()]);
  }

  function handleRemoveUnit(index: number) {
    if (units.length === 1) return;
    setUnits((previous) => previous.filter((_, unitIndex) => unitIndex !== index));
  }

  function handleUnitChange(index: number, patch: Partial<UnitData>) {
    setUnits((previous) => {
      const next = [...previous];
      const current = next[index] ?? createEmptyUnit();
      next[index] = {
        ...current,
        ...patch,
        unitNumber: patch.unitNumber ?? current.unitNumber,
      };
      return next;
    });
    setError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const hasMissingUnitNumber = units.some((unit) => unit.unitNumber.trim().length === 0);
    if (hasMissingUnitNumber) {
      setError('Each unit row must include a unit number.');
      return;
    }

    const normalizedNumbers = units.map((unit) => unit.unitNumber.trim().toLowerCase());
    const uniqueNumbers = new Set(normalizedNumbers);
    if (normalizedNumbers.length !== uniqueNumbers.size) {
      setError('Duplicate unit numbers detected. Please ensure all unit numbers are unique.');
      return;
    }

    const hasInvalidRentAmount = units.some(
      (unit) => unit.rentAmount != null && !/^\d+(\.\d{1,2})?$/.test(unit.rentAmount),
    );
    if (hasInvalidRentAmount) {
      setError('Rent amount must be a number with up to 2 decimal places.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onNext(
        units.map((unit) => ({
          unitNumber: unit.unitNumber.trim(),
          floor: unit.floor ?? null,
          bedrooms: unit.bedrooms ?? null,
          bathrooms: unit.bathrooms ?? null,
          sqft: unit.sqft ?? null,
          rentAmount: unit.rentAmount ?? null,
        })),
      );
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to save units step');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-content">Add Units</h2>
        <p className="mt-1 text-sm text-content-secondary">
          Add the units in your community. You can edit this later.
        </p>
      </div>

      <div className="space-y-4">
        <div className="overflow-x-auto rounded-md border border-edge">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-surface-page">
                <th className="px-3 py-2 text-left text-xs font-medium text-content-secondary">Unit #</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-content-secondary">Floor</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-content-secondary">Bedrooms</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-content-secondary">Bathrooms</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-content-secondary">Sq Ft</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-content-secondary">Rent/Month</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {units.map((unit, index) => (
                <tr key={index} className="border-t border-edge-subtle">
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={unit.unitNumber}
                      onChange={(event) =>
                        handleUnitChange(index, {
                          unitNumber: event.target.value,
                        })
                      }
                      className="w-24 rounded border border-edge-strong px-2 py-1 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
                      placeholder="101"
                      required
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={unit.floor ?? ''}
                      onChange={(event) =>
                        handleUnitChange(index, {
                          floor: parseIntegerInput(event.target.value),
                        })
                      }
                      className="w-20 rounded border border-edge-strong px-2 py-1 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
                      placeholder="1"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={unit.bedrooms ?? ''}
                      onChange={(event) =>
                        handleUnitChange(index, {
                          bedrooms: parseIntegerInput(event.target.value),
                        })
                      }
                      className="w-20 rounded border border-edge-strong px-2 py-1 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
                      min="0"
                      placeholder="2"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={unit.bathrooms ?? ''}
                      onChange={(event) =>
                        handleUnitChange(index, {
                          bathrooms: parseIntegerInput(event.target.value),
                        })
                      }
                      className="w-20 rounded border border-edge-strong px-2 py-1 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
                      min="0"
                      placeholder="2"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={unit.sqft ?? ''}
                      onChange={(event) =>
                        handleUnitChange(index, {
                          sqft: parseIntegerInput(event.target.value),
                        })
                      }
                      className="w-24 rounded border border-edge-strong px-2 py-1 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
                      min="0"
                      placeholder="900"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={unit.rentAmount ?? ''}
                      onChange={(event) => {
                        const parsed = parseRentInput(event.target.value);
                        if (event.target.value.trim().length > 0 && parsed === null) {
                          handleUnitChange(index, { rentAmount: event.target.value });
                          return;
                        }
                        handleUnitChange(index, { rentAmount: parsed });
                      }}
                      className="w-28 rounded border border-edge-strong px-2 py-1 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
                      placeholder="1500.00"
                    />
                  </td>
                  <td className="px-3 py-2">
                    {units.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveUnit(index)}
                        className="text-sm text-status-danger hover:text-status-danger"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          onClick={handleAddUnit}
          className="text-sm font-medium text-content-link hover:text-content-link"
        >
          + Add Another Unit
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-status-danger-bg p-3 text-sm text-status-danger">
          {error}
        </div>
      )}

      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-edge-strong bg-surface-card px-6 py-2 text-sm font-medium text-content-secondary hover:bg-surface-page"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-interactive px-6 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Saving...' : 'Next'}
        </button>
      </div>
    </form>
  );
}
