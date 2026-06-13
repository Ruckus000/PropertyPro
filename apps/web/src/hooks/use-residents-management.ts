'use client';

import {
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { ResidentFormSubmitValues } from '@/components/residents/resident-form';

export interface ResidentRecord {
  userId: string;
  fullName: string | null;
  email: string | null;
  role: string;
  unitId: number | null;
}

export interface CreateResidentResult {
  userId: string;
  isNewUser: boolean;
  invitationFailed: boolean;
}

// Documented exception to the requestJson rule: each mutation has bespoke
// per-operation fallback literals ('Failed to load residents', 'Failed to
// send invitation', 'Failed to add resident') that the component renders
// verbatim in inline error state, and the error-body parse uses
// `.catch(() => null)` (returns null instead of {}) which `requestJson`
// does not replicate. Raw fetch preserves both behaviors byte-for-byte.

export function useResidentsList(
  communityId: number,
): UseQueryResult<ResidentRecord[], Error> {
  return useQuery<ResidentRecord[], Error>({
    queryKey: ['residents', communityId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/residents?communityId=${communityId}`);
      if (!response.ok) {
        throw new Error('Failed to load residents');
      }
      const json = (await response.json()) as { data: ResidentRecord[] };
      return json.data;
    },
  });
}

export function useResendInvitation(
  communityId: number,
): UseMutationResult<void, Error, string> {
  return useMutation<void, Error, string>({
    mutationFn: async (userId) => {
      const response = await fetch('/api/v1/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, userId }),
      });
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(errorBody?.message ?? 'Failed to send invitation');
      }
    },
  });
}

export interface InviteResidentInput {
  values: ResidentFormSubmitValues;
  sendInvitation: boolean;
}

export interface UseInviteResidentOptions {
  onSuccess?: (data: CreateResidentResult) => void;
}

export function useInviteResident(
  communityId: number,
  options?: UseInviteResidentOptions,
): UseMutationResult<CreateResidentResult, Error, InviteResidentInput> {
  return useMutation<CreateResidentResult, Error, InviteResidentInput>({
    mutationFn: async ({ values, sendInvitation }) => {
      const response = await fetch('/api/v1/residents/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId,
          email: values.email,
          fullName: values.fullName,
          phone: values.phone || null,
          role: values.role,
          unitId: values.unitId,
          isUnitOwner: values.isUnitOwner,
          sendInvitation,
        }),
      });
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(errorBody?.message ?? 'Failed to add resident');
      }
      const json = (await response.json()) as { data: CreateResidentResult };
      return json.data;
    },
    onSuccess: options?.onSuccess,
  });
}
