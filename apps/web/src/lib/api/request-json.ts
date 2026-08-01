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
 *
 * **Failures throw `ApiRequestError`, which carries the server's structured
 * detail** — see that class. Every existing caller keeps working unchanged: it
 * is an `Error` with the same `message` this used to throw.
 */

/** One field-level reason from a server `ValidationError`. */
export interface ApiErrorField {
  field: string;
  message: string;
}

/**
 * A non-2xx `/api/v1/*` response, with whatever structure the server attached.
 *
 * An `Error` subclass rather than a new return shape, deliberately. Roughly 50
 * modules call `requestJson`, and every one of them treats a rejection as
 * `error.message`; widening the thrown value would have meant touching all of
 * them to gain detail one of them needs. Subclassing costs those callers
 * nothing — `instanceof Error`, `error.message` and React Query's `Error`
 * typing all still hold — and lets the caller that wants more narrow with
 * `instanceof ApiRequestError`.
 *
 * It exists for a concrete dead end: `publishCommunitySite` refuses a publish
 * on page-set grounds with `ValidationError('This site cannot be published
 * yet.', { fields: [...] })`, where `fields` names the offending pages and what
 * is wrong with each. That array was dropped here, so the publish receipt could
 * only say "This site cannot be published yet… Try publishing again" — advice
 * for an action guaranteed to fail forever.
 */
export class ApiRequestError extends Error {
  /** HTTP status of the failed response. */
  readonly status: number;
  /** The server's `error.code`, e.g. `VALIDATION_ERROR`. */
  readonly code: string | undefined;
  /** The server's `error.details`, verbatim and unvalidated beyond being an object. */
  readonly details: Record<string, unknown> | undefined;
  /**
   * `details.fields`, when it is well-formed.
   *
   * Narrowed here rather than at each call site, and narrowed defensively: a
   * malformed `details` yields `undefined`, never a partly-typed array. A UI
   * rendering this would otherwise print `undefined` at a PM mid-publish.
   */
  readonly fields: ApiErrorField[] | undefined;

  constructor(
    message: string,
    init: { status: number; code?: string; details?: Record<string, unknown> },
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.fields = readFields(init.details);
  }
}

function readFields(details: Record<string, unknown> | undefined): ApiErrorField[] | undefined {
  const raw = details?.['fields'];
  if (!Array.isArray(raw)) return undefined;
  const parsed = raw.filter(
    (entry): entry is ApiErrorField =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as ApiErrorField).field === 'string' &&
      typeof (entry as ApiErrorField).message === 'string',
  );
  return parsed.length > 0 ? parsed : undefined;
}

export async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const json = (await response.json()) as {
    data?: T;
    error?: { message?: string; code?: string; details?: Record<string, unknown> };
  };
  if (!response.ok) {
    throw new ApiRequestError(json.error?.message ?? 'Request failed', {
      status: response.status,
      ...(json.error?.code === undefined ? {} : { code: json.error.code }),
      ...(json.error?.details === undefined ? {} : { details: json.error.details }),
    });
  }
  if (json.data === undefined) {
    throw new Error('Missing response payload');
  }
  return json.data;
}
