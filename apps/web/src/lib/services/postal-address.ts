/**
 * CAN-SPAM sender postal address formatting.
 *
 * ⚠️ **This module must stay import-free.** It lived in
 * `insurance-alert-processor.ts`, which imports `@propertypro/db/unsafe` and so
 * throws `Missing DATABASE_URL` at module load. That is invisible until a second
 * consumer without a database — a unit test, a client bundle — imports it and
 * every test in the file dies before a single assertion runs. Pure string
 * formatting has no business carrying a database dependency.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-11.
 */

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * The association's physical postal address as display lines, or null when it is
 * incomplete.
 *
 * CAN-SPAM requires a *valid* postal address, so a partial one is worse than
 * none: "123 Main St" with no city is not an address, and rendering it would
 * look compliant while satisfying nothing. Callers either use all of it or
 * omit the block.
 */
export function formatCommunityPostalAddress(community: {
  addressLine1: unknown;
  addressLine2: unknown;
  city: unknown;
  state: unknown;
  zipCode: unknown;
}): string[] | null {
  const line1 = nonEmpty(community.addressLine1);
  const city = nonEmpty(community.city);
  const state = nonEmpty(community.state);
  const zip = nonEmpty(community.zipCode);
  if (!line1 || !city || !state || !zip) return null;

  const lines = [line1];
  const line2 = nonEmpty(community.addressLine2);
  if (line2) lines.push(line2);
  lines.push(`${city}, ${state} ${zip}`);
  return lines;
}
