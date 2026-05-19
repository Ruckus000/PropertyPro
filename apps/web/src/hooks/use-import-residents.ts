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
}

export interface CsvError {
  rowNumber: number;
  column: string | null;
  message: string;
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

// dryRunImport and executeImport differed only by the `dryRun` flag and the
// fallback error literal — collapsed into one parameterized helper. Behavior
// (URL/method/headers/body, the `.catch(() => null)` parse, the exact
// fallbacks, the whole-envelope return) is byte-identical to the originals.
async function performImport<T>(
  communityId: number,
  csvText: string,
  dryRun: boolean,
): Promise<T> {
  const response = await fetch('/api/v1/import-residents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ communityId, csv: csvText, dryRun }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(
      err?.message ?? (dryRun ? 'Failed to validate CSV' : 'Failed to import residents'),
    );
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
