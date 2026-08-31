/**
 * Digest of a ballot's candidate selection (§718.128 secret ballot).
 *
 * ⚠️ **Import-free on purpose.** It lived in `elections-service.ts`, which pulls
 * in the scoped client and therefore throws `Missing DATABASE_URL` at module
 * load — so a unit test of this pure function died before its first assertion.
 * Fourth instance of that trap in this audit's remediation; pure logic must not
 * carry a database dependency.
 *
 * ── What it replaced ──
 *
 * Recognising a duplicate submission used to mean reading the ballot rows back
 * and comparing candidate ids. That read-back was the only reason
 * `election_ballots` needed a `submission_id`, and that column was the link
 * making a "secret" ballot traceable to a unit and a voter. Comparing digests
 * answers the same question with no path from a vote to a person.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-08.
 */
import { createHash } from 'node:crypto';

/**
 * Order-independent, salted digest of a selection.
 *
 * Sorted before hashing so the same candidates chosen in a different order are
 * the same ballot — which is what a resubmitting voter expects.
 *
 * SALTED with the election's own `ballotSalt` because the unsalted input is a
 * small set of integers: an observer holding the candidate list could otherwise
 * enumerate every possible ballot and match a stored digest back to a
 * selection, reconstructing exactly the secrecy this exists to provide.
 */
export function createSelectionDigest(
  ballotSalt: string,
  candidateIds: number[],
  isAbstention: boolean,
): string {
  const sorted = [...candidateIds].sort((a, b) => a - b).join(',');
  return createHash('sha256')
    .update(`${ballotSalt}:${isAbstention ? 'abstain' : sorted}`)
    .digest('hex');
}
