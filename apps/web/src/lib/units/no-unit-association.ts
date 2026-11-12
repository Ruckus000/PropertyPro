/**
 * Error code for a 403 whose only cause is that the signed-in resident has no
 * unit linked in this community.
 *
 * A bare 403 cannot carry that meaning: the same routes also answer 403 when a
 * feature is off or the role is wrong. The resident pages need to tell "your
 * manager has not linked your unit yet" (a setup gap, shown calmly, with a way
 * to reach management) apart from a real failure (shown as an error with
 * Retry), so the routes name it.
 *
 * Kept in its own dependency-free module so client components can import it
 * without pulling in the database-reading `actor-units.ts`.
 */
export const NO_UNIT_ASSOCIATION_CODE = 'NO_UNIT_ASSOCIATION';

/** True when `error` is an API failure caused only by a missing unit link. */
export function isNoUnitAssociationError(error: unknown): boolean {
  return (
    typeof error === 'object'
    && error !== null
    && (error as { status?: unknown }).status === 403
    && (error as { code?: unknown }).code === NO_UNIT_ASSOCIATION_CODE
  );
}
