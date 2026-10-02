/**
 * Unit CSV import: parse and validate. Same parser as the resident import
 * (`parseCsvWithHeader`), same error shape (row number + column + message),
 * so the two import screens read alike.
 *
 * Columns: unit_number (required), building, floor, bedrooms, bathrooms,
 * sqft, occupancy (owner_occupied | rented | vacant, or friendlier spellings).
 * Rent is not importable: it is derived from the unit's lease.
 */
import { parseCsvWithHeader, type CsvParseResult } from './csv-validator';

export const UNIT_IMPORT_MAX_ROWS = 2000;

export const UNIT_CSV_TEMPLATE =
  'unit_number,building,floor,bedrooms,bathrooms,sqft,occupancy\n101,Building A,1,2,1,900,owner_occupied\n102,Building A,1,1,1,650,rented';

export type UnitImportOccupancy = 'owner_occupied' | 'rented' | 'vacant';

export interface UnitCsvRow {
  unit_number: string;
  building: string | null;
  floor: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  occupancy: UnitImportOccupancy | null;
}

const OCCUPANCY_ALIASES: Record<string, UnitImportOccupancy> = {
  owner_occupied: 'owner_occupied',
  'owner occupied': 'owner_occupied',
  'owner-occupied': 'owner_occupied',
  owner: 'owner_occupied',
  rented: 'rented',
  rental: 'rented',
  tenant: 'rented',
  vacant: 'vacant',
  empty: 'vacant',
};

const KNOWN_COLUMNS = ['unit_number', 'building', 'floor', 'bedrooms', 'bathrooms', 'sqft', 'occupancy'];

export function validateUnitCsv(
  input: string,
  opts: { allowOwnerOccupied: boolean },
): CsvParseResult<UnitCsvRow> {
  const { header, records } = parseCsvWithHeader(input);
  const errors: CsvParseResult<UnitCsvRow>['errors'] = [];
  const rows: CsvParseResult<UnitCsvRow>['rows'] = [];

  const col = new Map(header.map((h, i) => [h, i]));
  if (!col.has('unit_number')) {
    errors.push({ rowNumber: 1, column: 'unit_number', message: "Missing required column 'unit_number'" });
    return { header, rows, errors };
  }
  for (const h of header) {
    if (h && !KNOWN_COLUMNS.includes(h)) {
      errors.push({ rowNumber: 1, column: h, message: `Unknown column '${h}' (ignored). Columns: ${KNOWN_COLUMNS.join(', ')}` });
    }
  }
  if (records.length > UNIT_IMPORT_MAX_ROWS) {
    errors.push({ rowNumber: 1, column: null, message: `At most ${UNIT_IMPORT_MAX_ROWS} units per import; this file has ${records.length}.` });
    return { header, rows, errors };
  }

  const seen = new Map<string, number>();
  for (const rec of records) {
    const get = (name: string) => {
      const i = col.get(name);
      return i === undefined ? '' : (rec.values[i] ?? '').trim();
    };
    const rowErrors: Array<{ column: string; message: string }> = [];
    const int = (name: string, min?: number): number | null => {
      const raw = get(name);
      if (raw === '') return null;
      const n = Number(raw);
      if (!Number.isInteger(n) || (min !== undefined && n < min)) {
        rowErrors.push({ column: name, message: `${name} must be a whole number${min !== undefined ? ` of ${min} or more` : ''}` });
        return null;
      }
      return n;
    };

    const unitNumber = get('unit_number');
    if (!unitNumber) rowErrors.push({ column: 'unit_number', message: 'Unit number is required' });
    else {
      // Same rule as the database: one live unit per number, any letter case.
      const key = unitNumber.toLowerCase();
      const first = seen.get(key);
      if (first !== undefined) {
        rowErrors.push({ column: 'unit_number', message: `Unit '${unitNumber}' is already on row ${first} of this file` });
      } else {
        seen.set(key, rec.rowNumber);
      }
    }

    const occupancyRaw = get('occupancy').toLowerCase();
    let occupancy: UnitImportOccupancy | null = null;
    if (occupancyRaw) {
      occupancy = OCCUPANCY_ALIASES[occupancyRaw] ?? null;
      if (!occupancy) {
        rowErrors.push({ column: 'occupancy', message: `Occupancy '${get('occupancy')}' must be owner_occupied, rented or vacant` });
      } else if (occupancy === 'owner_occupied' && !opts.allowOwnerOccupied) {
        rowErrors.push({ column: 'occupancy', message: 'Apartment units cannot be owner-occupied' });
        occupancy = null;
      }
    }

    const data: UnitCsvRow = {
      unit_number: unitNumber,
      building: get('building') || null,
      floor: int('floor'),
      bedrooms: int('bedrooms', 0),
      bathrooms: int('bathrooms', 0),
      sqft: int('sqft', 0),
      occupancy,
    };

    if (rowErrors.length > 0) {
      for (const e of rowErrors) errors.push({ rowNumber: rec.rowNumber, column: e.column, message: e.message });
      continue;
    }
    rows.push({ rowNumber: rec.rowNumber, data });
  }
  return { header, rows, errors };
}
