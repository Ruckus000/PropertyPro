/**
 * Extract a human-readable error message from a failed API response.
 *
 * Our API routes return `{ error: { code, message } }` — this helper safely
 * parses that shape and falls back to `Response.statusText`.
 */
export async function extractApiError(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as Record<string, unknown>;
    const errObj = json?.['error'];
    if (errObj && typeof errObj === 'object' && errObj !== null) {
      const msg = (errObj as Record<string, unknown>)['message'];
      if (typeof msg === 'string' && msg.length > 0) return msg;
    }
  } catch {
    // response body wasn't valid JSON — fall through
  }
  return res.statusText || `HTTP ${res.status}`;
}
