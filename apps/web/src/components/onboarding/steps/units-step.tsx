'use client';

import { FormEvent, useState } from 'react';

export interface UnitData {
  unitNumber: string;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  rentAmount: number;
}

interface UnitsStepProps {
  onNext: (units: UnitData[]) => void;
  onBack: () => void;
  initialData?: UnitData[];
}

export function UnitsStep({ onNext, onBack, initialData }: UnitsStepProps) {
  const [units, setUnits] = useState<UnitData[]>(
    initialData && initialData.length > 0 ? initialData : [createEmptyUnit()]
  );

  function createEmptyUnit(): UnitData {
    return {
      unitNumber: '',
      bedrooms: 1,
      bathrooms: 1,
      sqft: 0,
      rentAmount: 0,
    };
  }

  function handleAddUnit() {
    setUnits([...units, createEmptyUnit()]);
  }

  function handleRemoveUnit(index: number) {
    if (units.length === 1) return; // Keep at least one unit
    setUnits(units.filter((_, i) => i !== index));
  }

  function handleUpdateUnit(index: number, field: keyof UnitData, value: string | number) {
    const updated = [...units];
    updated[index] = { ...updated[index], [field]: value } as UnitData;
    setUnits(updated);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    // Validate all units have a unit number
    const validUnits = units.filter((u) => u.unitNumber.trim().length > 0);

    if (validUnits.length === 0) {
      alert('Please add at least one unit');
      return;
    }

    // Check for duplicate unit numbers
    const unitNumbers = validUnits.map((u) => u.unitNumber.trim().toLowerCase());
    const uniqueUnitNumbers = new Set(unitNumbers);

    if (unitNumbers.length !== uniqueUnitNumbers.size) {
      alert('Duplicate unit numbers detected. Please ensure all unit numbers are unique.');
      return;
    }

    onNext(validUnits);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">Add Units</h2>
        <p className="mt-1 text-sm text-gray-600">
          Add the units in your community. You can add more later.
        </p>
      </div>

      <div className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">
                  Unit #
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">
                  Bedrooms
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">
                  Bathrooms
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">
                  Sq Ft
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">
                  Rent/Month
                </th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {units.map((unit, index) => (
                <tr key={index} className="border-b border-gray-100">
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={unit.unitNumber}
                      onChange={(e) => handleUpdateUnit(index, 'unitNumber', e.target.value)}
                      className="w-20 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="101"
                      required
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={unit.bedrooms}
                      onChange={(e) => handleUpdateUnit(index, 'bedrooms', parseInt(e.target.value) || 0)}
                      className="w-16 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      min="0"
                      max="10"
                      required
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={unit.bathrooms}
                      onChange={(e) => handleUpdateUnit(index, 'bathrooms', parseInt(e.target.value) || 0)}
                      className="w-16 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      min="0"
                      max="10"
                      required
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={unit.sqft}
                      onChange={(e) => handleUpdateUnit(index, 'sqft', parseInt(e.target.value) || 0)}
                      className="w-20 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      min="0"
                      placeholder="800"
                      required
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={unit.rentAmount}
                      onChange={(e) => handleUpdateUnit(index, 'rentAmount', parseFloat(e.target.value) || 0)}
                      className="w-24 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      min="0"
                      step="0.01"
                      placeholder="1200"
                      required
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

      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-gray-300 bg-white px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Back
        </button>
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Next
        </button>
      </div>
    </form>
  );
}
