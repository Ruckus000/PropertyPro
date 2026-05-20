'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EsignTemplateRecord } from '@/lib/services/esign-service';
import { requestJson } from '@/lib/api/request-json';

export const ESIGN_TEMPLATE_KEYS = {
  all: ['esign-templates'] as const,
  list: (communityId: number, filters?: Record<string, string>) =>
    [...ESIGN_TEMPLATE_KEYS.all, 'list', communityId, filters ?? {}] as const,
  detail: (communityId: number, id: number) =>
    [...ESIGN_TEMPLATE_KEYS.all, 'detail', communityId, id] as const,
};

export function useEsignTemplates(
  communityId: number,
  filters?: { status?: string; type?: string },
) {
  return useQuery({
    queryKey: ESIGN_TEMPLATE_KEYS.list(communityId, filters as Record<string, string>),
    queryFn: async () => {
      const params = new URLSearchParams({ communityId: String(communityId) });
      if (filters?.status) params.set('status', filters.status);
      if (filters?.type) params.set('type', filters.type);
      return requestJson<EsignTemplateRecord[]>(`/api/v1/esign/templates?${params.toString()}`);
    },
    enabled: communityId > 0,
  });
}

export function useEsignTemplate(communityId: number, templateId: number | null) {
  return useQuery({
    queryKey: templateId
      ? ESIGN_TEMPLATE_KEYS.detail(communityId, templateId)
      : [...ESIGN_TEMPLATE_KEYS.all, 'detail', communityId, 'none'] as const,
    queryFn: async () =>
      requestJson<EsignTemplateRecord>(
        `/api/v1/esign/templates/${templateId}?communityId=${communityId}`,
      ),
    enabled: communityId > 0 && templateId !== null,
  });
}

export function useCreateEsignTemplate(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      name: string;
      templateType: string;
      sourceDocumentPath: string;
      fieldsSchema: unknown;
      description?: string;
    }) =>
      requestJson<EsignTemplateRecord>('/api/v1/esign/templates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...payload }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ESIGN_TEMPLATE_KEYS.all });
    },
  });
}

export function useUpdateEsignTemplate(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      templateId: number;
      name?: string;
      description?: string;
      fieldsSchema?: unknown;
    }) => {
      const { templateId, ...data } = payload;
      return requestJson<EsignTemplateRecord>(
        `/api/v1/esign/templates/${templateId}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ communityId, ...data }),
        },
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ESIGN_TEMPLATE_KEYS.all });
    },
  });
}

export function useArchiveEsignTemplate(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: number) =>
      requestJson<{ success: boolean }>(`/api/v1/esign/templates/${templateId}?communityId=${communityId}`, {
        method: 'DELETE',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ESIGN_TEMPLATE_KEYS.all });
    },
  });
}

export function useCloneEsignTemplate(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { templateId: number; name: string }) =>
      requestJson<EsignTemplateRecord>(
        `/api/v1/esign/templates/${payload.templateId}/clone`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ communityId, name: payload.name }),
        },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ESIGN_TEMPLATE_KEYS.all });
    },
  });
}

export interface PresignTemplateUploadInput {
  communityId: number;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface PresignTemplateUploadResult {
  path: string;
  uploadUrl: string;
  token: string;
}

// Documented exception to the requestJson rule: the component throws the
// bespoke literal 'Failed to prepare template PDF upload' regardless of the
// API's error.message, and the response is destructured manually
// (.data.path/.data.uploadUrl/.data.token) rather than via the standard
// `{ data: T }` unwrap. Raw fetch preserves both invariants byte-for-byte.
export function usePresignEsignTemplateUpload() {
  return useMutation<PresignTemplateUploadResult, Error, PresignTemplateUploadInput>({
    mutationFn: async (input) => {
      const res = await fetch('/api/v1/esign/templates/upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        throw new Error('Failed to prepare template PDF upload');
      }
      const body = (await res.json()) as { data: PresignTemplateUploadResult };
      return body.data;
    },
  });
}
