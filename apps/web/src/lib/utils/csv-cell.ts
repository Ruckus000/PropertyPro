/**
 * One CSV cell, RFC 4180-quoted and safe against formula injection.
 *
 * The single escaper for every CSV this app writes: the server exports
 * (`lib/services/csv-export.ts`) and the in-browser `CsvExportButton`. It
 * lives here, not in the service, because components may not import services
 * (`guard:component-service-imports`), and two copies had already drifted:
 * the server one turned every negative amount into text.
 *
 * P3-53 / OWASP: names and other free text reach these exports from public
 * forms, and a cell like `=HYPERLINK(...)` executes when an admin opens the
 * file. Prefixing an apostrophe makes the spreadsheet treat it as text.
 */

/** Plain numbers and amounts ("-12.50", "-$1,250.00", "+3", "15%") are data, not formulas. */
const NUMERIC_CELL = /^[-+]?\$?\d[\d,]*(\.\d+)?%?$/;

/** What starts a formula in Excel / Sheets. */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/**
 * Neutralise a text cell that a spreadsheet would execute. A plain number or
 * amount is left alone, so a negative ledger amount still sums.
 */
export function sanitizeCell(value: string): string {
  return FORMULA_TRIGGER.test(value) && !NUMERIC_CELL.test(value) ? `'${value}` : value;
}

/**
 * Escape and quote a field: formula-sanitise it, then quote it if it holds a
 * comma, double quote, CR or LF, doubling embedded quotes.
 *
 * Every value is sanitised by its string form, not only strings: a jsonb array
 * (`vendors.specialties` in the data export) stringifies to its first element,
 * which is user text. A number still passes untouched, because its string form
 * is plain digits that `NUMERIC_CELL` exempts.
 */
export function escapeCSVField(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = sanitizeCell(String(value));

  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}
