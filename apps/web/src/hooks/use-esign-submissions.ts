'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  EsignSubmissionListRow,
  EsignSubmissionRecord,
  EsignSignerRecord,
  EsignEventRecord,
} from '@/lib/services/esign-service';
import type { EsignFieldsSchema } from '@propertypro/shared';
import { requestJson } from '@/lib/api/request-json';

export const ESIGN_SUBMISSION_KEYS = {
  all: ['esign-submissions'] as const,
  list: (communityId: number, filters?: Record<string, string>) =>
    [...ESIGN_SUBMISSION_KEYS.all, 'list', communityId, filters ?? {}] as const,
  detail: (communityId: number, id: number) =>
    [...ESIGN_SUBMISSION_KEYS.all, 'detail', communityId, id] as const,
};

export function useEsignSubmissions(
  communityId: number,
  filters?: { status?: string },
) {
  return useQuery({
    // Keep showing the previous page while a filter/page change refetches.
    placeholderData: keepPreviousData,
    queryKey: ESIGN_SUBMISSION_KEYS.list(communityId, filters as Record<string, string>),
    queryFn: async () => {
      const params = new URLSearchParams({ communityId: String(communityId) });
      if (filters?.status) params.set('status', filters.status);
      return requestJson<EsignSubmissionListRow[]>(
        `/api/v1/esign/submissions?${params.toString()}`,
      );
    },
    enabled: communityId > 0,
  });
}

export function useEsignSubmission(communityId: number, submissionId: number | null) {
  return useQuery({
    queryKey: submissionId
      ? ESIGN_SUBMISSION_KEYS.detail(communityId, submissionId)
      : [...ESIGN_SUBMISSION_KEYS.all, 'detail', communityId, 'none'] as const,
    queryFn: async () =>
      requestJson<{
        submission: EsignSubmissionRecord;
        signers: EsignSignerRecord[];
        events: EsignEventRecord[];
        previewPdfUrl: string | null;
        downloadUrl: string | null;
      }>(`/api/v1/esign/submissions/${submissionId}?communityId=${communityId}`),
    enabled: communityId > 0 && submissionId !== null,
  });
}

export function useCreateEsignSubmission(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      /** Exactly one of `templateId` or `document`; the route enforces it. */
      templateId?: number;
      /** A send that carries its own PDF and layout, with no template saved. */
      document?: {
        name: string;
        sourceDocumentPath: string;
        fieldsSchema: EsignFieldsSchema;
      };
      signers: Array<{
        email: string;
        name: string;
        role: string;
        sortOrder: number;
        userId?: string;
      }>;
      signingOrder: 'parallel' | 'sequential';
      sendEmail: boolean;
      expiresAt?: string;
      messageSubject?: string;
      messageBody?: string;
      linkedDocumentId?: number;
    }) =>
      requestJson<{ submission: EsignSubmissionRecord; signers: EsignSignerRecord[] }>(
        '/api/v1/esign/submissions',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ communityId, ...payload }),
        },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ESIGN_SUBMISSION_KEYS.all });
    },
  });
}

export function useCancelEsignSubmission(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (submissionId: number) =>
      requestJson<{ success: boolean }>(`/api/v1/esign/submissions/${submissionId}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ESIGN_SUBMISSION_KEYS.all });
    },
  });
}

export function useSendEsignReminder(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { submissionId: number; signerId: number }) =>
      requestJson<{ success: boolean }>(
        `/api/v1/esign/submissions/${payload.submissionId}/remind`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ communityId, signerId: payload.signerId }),
        },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ESIGN_SUBMISSION_KEYS.all });
    },
  });
}
