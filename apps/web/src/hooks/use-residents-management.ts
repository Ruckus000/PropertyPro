'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { ResidentFormSubmitValues } from '@/components/residents/resident-form';
import { ApiRequestError, requestJson } from '@/lib/api/request-json';
import { limitMessageOf, sendInChunks } from '@/lib/api/send-in-chunks';

/**
 * `no_login` never comes from the residents API: it marks a household member
 * (`/api/v1/occupants`) merged into the Directory's list — someone on file
 * with no portal account at all.
 */
export type ResidentPortalStatus = 'active' | 'invited' | 'not_invited' | 'no_login';

export interface ResidentRecord {
  userId: string;
  fullName: string | null;
  email: string | null;
  role: string;
  unitId: number | null;
  phone: string | null;
  isUnitOwner: boolean;
  designation: 'board_president' | 'board_member' | null;
  portalStatus: ResidentPortalStatus;
  lastSignInAt: string | null;
  lastInvitedAt: string | null;
  /** Membership version; sent back as `expectedUpdatedAt` so a stale edit is refused. */
  updatedAt: string;
  /** Set only on household members: the `unit_occupants` id (their `userId` is synthetic). */
  occupantId?: number;
  /** Household members: part of the owner's household (true) or a tenant's. */
  ownerHousehold?: boolean;
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

/**
 * The server's reason from an error body, or the fallback. API errors are
 * `{ error: { message } }` (AppError.toJSON); these hooks used to read a
 * top-level `message` the API never sends, so every refusal — a duplicate
 * email above all — showed only the generic fallback.
 */
function apiErrorMessage(body: unknown, fallback: string): string {
  const message = (body as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

export function useResidentsList(
  communityId: number,
  options?: { enabled?: boolean },
): UseQueryResult<ResidentRecord[], Error> {
  return useQuery<ResidentRecord[], Error>({
    queryKey: ['residents', communityId],
    enabled: options?.enabled !== false,
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
        throw new Error(apiErrorMessage(await response.json().catch(() => null), 'Failed to send invitation'));
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
        throw new Error(apiErrorMessage(await response.json().catch(() => null), 'Failed to add resident'));
      }
      const json = (await response.json()) as { data: CreateResidentResult };
      return json.data;
    },
    onSuccess: options?.onSuccess,
  });
}

export interface UpdateResidentInput {
  userId: string;
  fullName?: string;
  phone?: string | null;
  /** Changing it is the Directory's "Move to another unit". */
  unitId?: number | null;
  isUnitOwner?: boolean;
  /** The resident's `updatedAt` as shown: a save over someone else's change is refused (409). */
  expectedUpdatedAt?: string;
}

export function useUpdateResident(communityId: number) {
  const qc = useQueryClient();
  return useMutation<unknown, Error, UpdateResidentInput>({
    mutationFn: (input) =>
      requestJson('/api/v1/residents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, ...input }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['residents', communityId] }),
    // Someone else saved first: fetch their version, so what is on screen —
    // and the token the next save sends — is current.
    onError: (error) => {
      if (error instanceof ApiRequestError && error.status === 409) {
        void qc.invalidateQueries({ queryKey: ['residents', communityId] });
      }
    },
  });
}

export function useRemoveResident(communityId: number) {
  const qc = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (userId) =>
      requestJson('/api/v1/residents', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, userId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['residents', communityId] }),
  });
}

export interface BatchInviteResult {
  userId: string;
  status: 'sent' | 'failed';
  error?: string;
  /** Set when this recipient's chunk was refused by the email cap. */
  limitMessage?: string;
}

/** One request for many invites: the per-user write limit is 30/min. */
export function useBatchInvite(communityId: number) {
  const qc = useQueryClient();
  return useMutation<BatchInviteResult[], Error, string[]>({
    mutationFn: (userIds) =>
      sendInChunks<BatchInviteResult>(
        userIds,
        async (chunk) =>
          (
            await requestJson<{ results: BatchInviteResult[] }>('/api/v1/invitations/batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ communityId, userIds: chunk }),
            })
          ).results,
        (userId, error) => ({
          userId,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Could not send the invitation',
          ...limitMessageOf(error),
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['residents', communityId] }),
  });
}
