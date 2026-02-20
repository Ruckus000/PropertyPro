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
        <h2 className="text-2xl font-semibold text-gray-900">Add Units</h2>
        <p className="mt-1 text-sm text-gray-600">
          Add the units in your community. You can edit this later.
        </p>
      </div>

      <div className="space-y-4">
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Unit #</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Floor</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Bedrooms</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Bathrooms</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Sq Ft</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Rent/Month</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {units.map((unit, index) => (
                <tr key={index} className="border-t border-gray-100">
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={unit.unitNumber}
                      onChange={(event) =>
                        handleUnitChange(index, {
                          unitNumber: event.target.value,
                        })
                      }
                      className="w-24 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                      className="w-20 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                      className="w-20 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                      className="w-20 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                      className="w-24 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                      className="w-28 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="1500.00"
                    />
                  </td>
                  <td className="px-3 py-2">
                    {units.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveUnit(index)}
                        className="text-sm text-red-600 hover:text-red-700"
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
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          + Add Another Unit
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-gray-300 bg-white px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Saving...' : 'Next'}
        </button>
      </div>
    </form>
  );
}
