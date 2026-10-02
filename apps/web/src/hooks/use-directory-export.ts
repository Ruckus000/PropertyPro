'use client';

import { useMutation } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';
import { saveCsvFile } from '@/lib/utils/save-csv-file';
import type { DirectoryExportResponse } from '@/app/api/v1/directory/export/contract';

export interface DirectoryExportInput {
  kind: 'units' | 'residents';
  /** Residents only: export just these (the selection) — members by user id… */
  userIds?: readonly string[];
  /** …and household members by occupant id. */
  occupantIds?: readonly number[];
}

/**
 * Directory CSV, built and audited on the server (columns follow the viewer's
 * permissions), then saved as a file.
 */
export function useDirectoryExport(communityId: number) {
  return useMutation<DirectoryExportResponse, Error, DirectoryExportInput>({
    mutationFn: ({ kind, userIds, occupantIds }) => {
      const params = new URLSearchParams({ communityId: String(communityId), kind });
      if (userIds?.length) params.set('userIds', userIds.join(','));
      if (occupantIds?.length) params.set('occupantIds', occupantIds.join(','));
      return requestJson<DirectoryExportResponse>(`/api/v1/directory/export?${params}`);
    },
    onSuccess: ({ csv, filename }) => saveCsvFile(csv, filename),
  });
}
