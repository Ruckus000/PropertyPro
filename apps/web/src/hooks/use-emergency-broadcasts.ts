"use client";

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ── Types ───────────────────────────────────────────────────────────────────

interface BroadcastSummary {
  id: number;
  title: string;
  severity: string;
  targetAudience: string;
  recipientCount: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  initiatedAt: string;
  completedAt: string | null;
  canceledAt: string | null;
}

interface BroadcastReport {
  id: number;
  communityId: number;
  title: string;
  body: string;
  smsBody: string | null;
  severity: string;
  templateKey: string | null;
  targetAudience: string;
  channels: string[];
  recipientCount: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  initiatedBy: string;
  initiatedAt: string;
  completedAt: string | null;
  canceledAt: string | null;
  recipients: Array<{
    userId: string;
    email: string | null;
    phone: string | null;
    fullName: string;
    smsStatus: string;
    emailStatus: string;
    smsSentAt: string | null;
    smsDeliveredAt: string | null;
    emailSentAt: string | null;
  }>;
}

interface CreateBroadcastParams {
  communityId: number;
  title: string;
  body: string;
  smsBody?: string;
  severity: 'emergency' | 'urgent' | 'info';
  templateKey?: string;
  targetAudience: 'all' | 'owners_only';
  channels: Array<'sms' | 'email'>;
}

interface CreateBroadcastResult {
  broadcastId: number;
  recipientCount: number;
  smsEligibleCount: number;
  emailCount: number;
}

interface EmergencyTemplate {
  key: string;
  label: string;
  severity: string;
  title: string;
  body: string;
  smsBody: string;
}

// ── Query keys ──────────────────────────────────────────────────────────────

const KEYS = {
  list: (communityId: number) => ['emergency-broadcasts', communityId] as const,
  detail: (communityId: number, id: number) => ['emergency-broadcasts', communityId, id] as const,
  templates: (communityId: number) => ['emergency-templates', communityId] as const,
};

// ── Hooks ───────────────────────────────────────────────────────────────────

export function useEmergencyBroadcasts(communityId: number) {
  return useQuery({
    queryKey: KEYS.list(communityId),
    queryFn: async () => {
      const res = await fetch(`/api/v1/emergency-broadcasts?communityId=${communityId}`);
      if (!res.ok) throw new Error('Failed to load broadcasts');
      const json = await res.json();
      return json.data as BroadcastSummary[];
    },
    enabled: communityId > 0,
  });
}

export function useEmergencyBroadcast(communityId: number, broadcastId: number) {
  return useQuery({
    queryKey: KEYS.detail(communityId, broadcastId),
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/emergency-broadcasts/${broadcastId}?communityId=${communityId}`,
      );
      if (!res.ok) throw new Error('Failed to load broadcast');
      const json = await res.json();
      return json.data as BroadcastReport;
    },
    enabled: communityId > 0 && broadcastId > 0,
    refetchInterval: (query) => {
      // Poll every 2s while broadcast is in-progress (not completed/canceled)
      const data = query.state.data;
      if (data && !data.completedAt && !data.canceledAt) return 2000;
      // Poll every 5s after completion (for final delivery status updates)
      if (data?.completedAt) return 5000;
      return false;
    },
  });
}

export function useEmergencyTemplates(communityId: number) {
  return useQuery({
    queryKey: KEYS.templates(communityId),
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/emergency-broadcasts/templates?communityId=${communityId}`,
      );
      if (!res.ok) throw new Error('Failed to load templates');
      const json = await res.json();
      return json.data as EmergencyTemplate[];
    },
    enabled: communityId > 0,
    staleTime: Infinity, // Templates are static
  });
}

export function useCreateBroadcast() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateBroadcastParams) => {
      const res = await fetch('/api/v1/emergency-broadcasts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message ?? 'Failed to create broadcast');
      }
      return (await res.json()) as CreateBroadcastResult;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: KEYS.list(variables.communityId) });
    },
  });
}

export function useSendBroadcast() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ broadcastId, communityId }: { broadcastId: number; communityId: number }) => {
      const res = await fetch(`/api/v1/emergency-broadcasts/${broadcastId}/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message ?? 'Failed to send broadcast');
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: KEYS.list(variables.communityId) });
      queryClient.invalidateQueries({
        queryKey: KEYS.detail(variables.communityId, variables.broadcastId),
      });
    },
  });
}

export function useCancelBroadcast() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ broadcastId, communityId }: { broadcastId: number; communityId: number }) => {
      const res = await fetch(`/api/v1/emergency-broadcasts/${broadcastId}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error ?? error.message ?? 'Failed to cancel');
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: KEYS.list(variables.communityId) });
      queryClient.invalidateQueries({
        queryKey: KEYS.detail(variables.communityId, variables.broadcastId),
      });
    },
  });
}
