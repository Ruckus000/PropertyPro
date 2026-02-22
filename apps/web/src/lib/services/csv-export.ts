/**
 * CSV Export Service — generates RFC 4180-compliant CSV with formula-injection sanitization.
 *
 * P3-53: Audit trail CSV export must sanitize cells that start with dangerous
 * characters (=, +, -, @, TAB, CR) to prevent formula injection in spreadsheet
 * applications. Each dangerous leading character is prefixed with an apostrophe.
 */

/** Characters that trigger formula execution in Excel/Sheets when at cell start. */
const FORMULA_INJECTION_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

/**
 * Sanitize a single cell value to prevent CSV formula injection.
 *
 * If the string starts with a dangerous character, prefix it with an apostrophe
 * so spreadsheet applications treat it as a text literal.
 */
export function sanitizeCell(value: string): string {
  const firstChar = value.charAt(0);
  if (firstChar && FORMULA_INJECTION_CHARS.has(firstChar)) {
    return `'${value}`;
  }
  return value;
}

/**
 * Escape and quote a CSV field per RFC 4180.
 *
 * - Fields containing commas, double quotes, or newlines are wrapped in quotes
 * - Embedded double quotes are escaped by doubling them
 * - Formula injection sanitization is applied before quoting
 */
export function escapeCSVField(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = sanitizeCell(String(value));

  // Quote if the field contains special characters
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

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
  const headerLine = headers.map((h) => escapeCSVField(h.label)).join(',');

  const dataLines = rows.map((row) =>
    headers.map((h) => escapeCSVField(row[h.key])).join(','),
  );

  return [headerLine, ...dataLines].join('\r\n') + '\r\n';
}
