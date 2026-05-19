'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Account settings data hooks (B5 batch #19 drain).
 *
 * Drained verbatim from `account-settings-client.tsx`. These hooks
 * deliberately do NOT use the shared `requestJson` helper because each
 * call site renders a server-supplied error message literal verbatim and
 * relies on a specific `.catch(() => null)`-guarded parse / 404 short
 * circuit. Replicating the original fetch/parse byte-for-byte preserves
 * behavior exactly.
 *
 * NOTE: the Supabase-SDK password flow (signInWithPassword/updateUser) is
 * NOT an `/api/v1` call and intentionally stays in the component.
 */

// ── Deletion request shape (mirrors component) ──────────────

export interface DeletionRequest {
  id: number;
  status: 'cooling' | 'recovering' | 'purging' | 'completed' | 'canceled';
  coolingEndsAt: string;
  createdAt: string;
}

// ── Query key factory ───────────────────────────────────────

export const accountDeletionRequestKey = () =>
  ['account-deletion-request'] as const;

// ── Update profile (PATCH /api/v1/account/profile) ──────────

export interface UpdateProfileInput {
  fullName: string;
  phone: string | null;
}

/**
 * Mutation for the profile form. Resolves with the parsed error message on
 * a non-OK response by REJECTING with that exact literal, so the component
 * can surface `error.message` verbatim and fall back to its own copy.
 */
export function useUpdateProfile() {
  return useMutation<void, Error, UpdateProfileInput>({
    mutationFn: async ({ fullName, phone }) => {
      let res: Response;
      try {
        res = await fetch('/api/v1/account/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName,
            phone,
          }),
        });
      } catch {
        // Mirrors the component's original outer try/catch: any network /
        // unexpected failure surfaces this exact literal.
        throw new Error('An unexpected error occurred. Please try again.');
      }

      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(
          json?.error?.message ?? 'Failed to update profile. Please try again.',
        );
      }
    },
  });
}

// ── Deletion status (GET /api/v1/account/delete) ────────────

/**
 * Fetches the active deletion request. Mirrors the original `useQuery`
 * exactly: 404 → null, non-OK → throw, otherwise `json.data ?? null`.
 */
export function useDeletionStatus() {
  return useQuery<DeletionRequest | null>({
    queryKey: accountDeletionRequestKey(),
    queryFn: async () => {
      const res = await fetch('/api/v1/account/delete');
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch deletion status');
      const json = await res.json();
      return json.data ?? null;
    },
  });
}

// ── Request deletion (POST /api/v1/account/delete) ──────────

export function useRequestAccountDeletion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(
          json?.error?.message ?? 'Failed to request account deletion.',
        );
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountDeletionRequestKey() });
    },
  });
}

// ── Cancel deletion (DELETE /api/v1/account/delete) ─────────

export function useCancelAccountDeletion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/account/delete', {
        method: 'DELETE',
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(
          json?.error?.message ?? 'Failed to cancel account deletion.',
        );
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountDeletionRequestKey() });
    },
  });
}
