'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EsignTemplateRecord } from '@/lib/services/esign-service';

export const ESIGN_TEMPLATE_KEYS = {
  all: ['esign-templates'] as const,
  list: (communityId: number, filters?: Record<string, string>) =>
    [...ESIGN_TEMPLATE_KEYS.all, 'list', communityId, filters ?? {}] as const,
  detail: (communityId: number, id: number) =>
    [...ESIGN_TEMPLATE_KEYS.all, 'detail', communityId, id] as const,
};

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const json = (await response.json()) as {
    data?: T;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(json.error?.message ?? 'Request failed');
  }
  if (json.data === undefined) {
    throw new Error('Missing response payload');
  }
  return json.data;
}

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
      requestJson<void>(`/api/v1/esign/templates/${templateId}?communityId=${communityId}`, {
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
