/**
 * The first row per user, by request id. A user with duplicate deletion
 * requests that expire in the same cron run is ONE deleted account: one ban,
 * one email, one count. Pure, so the cron route's tests run it for real.
 */
export function onePerUser<T extends { id: number; userId: string }>(rows: T[]): T[] {
  const first = new Map<string, T>();
  for (const row of [...rows].sort((a, b) => a.id - b.id)) {
    if (!first.has(row.userId)) first.set(row.userId, row);
  }
  return [...first.values()];
}
