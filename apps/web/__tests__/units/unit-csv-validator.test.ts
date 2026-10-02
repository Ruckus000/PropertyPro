import { describe, expect, it } from 'vitest';
import { UNIT_IMPORT_MAX_ROWS, validateUnitCsv } from '../../src/lib/utils/unit-csv-validator';

const condo = { allowOwnerOccupied: true };

describe('validateUnitCsv', () => {
  it('parses every column, with friendly occupancy spellings', () => {
    const { rows, errors } = validateUnitCsv(
      'unit_number,building,floor,bedrooms,bathrooms,sqft,occupancy\n101,A,1,2,1,900,Owner Occupied\nB-2,,-1,0,1,,rental\n',
      condo,
    );
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.data)).toEqual([
      { unit_number: '101', building: 'A', floor: 1, bedrooms: 2, bathrooms: 1, sqft: 900, occupancy: 'owner_occupied' },
      { unit_number: 'B-2', building: null, floor: -1, bedrooms: 0, bathrooms: 1, sqft: null, occupancy: 'rented' },
    ]);
  });

  it('requires the unit_number column and a value on every row', () => {
    expect(validateUnitCsv('building\nA\n', condo).errors).toEqual([
      { rowNumber: 1, column: 'unit_number', message: "Missing required column 'unit_number'" },
    ]);
    const { rows, errors } = validateUnitCsv('unit_number,building\n,A\n102,B\n', condo);
    expect(rows.map((r) => r.data.unit_number)).toEqual(['102']);
    expect(errors).toEqual([{ rowNumber: 2, column: 'unit_number', message: 'Unit number is required' }]);
  });

  it('rejects a number repeated in the file, in any letter case (the database rule)', () => {
    const { rows, errors } = validateUnitCsv('unit_number\n4B\n4b\n', condo);
    expect(rows).toHaveLength(1);
    expect(errors[0]).toMatchObject({ rowNumber: 3, message: "Unit '4b' is already on row 2 of this file" });
  });

  it('rejects bad numbers and occupancy, and owner-occupied in apartments', () => {
    const { errors } = validateUnitCsv('unit_number,bedrooms,sqft,occupancy\n1,-1,9.5,haunted\n', condo);
    expect(errors.map((e) => e.column)).toEqual(['occupancy', 'bedrooms', 'sqft']);
    const apartment = validateUnitCsv('unit_number,occupancy\n1,owner_occupied\n', { allowOwnerOccupied: false });
    expect(apartment.errors[0]?.message).toBe('Apartment units cannot be owner-occupied');
    expect(apartment.rows).toHaveLength(0);
  });

  it('notes unknown columns without failing rows (rent is not importable)', () => {
    const { rows, errors } = validateUnitCsv('unit_number,rent\n1,1500\n', condo);
    expect(rows).toHaveLength(1);
    expect(errors[0]).toMatchObject({ rowNumber: 1, column: 'rent' });
  });

  it(`refuses files over ${UNIT_IMPORT_MAX_ROWS} rows outright`, () => {
    const csv = 'unit_number\n' + Array.from({ length: UNIT_IMPORT_MAX_ROWS + 1 }, (_, i) => `U${i}`).join('\n');
    const { rows, errors } = validateUnitCsv(csv, condo);
    expect(rows).toHaveLength(0);
    expect(errors[0]?.message).toMatch(/At most 2000 units/);
  });
});
