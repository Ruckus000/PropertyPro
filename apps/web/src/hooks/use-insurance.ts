'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';
import type { InsurancePolicyRecord, InsurancePolicyType } from '@/components/insurance/types';

export const insurancePoliciesKey = (communityId: number) =>
  ['insurance-policies', communityId] as const;

export function useInsurancePolicies({
  communityId,
  enabled = true,
}: {
  communityId: number;
  enabled?: boolean;
}) {
  return useQuery<InsurancePolicyRecord[]>({
    queryKey: insurancePoliciesKey(communityId),
    queryFn: async () => {
      const { policies } = await requestJson<{ policies: InsurancePolicyRecord[] }>(
        `/api/v1/insurance/policies?communityId=${communityId}`,
      );
      return policies ?? [];
    },
    enabled: enabled && communityId > 0,
  });
}

export interface InsurancePolicyInput {
  policyType: InsurancePolicyType;
  carrierName: string;
  policyNumber?: string | null;
  coverageSummary?: string | null;
  deductibleSummary?: string | null;
  effectiveAt?: string | null;
  expiresAt: string;
  agentName?: string | null;
  agentEmail?: string | null;
  agentPhone?: string | null;
  documentId?: number | null;
}

export function useCreateInsurancePolicy(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InsurancePolicyInput) =>
      requestJson<InsurancePolicyRecord>('/api/v1/insurance/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, ...input }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: insurancePoliciesKey(communityId) });
    },
  });
}

export function useUpdateInsurancePolicy(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<InsurancePolicyInput> & { id: number }) =>
      requestJson<InsurancePolicyRecord>('/api/v1/insurance/policies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, ...input }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: insurancePoliciesKey(communityId) });
    },
  });
}

export function useDeleteInsurancePolicy(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      requestJson<{ deleted: true; id: number }>(
        `/api/v1/insurance/policies?id=${id}&communityId=${communityId}`,
        { method: 'DELETE' },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: insurancePoliciesKey(communityId) });
    },
  });
}

export interface CertificateRequestInput {
  policyId: number;
  unitLabel: string;
  recipientName: string;
  recipientEmail: string;
  loanNumber?: string | null;
}

export function useRequestCertificate(communityId: number) {
  return useMutation({
    mutationFn: (input: CertificateRequestInput) =>
      requestJson<{ status: string; id?: number }>('/api/v1/insurance/certificate-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, ...input }),
      }),
  });
}
