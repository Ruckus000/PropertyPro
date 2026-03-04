/**
 * Demo login token utilities.
 *
 * @stub Function signatures defined for Task 2.4-2.6 type-checking.
 *       Full HMAC-SHA256 implementation is provided by Task 2.1.
 */

export interface DemoTokenPayload {
  /** The demo role: 'resident' for the owner portal, 'board' for the board portal. */
  role: 'resident' | 'board';
}

/**
 * Extracts the demo instance ID from a signed token without verifying the signature.
 * Used to look up the instance record before full validation.
 *
 * Returns null if the token is malformed or missing the instance ID.
 *
 * @stub Full implementation in Task 2.1
 */
export function extractDemoIdFromToken(_token: string): number | null {
  return null;
}

/**
 * Validates an HMAC-signed demo token against the given per-instance secret.
 * Returns the payload if the signature and expiry are valid, null otherwise.
 *
 * @stub Full implementation in Task 2.1
 */
export function validateDemoToken(
  _token: string,
  _secret: string,
): DemoTokenPayload | null {
  return null;
}
