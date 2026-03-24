'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import type { EsignFieldDefinition } from '@propertypro/shared';
import type {
  EsignSignerRecord,
  EsignSubmissionRecord,
  EsignTemplateRecord,
  SubmitSignatureResult,
} from '@/lib/services/esign-service';

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

export interface SigningContext {
  signer: Pick<
    EsignSignerRecord,
    'id' | 'externalId' | 'email' | 'name' | 'role' | 'status'
  >;
  submission: Pick<
    EsignSubmissionRecord,
    | 'externalId'
    | 'status'
    | 'effectiveStatus'
    | 'messageSubject'
    | 'messageBody'
    | 'expiresAt'
  >;
  /** Subset of template fields for the signing UI (also returned by GET /api/v1/esign/sign/...). */
  template: Pick<EsignTemplateRecord, 'name' | 'description'> &
    Partial<Pick<EsignTemplateRecord, 'fieldsSchema'>>;
  fields: EsignFieldDefinition[];
  isWaiting: boolean;
  waitingFor: string | null;
  pdfUrl: string | null;
}

export function useSigningContext(submissionExternalId: string, slug: string) {
  return useQuery({
    queryKey: ['esign-signing', submissionExternalId, slug],
    queryFn: async () =>
      requestJson<SigningContext>(
        `/api/v1/esign/sign/${submissionExternalId}/${slug}`,
      ),
    enabled: !!submissionExternalId && !!slug,
    retry: false,
  });
}

export function useSubmitSignature(submissionExternalId: string, slug: string) {
  return useMutation({
    mutationFn: async (payload: {
      signedValues: Record<string, {
        fieldId: string;
        type: string;
        value: string;
        signedAt: string;
      }>;
      consentGiven: true;
    }) =>
      requestJson<SubmitSignatureResult>(
        `/api/v1/esign/sign/${submissionExternalId}/${slug}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        },
      ),
  });
}

export function useDeclineSigning(submissionExternalId: string, slug: string) {
  return useMutation({
    mutationFn: async (reason?: string) =>
      requestJson<{ success: boolean }>(
        `/api/v1/esign/sign/${submissionExternalId}/${slug}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'decline', reason }),
        },
      ),
  });
}
