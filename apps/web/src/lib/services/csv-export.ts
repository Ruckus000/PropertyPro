/**
 * CSV Export Service — generates RFC 4180-compliant CSV with formula-injection sanitization.
 *
 * Every cell goes through `escapeCSVField` (`lib/utils/csv-cell.ts`), the one
 * escaper shared with the in-browser export button.
 */
import { escapeCSVField } from '@/lib/utils/csv-cell';

/**
 * Convert an array of row objects to a CSV string with headers.
 *
 * @param headers - Column definitions: { key, label } pairs
 * @param rows - Array of row objects with keys matching header keys
 * @returns RFC 4180-compliant CSV string with formula-injection protection
 */
export function generateCSV(
  headers: ReadonlyArray<{ key: string; label: string }>,
  rows: ReadonlyArray<Record<string, unknown>>,
): string {
  const dataLines = rows.map((row) => generateCSVRowLine(headers, row));
  return [generateCSVHeaderLine(headers), ...dataLines].join('\r\n') + '\r\n';
}

/**
 * Single header line, WITHOUT a trailing newline.
 *
 * Split out of `generateCSV` so the async export worker can stream a table
 * batch-by-batch into an archive instead of materialising the whole CSV as one
 * string. `generateCSV` is now a composition of these two, so its behaviour is
 * unchanged by construction — the existing tests cover both.
 */
export function generateCSVHeaderLine(
  headers: ReadonlyArray<{ key: string; label: string }>,
): string {
  return headers.map((h) => escapeCSVField(h.label)).join(',');
}

/**
 * Single data line, WITHOUT a trailing newline. Same RFC 4180 quoting and
 * formula-injection guard as the batch helper — it is literally the same code
 * path.
 */
export function generateCSVRowLine(
  headers: ReadonlyArray<{ key: string; label: string }>,
  row: Record<string, unknown>,
): string {
  return headers.map((h) => escapeCSVField(row[h.key])).join(',');
}
