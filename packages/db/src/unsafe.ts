/**
 * Unsafe DB access surface.
 *
 * This module is the only sanctioned escape hatch for unscoped database access.
 * Importers must treat usage as an exception and justify it in code review.
 */
import { db } from './drizzle';

export { findCommunityBySlugUnscoped } from './queries/community-lookup';
export {
  claimDigestQueueRows,
  findCandidateDigestCommunityIds,
  hasMoreDigestRows,
} from './queries/notification-digest';
export type { DigestFrequency } from './queries/notification-digest';

/**
 * Returns the raw Drizzle client without tenant scoping.
 * Use only for deliberate, reviewed escape-hatch flows.
 */
export function createUnscopedClient(): typeof db {
  return db;
}
