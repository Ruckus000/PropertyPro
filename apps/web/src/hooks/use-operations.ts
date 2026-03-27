'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

export interface OperationsListItem {
  id: number;
  type: 'maintenance_request' | 'work_order';
  title: string;
  status: string;
  priority: string;
  unitId: number | null;
  createdAt: string;
}

export interface OperationsListResponse {
  data: OperationsListItem[];
  meta: {
    cursor: string | null;
    limit: number;
    partialFailure: boolean;
    unavailableSources: string[];
  };
}

export interface WorkOrderListItem {
  id: number;
  title: string;
  description: string | null;
  unitId: number | null;
  vendorId: number | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'created' | 'assigned' | 'in_progress' | 'completed' | 'closed';
  slaResponseHours: number | null;
  slaCompletionHours: number | null;
  assignedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReservationListItem {
  id: number;
  amenityId: number;
  unitId: number | null;
  status: 'confirmed' | 'cancelled';
  startTime: string;
  endTime: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export const OPERATIONS_KEYS = {
  all: ['operations'] as const,
  summary: (communityId: number) => ['operations', 'summary', communityId] as const,
  listRoot: (communityId: number) => ['operations', 'list', communityId] as const,
  list: (
    communityId: number,
    params?: { type?: string; status?: string; priority?: string; unitId?: number; cursor?: string | null; limit?: number },
  ) =>
    [
      'operations',
      'list',
      communityId,
      params?.type ?? 'all',
      params?.status ?? 'all',
      params?.priority ?? 'all',
      params?.unitId ?? 'all',
      params?.cursor ?? 'start',
      params?.limit ?? 'all',
    ] as const,
  detail: (communityId: number, itemId: number, type: OperationsListItem['type']) =>
    ['operations', 'detail', communityId, type, itemId] as const,
} as const;

export const WORK_ORDER_KEYS = {
  all: ['work-orders'] as const,
  list: (communityId: number, params?: { status?: string; unitId?: number }) =>
    ['work-orders', 'list', communityId, params?.status ?? 'all', params?.unitId ?? 'all'] as const,
  detail: (communityId: number, workOrderId: number) =>
    ['work-orders', 'detail', communityId, workOrderId] as const,
} as const;

export const RESERVATION_KEYS = {
  all: ['reservations'] as const,
  list: (communityId: number) => ['reservations', 'list', communityId] as const,
  detail: (communityId: number, reservationId: number) =>
    ['reservations', 'detail', communityId, reservationId] as const,
} as const;

export function useOperations(
  communityId: number,
  params?: { type?: string; status?: string; priority?: string; unitId?: number; cursor?: string | null; limit?: number },
) {
  const limit = Math.min(params?.limit ?? 50, 50);
  const cursor = params?.cursor ?? null;

  return useQuery({
    queryKey: OPERATIONS_KEYS.list(communityId, { ...params, limit, cursor }),
    queryFn: async () => {
      const searchParams = new URLSearchParams({
        communityId: String(communityId),
        limit: String(limit),
      });
      if (params?.type) searchParams.set('type', params.type);
      if (params?.status) searchParams.set('status', params.status);
      if (params?.priority) searchParams.set('priority', params.priority);
      if (params?.unitId) searchParams.set('unitId', String(params.unitId));
      if (cursor) searchParams.set('cursor', cursor);

      return requestJson<OperationsListResponse>(`/api/v1/operations?${searchParams.toString()}`);
    },
    enabled: communityId > 0,
    staleTime: 45_000,
  });
}

export function useWorkOrders(
  communityId: number,
  params?: { status?: WorkOrderListItem['status']; unitId?: number },
) {
  return useQuery({
    queryKey: WORK_ORDER_KEYS.list(communityId, params),
    queryFn: async () => {
      const searchParams = new URLSearchParams({ communityId: String(communityId) });
      if (params?.status) searchParams.set('status', params.status);
      if (params?.unitId) searchParams.set('unitId', String(params.unitId));

      return requestJson<WorkOrderListItem[]>(`/api/v1/work-orders?${searchParams.toString()}`);
    },
    enabled: communityId > 0,
    staleTime: 60_000,
  });
}

export function useReservations(communityId: number) {
  return useQuery({
    queryKey: RESERVATION_KEYS.list(communityId),
    queryFn: async () =>
      requestJson<ReservationListItem[]>(`/api/v1/reservations?communityId=${communityId}`),
    enabled: communityId > 0,
    staleTime: 60_000,
  });
}

export function useCancelReservation(communityId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (reservationId: number) =>
      requestJson<{ id: number; status: ReservationListItem['status'] }>(
        `/api/v1/reservations/${reservationId}/cancel`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ communityId }),
        },
      ),
    onSuccess: async (_data, reservationId) => {
      await queryClient.invalidateQueries({ queryKey: RESERVATION_KEYS.detail(communityId, reservationId) });
      await queryClient.invalidateQueries({ queryKey: RESERVATION_KEYS.list(communityId) });
      await queryClient.invalidateQueries({ queryKey: OPERATIONS_KEYS.listRoot(communityId) });
    },
  });
}
