'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';
import type { ImportUnitsResponse } from '@/app/api/v1/import-units/contract';

export type { ImportUnitsResponse };

/** Preview (`dryRun`) or run a unit CSV import. A real import refreshes the units list. */
export function useImportUnits(communityId: number) {
  const qc = useQueryClient();
  return useMutation<ImportUnitsResponse, Error, { csv: string; dryRun: boolean }>({
    mutationFn: ({ csv, dryRun }) =>
      requestJson<ImportUnitsResponse>('/api/v1/import-units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, csv, dryRun }),
      }),
    onSuccess: (result) => {
      if (!result.dryRun && result.importedCount > 0) {
        void qc.invalidateQueries({ queryKey: ['units', communityId] });
      }
    },
  });
}
