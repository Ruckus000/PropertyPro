-- Narrow slug reservation to verified+ signups only.
-- Unverified (pending_verification) signups no longer block the slug,
-- preventing subdomain squatting by bots or bad actors.
DROP INDEX IF EXISTS pending_signups_candidate_slug_active_unique;
CREATE UNIQUE INDEX pending_signups_candidate_slug_active_unique
  ON pending_signups (candidate_slug)
  WHERE status NOT IN ('pending_verification', 'expired', 'completed');
