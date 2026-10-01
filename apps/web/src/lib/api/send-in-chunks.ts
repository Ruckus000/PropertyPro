/**
 * Bulk per-recipient endpoints cap a request at {@link RECIPIENTS_PER_REQUEST}
 * (`/api/v1/invitations/batch`, `/api/v1/documents/send`), but "select all"
 * can pick more. Send in chunks, one at a time — the write rate limit is per
 * request — and if a chunk fails, report ITS recipients as failed rather than
 * throwing away the results of the chunks already sent.
 */
export const RECIPIENTS_PER_REQUEST = 100;

export async function sendInChunks<T>(
  userIds: readonly string[],
  send: (chunk: string[]) => Promise<T[]>,
  failed: (userId: string, error: unknown) => T,
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < userIds.length; i += RECIPIENTS_PER_REQUEST) {
    const chunk = userIds.slice(i, i + RECIPIENTS_PER_REQUEST);
    try {
      results.push(...(await send(chunk)));
    } catch (error) {
      results.push(...chunk.map((id) => failed(id, error)));
    }
  }
  return results;
}
