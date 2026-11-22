'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listAllRequests,
  updateRequestStatus,
  type ListAllRequestsParams,
  type MaintenanceRequestItem,
} from '@/lib/api/admin-maintenance';
import { addComment, getRequest, listMyRequests } from '@/lib/api/maintenance-requests';
import { requestJson } from '@/lib/api/request-json';
import { retryUnlessRefused } from '@/lib/api/retry-unless-refused';
import type { BookingRules } from '@/lib/amenities/booking-rules';
import { walkAndSlice, walkPaginated } from '@/lib/api/walk-paginated';

export interface OperationsListItem {
  id: number;
  type: 'maintenance_request' | 'work_order' | 'reservation';
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

export interface WorkOrderListResponse {
  data: WorkOrderListItem[];
  meta: { page: number; limit: number; total: number };
}

export interface ReservationListResponse {
  data: ReservationListItem[];
  meta: { page: number; limit: number; total: number };
}

export interface VendorListItem {
  id: number;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  specialties: string[] | null;
  isActive: boolean;
}

export const WORK_ORDER_STATUSES = [
  'created',
  'assigned',
  'in_progress',
  'completed',
  'closed',
] as const;

export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

/**
 * Narrow an arbitrary string (e.g. a URL query param) to a WorkOrderStatus.
 * Returns `undefined` for unknown inputs so callers can pass `undefined` to
 * hooks that treat it as "no filter" rather than coercing a bad value into
 * a typed slot and sending it to the API.
 */
export function parseWorkOrderStatus(value: string | undefined): WorkOrderStatus | undefined {
  if (!value) return undefined;
  return (WORK_ORDER_STATUSES as readonly string[]).includes(value)
    ? (value as WorkOrderStatus)
    : undefined;
}

export interface WorkOrderListItem {
  id: number;
  title: string;
  description: string | null;
  unitId: number | null;
  vendorId: number | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: WorkOrderStatus;
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

export type MaintenanceRequestScope = 'mine' | 'community';

export interface MaintenanceRequestListResponse {
  data: MaintenanceRequestItem[];
  meta: { total: number; page: number; limit: number };
}

/**
 * `placeholderData` for a list that "Load more" grows by asking for a larger
 * `limit` (the last segment of every list key below). While the longer list
 * loads, the rows already on screen stay; any other key change (community,
 * scope, filter) gets no placeholder, so one list's rows never stand in for
 * another's.
 */
function keepRowsWhileLimitGrows<T>(
  previousData: T | undefined,
  previousQuery: { queryKey: readonly unknown[] } | undefined,
  queryKey: readonly unknown[],
): T | undefined {
  if (previousData === undefined || !previousQuery) return undefined;
  const previousKey = previousQuery.queryKey;
  if (previousKey.length !== queryKey.length) return undefined;
  const lastIndex = queryKey.length - 1;
  const sameListOtherwise = previousKey.every(
    (part, index) => index === lastIndex || Object.is(part, queryKey[index]),
  );
  return sameListOtherwise ? previousData : undefined;
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

export const MAINTENANCE_REQUEST_KEYS = {
  /** Every maintenance-request list and detail. */
  all: ['maintenance-requests'] as const,
  detail: (communityId: number, requestId: number) =>
    ['maintenance-requests', 'detail', communityId, requestId] as const,
  list: (
    communityId: number,
    scope: MaintenanceRequestScope,
    params?: ListAllRequestsParams,
  ) => [
    'maintenance-requests',
    'list',
    scope,
    communityId,
    params?.status ?? 'all',
    params?.category ?? 'all',
    params?.priority ?? 'all',
    params?.assignedToId ?? 'all',
    params?.page ?? 1,
    params?.limit ?? 20,
  ] as const,
} as const;

export const WORK_ORDER_KEYS = {
  all: ['work-orders'] as const,
  list: (
    communityId: number,
    params?: { status?: string; unitId?: number; page?: number; limit?: number },
  ) => [
    'work-orders', 'list', communityId,
    params?.status ?? 'all',
    params?.unitId ?? 'all',
    params?.page ?? 1,
    params?.limit ?? 20,
  ] as const,
  detail: (communityId: number, workOrderId: number) =>
    ['work-orders', 'detail', communityId, workOrderId] as const,
} as const;

export const RESERVATION_KEYS = {
  all: ['reservations'] as const,
  list: (communityId: number, params?: { page?: number; limit?: number }) =>
    ['reservations', 'list', communityId, params?.page ?? 1, params?.limit ?? 20] as const,
  detail: (communityId: number, reservationId: number) =>
    ['reservations', 'detail', communityId, reservationId] as const,
} as const;

export function useOperations(
  communityId: number,
  params?: { type?: string; status?: string; priority?: string; unitId?: number; cursor?: string | null; limit?: number },
  options?: { enabled?: boolean },
) {
  const limit = Math.min(params?.limit ?? 50, 50);
  const cursor = params?.cursor ?? null;
  const enabled = options?.enabled ?? true;

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
    enabled: enabled && communityId > 0,
    staleTime: 45_000,
  });
}

export function useWorkOrders(
  communityId: number,
  params?: { status?: WorkOrderListItem['status']; unitId?: number; page?: number; limit?: number },
  options?: { enabled?: boolean; keepRowsWhileLoadingMore?: boolean },
) {
  const enabled = options?.enabled ?? true;
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;
  const queryKey = WORK_ORDER_KEYS.list(communityId, { ...params, page, limit });

  // Explicit: two context-sensitive callbacks leave the data type inferred as `{}`.
  return useQuery<WorkOrderListResponse>({
    queryKey,
    placeholderData: options?.keepRowsWhileLoadingMore
      ? (previousData, previousQuery) => keepRowsWhileLimitGrows(previousData, previousQuery, queryKey)
      : undefined,
    queryFn: ({ signal }): Promise<WorkOrderListResponse> => {
      // Plan B3: route emits the canonical paginated envelope; consumer
      // walks all pages then JS-slices to the requested `page`+`limit`
      // window. Shared `walkAndSlice` helper handles the slice math
      // (same pattern as #228 violations + #237 maintenance-requests).
      const baseParams: Record<string, string> = {
        communityId: String(communityId),
      };
      if (params?.status) baseParams.status = params.status;
      if (params?.unitId) baseParams.unitId = String(params.unitId);

      return walkAndSlice<WorkOrderListItem>('/api/v1/work-orders', baseParams, {
        page,
        limit,
        signal,
      });
    },
    enabled: enabled && communityId > 0,
    staleTime: 60_000,
  });
}

export function useMaintenanceRequests(
  communityId: number,
  options?: {
    scope?: MaintenanceRequestScope;
    params?: ListAllRequestsParams;
    enabled?: boolean;
    keepRowsWhileLoadingMore?: boolean;
  },
) {
  const enabled = options?.enabled ?? true;
  const scope = options?.scope ?? 'mine';
  const params = options?.params;
  const queryKey = MAINTENANCE_REQUEST_KEYS.list(communityId, scope, params);

  return useQuery({
    queryKey,
    placeholderData: options?.keepRowsWhileLoadingMore
      ? (previousData, previousQuery) => keepRowsWhileLimitGrows(previousData, previousQuery, queryKey)
      : undefined,
    queryFn: async (): Promise<MaintenanceRequestListResponse> => {
      if (scope === 'community') {
        return listAllRequests(communityId, params);
      }

      return listMyRequests(communityId, {
        status: params?.status,
        page: params?.page,
        limit: params?.limit,
      });
    },
    enabled: enabled && communityId > 0,
    staleTime: 45_000,
  });
}

/** One request with its comments — the Operations hub's detail panel. */
export function useMaintenanceRequest(
  communityId: number,
  requestId: number,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: MAINTENANCE_REQUEST_KEYS.detail(communityId, requestId),
    queryFn: async () => (await getRequest(requestId, communityId)).data,
    enabled: (options?.enabled ?? true) && communityId > 0 && requestId > 0,
    staleTime: 30_000,
    // A 403/404 `?request=` will not change on a second asking: show it at once.
    retry: retryUnlessRefused,
  });
}

