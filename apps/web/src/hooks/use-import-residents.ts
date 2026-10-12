'use client';

import { useMutation } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DryRunRow {
  name: string;
  email: string;
  role: string;
  unit_number: string | null;
  /** The row's line in the uploaded file (the header is line 1). */
  rowNumber: number;
  /** The email matches an account that already exists; the import attaches it. */
  existingAccount: boolean;
}

export interface CsvError {
  rowNumber: number;
  column: string | null;
  message: string;
  /** `already_member`: already in this community — done, not a problem to fix. */
  code?: 'already_member';
}

export interface DryRunResponse {
  data: {
    preview: DryRunRow[];
    errors: CsvError[];
    header: string[];
  };
}

export interface ImportResponse {
  data: {
    importedCount: number;
    skippedCount: number;
    errors: CsvError[];
  };
}

// ---------------------------------------------------------------------------
// API helpers (relocated verbatim from import-residents-client.tsx)
// ---------------------------------------------------------------------------

/**
 * A failed import request. `status` is the HTTP status, or `null` when no
 * response arrived (network failure, timeout) — the one case where the server
 * may have saved some rows before the browser gave up. A 4xx is a refusal
 * before any row was written (auth, plan, subscription, rate limit, input).
 */
export class ImportRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'ImportRequestError';
  }
}

// dryRunImport and executeImport differed only by the `dryRun` flag and the
// fallback error literal — collapsed into one parameterized helper.
async function performImport<T>(
  communityId: number,
  csvText: string,
  dryRun: boolean,
): Promise<T> {
  const fallback = dryRun ? 'Failed to validate CSV' : 'Failed to import residents';
  let response: Response;
  try {
    response = await fetch('/api/v1/import-residents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ communityId, csv: csvText, dryRun }),
    });
  } catch {
    throw new ImportRequestError(fallback, null);
  }
  if (!response.ok) {
    // `withErrorHandler` nests the message: `{ error: { code, message } }`.
    // Reading only a top-level `message` meant the server's own words never
    // reached the screen — every failure read "Failed to import residents".
    const err = await response.json().catch(() => null) as
      | { message?: string; error?: { message?: string } }
      | null;
    throw new ImportRequestError(err?.error?.message ?? err?.message ?? fallback, response.status);
  }
  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Dry-run validation mutation for the bulk resident-import wizard.
 *
 * Documented exception to the requestJson rule: the route returns a
 * non-standard `{ message }` error body and the component renders
 * `mutation.error.message` verbatim, so the raw `fetch` + `.catch(() => null)`
 * parse + exact `err?.message ?? 'Failed to validate CSV'` literal is
 * preserved. The success body is the whole `{ data }` envelope (the component
 * reads `data.data`) — returned exactly as-is.
 *
 * Wizard state side-effects (`setDryRunData` / `setStep`) intentionally stay
 * in the component via per-call `mutate(csv, { onSuccess })`.
 */
export function useDryRunImport(communityId: number) {
  return useMutation<DryRunResponse, Error, string>({
    mutationFn: (csv: string) => performImport<DryRunResponse>(communityId, csv, true),
  });
}

/**
 * Execute (non-dry-run) bulk resident import.
 *
 * Same documented exception as {@link useDryRunImport}: raw `fetch` +
 * `.catch(() => null)` + exact `err?.message ?? 'Failed to import residents'`
 * literal preserved; success returns the whole `{ data }` envelope.
 *
 * Wizard state side-effects (`setImportResult` / `setStep`) stay in the
 * component via per-call `mutate(csv, { onSuccess })`.
 */
export function useImportResidents(communityId: number) {
  return useMutation<ImportResponse, Error, string>({
    mutationFn: (csv: string) => performImport<ImportResponse>(communityId, csv, false),
  });
}
