/**
 * Source of truth for `pending_signups` structured address columns
 * (migration `0145_pending_signups_structured_address`).
 *
 * Keep readiness checks, signup error handling, and tests aligned on this list.
 */
export const REQUIRED_PENDING_SIGNUP_STRUCTURED_ADDRESS_COLUMNS = [
  'address_line_1',
  'city',
  'state',
  'zip_code',
] as const;

export type PendingSignupStructuredAddressColumn =
  (typeof REQUIRED_PENDING_SIGNUP_STRUCTURED_ADDRESS_COLUMNS)[number];

/** Set for 42703 undefined-column handling in signup insert/update paths. */
export const PENDING_SIGNUP_STRUCTURED_ADDRESS_DB_COLUMN_SET: ReadonlySet<PendingSignupStructuredAddressColumn> =
  new Set(REQUIRED_PENDING_SIGNUP_STRUCTURED_ADDRESS_COLUMNS);

/**
 * Comma-separated string literals for `IN (...)` against
 * `information_schema.columns.column_name` (values from trusted constant only).
 */
export const PENDING_SIGNUP_STRUCTURED_ADDRESS_COLUMN_NAMES_IN_SQL: string = [
  ...REQUIRED_PENDING_SIGNUP_STRUCTURED_ADDRESS_COLUMNS,
]
  .map((c) => `'${c.replace(/'/g, "''")}'`)
  .join(', ');