export interface AddMaintenanceCommentInput {
  text: string;
  /**
   * A staff-only note. The API stores a resident's comment as non-internal
   * whatever is sent; only a manager's note is kept from the resident.
   */
  isInternal?: boolean;
}

export function useAddMaintenanceComment(communityId: number, requestId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ text, isInternal }: AddMaintenanceCommentInput) =>
      // Sent only when set, so a resident's request body is unchanged.
      (await addComment({ communityId, requestId, text, ...(isInternal ? { isInternal: true } : {}) })).data,
    onSuccess: async () => {
      // The detail shows the new comment; list rows carry the comments too.
      await queryClient.invalidateQueries({ queryKey: MAINTENANCE_REQUEST_KEYS.all });
    },
  });
}

export interface UpdateMaintenanceStatusInput {
  /** Omitted when the manager keeps the current status and only edits the notes. */
  status?: string;
  internalNotes?: string | null;
  resolutionDescription?: string | null;
  resolutionDate?: string | null;
}

export function useUpdateMaintenanceRequestStatus(communityId: number, requestId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateMaintenanceStatusInput) =>
      (await updateRequestStatus(requestId, communityId, input)).data,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: MAINTENANCE_REQUEST_KEYS.all });
      // The All tab lists requests with their status.
      await queryClient.invalidateQueries({ queryKey: OPERATIONS_KEYS.listRoot(communityId) });
    },
  });
}

