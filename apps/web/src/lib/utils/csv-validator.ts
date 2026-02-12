import { z } from 'zod';
import { COMMUNITY_ROLES, type CommunityRole } from '@propertypro/shared';

export interface CsvParseResult<T> {
  header: string[];
  rows: Array<{ rowNumber: number; data: T }>; // rowNumber refers to the CSV line number (1-based), including header at 1
  errors: Array<{ rowNumber: number; column: string | null; message: string }>;
}

export interface ResidentCsvRowRaw {
  name?: string;
  email?: string;
  role?: string;
  unit_number?: string;
}

export interface ResidentCsvRow {
  name: string;
  email: string;
  role: CommunityRole;
  unit_number: string | null; // null allowed for roles that don't require unit
}

// Basic RFC4180-aware line parser supporting quoted fields and commas inside quotes.
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function stripBom(input: string): string {
  if (input.charCodeAt(0) === 0xfeff) {
    return input.slice(1);
  }
  return input;
}

export function parseCsvWithHeader(input: string): { header: string[]; records: Array<{ rowNumber: number; values: string[] }>; } {
  const normalized = stripBom(input);
  // Split by newlines, supporting both CRLF and LF. Keep indexes aligned to original lines.
  const lines = normalized.split(/\r?\n/);
  // Drop trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') {
    lines.pop();
  }
  if (lines.length === 0) {
    return { header: [], records: [] };
  }

  const header = parseCsvLine(lines[0]!.replace(/\r$/, ''))
    .map((h) => h.trim().toLowerCase());

  const records: Array<{ rowNumber: number; values: string[] }> = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]!;
    if (raw.trim() === '') {
      // Skip empty rows entirely
      continue;
    }
    const parsed = parseCsvLine(raw.replace(/\r$/, ''));
    records.push({ rowNumber: i + 1, values: parsed });
  }
  return { header, records };
}

const emailSchema = z.string().email();

export function validateResidentCsv(input: string): CsvParseResult<ResidentCsvRow> {
  const { header, records } = parseCsvWithHeader(input);
  const errors: Array<{ rowNumber: number; column: string | null; message: string }> = [];

  // Map column names to indices
  const colIndex: Record<string, number | undefined> = {};
  header.forEach((h, idx) => {
    colIndex[h] = idx;
  });

  const requiredCols = ['name', 'email', 'role'];
  for (const col of requiredCols) {
    if (!(col in colIndex)) {
      errors.push({ rowNumber: 1, column: col, message: `Missing required column '${col}'` });
    }
  }

  const outRows: Array<{ rowNumber: number; data: ResidentCsvRow }> = [];
  const seenEmails = new Set<string>();

  for (const rec of records) {
    const get = (col: string): string | undefined => {
      const idx = colIndex[col];
      if (idx === undefined) return undefined;
      const raw = rec.values[idx] ?? '';
      // Trim outer quotes if present and trim whitespace
      const trimmed = raw.trim();
      const unquoted = trimmed.startsWith('"') && trimmed.endsWith('"')
        ? trimmed.slice(1, -1)
        : trimmed;
      return unquoted;
    };

    const name = get('name') ?? '';
    const emailRaw = get('email') ?? '';
    const roleRaw = get('role') ?? '';
    const unitNumberRaw = (get('unit_number') ?? '').trim();

    const rowErrors: Array<{ column: string | null; message: string }> = [];
    if (!name) rowErrors.push({ column: 'name', message: 'Name is required' });
    if (!emailRaw) rowErrors.push({ column: 'email', message: 'Email is required' });
    else {
      const email = emailRaw.toLowerCase();
      const emailOk = emailSchema.safeParse(email).success;
      if (!emailOk) rowErrors.push({ column: 'email', message: 'Invalid email address' });
    }

    let role: CommunityRole | null = null;
    if (!roleRaw) {
      rowErrors.push({ column: 'role', message: 'Role is required' });
    } else if (!COMMUNITY_ROLES.includes(roleRaw as CommunityRole)) {
      rowErrors.push({ column: 'role', message: `Invalid role '${roleRaw}'` });
    } else {
      role = roleRaw as CommunityRole;
    }

    const normalizedEmail = (emailRaw || '').toLowerCase();
    if (normalizedEmail) {
      if (seenEmails.has(normalizedEmail)) {
        rowErrors.push({ column: 'email', message: `Duplicate email '${normalizedEmail}' in import` });
      } else {
        seenEmails.add(normalizedEmail);
      }
    }

    if (rowErrors.length > 0) {
      for (const err of rowErrors) {
        errors.push({ rowNumber: rec.rowNumber, column: err.column, message: err.message });
      }
      continue; // skip invalid row
    }

    outRows.push({
      rowNumber: rec.rowNumber,
      data: {
        name,
        email: normalizedEmail,
        role: role!,
        unit_number: unitNumberRaw || null,
      },
    });
  }

  return { header, rows: outRows, errors };
}

