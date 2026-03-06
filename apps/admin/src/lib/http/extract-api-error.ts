/**
 * Extract a human-readable error message from a failed API response.
 */
export async function extractApiError(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as Record<string, unknown>;
    const errObj = json.error;
    if (errObj && typeof errObj === 'object') {
      const message = (errObj as Record<string, unknown>).message;
      if (typeof message === 'string' && message.length > 0) {
        return message;
      }
    }
  } catch {
    // Fall back when the response body is empty or not valid JSON.
  }

  return res.statusText || `HTTP ${res.status}`;
}