export function useReservations(
  communityId: number,
  params?: { page?: number; limit?: number },
  options?: { enabled?: boolean; keepRowsWhileLoadingMore?: boolean },
) {
  const enabled = options?.enabled ?? true;
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;
  const queryKey = RESERVATION_KEYS.list(communityId, { page, limit });

  return useQuery({
    queryKey,
    placeholderData: options?.keepRowsWhileLoadingMore
      ? (previousData, previousQuery) => keepRowsWhileLimitGrows(previousData, previousQuery, queryKey)
      : undefined,
    queryFn: async () => {
      const sp = new URLSearchParams({
        communityId: String(communityId),
        page: String(page),
        limit: String(limit),
      });
      return requestJson<ReservationListResponse>(`/api/v1/reservations?${sp.toString()}`);
    },
    enabled: enabled && communityId > 0,
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
      await queryClient.invalidateQueries({ queryKey: RESERVATION_KEYS.all });
      await queryClient.invalidateQueries({ queryKey: OPERATIONS_KEYS.listRoot(communityId) });
    },
  });
}

export interface CreateMaintenanceRequestInput {
  title: string;
  description: string;
  category: 'plumbing' | 'electrical' | 'hvac' | 'general' | 'other';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  storagePaths?: string[];
}

export function useCreateMaintenanceRequest(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateMaintenanceRequestInput) =>
      requestJson<MaintenanceRequestItem>('/api/v1/maintenance-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'create', communityId, ...input }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['maintenance-requests', 'list'] });
      await queryClient.invalidateQueries({ queryKey: OPERATIONS_KEYS.listRoot(communityId) });
    },
  });
}

export interface CreateWorkOrderInput {
  title: string;
  description: string | null;
  unitId: number | null;
  vendorId: number | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  slaResponseHours: number | null;
  slaCompletionHours: number | null;
  notes: string | null;
}

export function useCreateWorkOrder(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateWorkOrderInput) =>
      requestJson<WorkOrderListItem>('/api/v1/work-orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...input }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: WORK_ORDER_KEYS.all });
      await queryClient.invalidateQueries({ queryKey: OPERATIONS_KEYS.listRoot(communityId) });
    },
  });
}

export interface CreateReservationInput {
  amenityId: number;
  unitId: number | null;
  startTime: string;
  endTime: string;
  notes: string | null;
}

export function useCreateReservation(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateReservationInput) =>
      requestJson<ReservationListItem>(
        `/api/v1/amenities/${input.amenityId}/reserve`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            communityId,
            unitId: input.unitId,
            startTime: input.startTime,
            endTime: input.endTime,
            notes: input.notes,
          }),
        },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RESERVATION_KEYS.all });
      await queryClient.invalidateQueries({ queryKey: OPERATIONS_KEYS.listRoot(communityId) });
    },
  });
}

export interface AmenityListItem {
  id: number;
  name: string;
  description: string | null;
  location: string | null;
  capacity: number | null;
  isBookable: boolean;
  bookingRules: BookingRules;
}

export const AMENITY_KEYS = {
  all: ['amenities'] as const,
  list: (communityId: number) => ['amenities', 'list', communityId] as const,
} as const;

export function useAmenities(communityId: number, options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  return useQuery({
    queryKey: AMENITY_KEYS.list(communityId),
    queryFn: ({ signal }) =>
      walkPaginated<AmenityListItem>(
        '/api/v1/amenities',
        { communityId: String(communityId) },
        { signal },
      ),
    enabled: enabled && communityId > 0,
    staleTime: 5 * 60_000,
  });
}

/** The fields the amenity form edits; `bookingRules` is replaced whole, so `{}` clears every limit. */
export interface AmenityInput {
  name: string;
  description: string | null;
  location: string | null;
  capacity: number | null;
  isBookable: boolean;
  bookingRules: BookingRules;
}

/** Create (POST /api/v1/amenities) or, with an `amenityId`, update (PATCH /api/v1/amenities/[id]). */
export function useSaveAmenity(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ amenityId, input }: { amenityId?: number; input: AmenityInput }) =>
      requestJson<AmenityListItem>(amenityId ? `/api/v1/amenities/${amenityId}` : '/api/v1/amenities', {
        method: amenityId ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...input }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: AMENITY_KEYS.list(communityId) });
    },
  });
}

export const VENDOR_KEYS = {
  all: ['vendors'] as const,
  list: (communityId: number) => ['vendors', 'list', communityId] as const,
} as const;

export function useVendors(communityId: number) {
  return useQuery({
    queryKey: VENDOR_KEYS.list(communityId),
    queryFn: ({ signal }) =>
      walkPaginated<VendorListItem>(
        '/api/v1/vendors',
        { communityId: String(communityId) },
        { signal },
      ),
    enabled: communityId > 0,
    staleTime: 5 * 60_000,
  });
}
