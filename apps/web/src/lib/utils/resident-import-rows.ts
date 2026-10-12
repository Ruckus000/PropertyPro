/**
 * Line up a resident-import preview with the file the manager uploaded.
 *
 * The server reports ready rows and row errors by their line in the file. This
 * module walks the file itself, so every non-blank line appears exactly once,
 * on its real line number, with the values the manager typed. The preview used
 * to number ready rows by their position in the ready list (`i + 2`), which
 * shifted every row after the first rejected one and could hide a rejected row
 * behind a mis-numbered ready one (onboarding audit F1).
 */
import { escapeCSVField } from '@/lib/utils/csv-cell';
import { parseCsvWithHeader } from '@/lib/utils/csv-validator';

interface RowError {
  rowNumber: number;
  column: string | null;
  message: string;
  code?: 'already_member';
}

interface ReadyRow {
  rowNumber: number;
  name: string;
  email: string;
  role: string;
  unit_number: string | null;
  existingAccount: boolean;
}

export interface ImportDisplayRow {
  rowNumber: number;
  name: string;
  email: string;
  role: string;
  unitNumber: string;
  /**
   * `member`: already in this community, so there is nothing to import — after
   * an interrupted import this is what a saved row looks like (audit F2).
   */
  status: 'ready' | 'member' | 'error';
  /** Every reason the row will not be imported; empty for a ready row. */
  problems: string[];
  existingAccount: boolean;
}

/** Errors about the file as a whole (a missing column), reported on line 1. */
export function fileLevelErrors(errors: RowError[]): RowError[] {
  return errors.filter((e) => e.rowNumber <= 1);
}

const isAlreadyMember = (err: RowError) => err.code === 'already_member';

/** Problems to fix, by line. Already-member rows are done, not problems. */
function groupRowErrors(errors: RowError[]): Map<number, string[]> {
  const byRow = new Map<number, string[]>();
  for (const err of errors) {
    if (err.rowNumber <= 1 || isAlreadyMember(err)) continue;
    byRow.set(err.rowNumber, [...(byRow.get(err.rowNumber) ?? []), err.message]);
  }
  return byRow;
}

/** How many distinct lines have at least one problem (not how many messages). */
export function countRowsWithErrors(errors: RowError[]): number {
  return groupRowErrors(errors).size;
}

/** Lines whose person is already in this community. */
export function countAlreadyMembers(errors: RowError[]): number {
  return new Set(errors.filter(isAlreadyMember).map((e) => e.rowNumber)).size;
}

// Same cell clean-up as `validateResidentCsv`, so a raw value reads as the
// server read it.
function cell(values: string[], index: number): string {
  if (index < 0) return '';
  const trimmed = (values[index] ?? '').trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed;
}

export function buildImportDisplayRows(
  csvText: string,
  preview: ReadyRow[],
  errors: RowError[],
): ImportDisplayRow[] {
  const { header, records } = parseCsvWithHeader(csvText);
  // lastIndexOf: with a repeated column name the validator keeps the last one.
  const col = (name: string) => header.lastIndexOf(name);
  const readyByRow = new Map(preview.map((r) => [r.rowNumber, r]));
  const problemsByRow = groupRowErrors(errors);
  const memberRows = new Set(errors.filter(isAlreadyMember).map((e) => e.rowNumber));

  const rows: ImportDisplayRow[] = records.map((record) => {
    const ready = readyByRow.get(record.rowNumber);
    const problems = problemsByRow.get(record.rowNumber) ?? [];
    return {
      rowNumber: record.rowNumber,
      name: cell(record.values, col('name')),
      email: cell(record.values, col('email')),
      role: cell(record.values, col('role')),
      // The validator trims unit_number once more after unquoting.
      unitNumber: cell(record.values, col('unit_number')).trim(),
      status:
        ready && problems.length === 0
          ? 'ready'
          : memberRows.has(record.rowNumber) && problems.length === 0
            ? 'member'
            : 'error',
      problems,
      existingAccount: ready?.existingAccount ?? false,
    };
  });

  // Never drop a reported problem: if the server names a line this parse did
  // not produce, show it rather than lose it.
  const seen = new Set(rows.map((r) => r.rowNumber));
  for (const [rowNumber, problems] of problemsByRow) {
    if (seen.has(rowNumber)) continue;
    rows.push({
      rowNumber,
      name: '',
      email: '',
      role: '',
      unitNumber: '',
      status: 'error',
      problems,
      existingAccount: false,
    });
  }

  return rows.sort((a, b) => a.rowNumber - b.rowNumber);
}

/**
 * A CSV of only the lines that need fixing: the uploaded columns as typed, plus
 * `line` and `error`, so the manager can correct them and upload just these.
 * Cells pass through `escapeCSVField`, which neutralises spreadsheet formulas.
 */
export function buildRowsToFixCsv(csvText: string, errors: RowError[]): string {
  const { header, records } = parseCsvWithHeader(csvText);
  const problemsByRow = groupRowErrors(errors);
  const lines = [[...header, 'line', 'error'].map(escapeCSVField).join(',')];
  for (const record of records) {
    const problems = problemsByRow.get(record.rowNumber);
    if (!problems) continue;
    const values = header.map((_, i) => cell(record.values, i));
    lines.push([...values, String(record.rowNumber), problems.join('; ')].map(escapeCSVField).join(','));
  }
  return lines.join('\r\n');
}

/** `residents.csv` → `residents-rows-to-fix.csv`. */
export function rowsToFixFileName(uploadedName: string): string {
  const base = uploadedName.replace(/\.csv$/i, '') || 'residents';
  return `${base}-rows-to-fix.csv`;
}
