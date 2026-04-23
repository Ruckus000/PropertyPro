/**
 * Sends a JSON request and returns the `.data` field of the response envelope.
 *
 * **Envelope contract:** every `/api/v1/*` route returns `{ data: T }` as its top-level
 * shape, where `T` is the resource-specific payload. `requestJson` unwraps `.data` and
 * returns `T` typed via the generic. Callers specify `requestJson<T>` where `T` is the
 * payload AFTER unwrapping.
 *
 * For paginated endpoints that return both data and pagination meta, the route MUST
 * return a double-wrapped body `{ data: { data: Item[], meta: {...} } }` so that the
 * hook's `requestJson<PaginatedResponse>` — where `PaginatedResponse = { data, meta }`
 * — resolves correctly. See `/api/v1/work-orders`, `/api/v1/reservations`,
 * `/api/v1/operations` for examples.
 */
export async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
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
