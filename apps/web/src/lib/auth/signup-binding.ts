/**
 * Browser binding for email-first sign-in links.
 *
 * `/auth/verify-signup` signs in whichever browser opens an email-first link,
 * so a link the attacker requested for THEIR OWN address, opened by someone
 * else, would sign that person into the attacker's account (login CSRF): they
 * would then fill in and pay for a community the attacker owns.
 *
 * The requesting browser holds a random nonce in a cookie; the link carries
 * only its SHA-256 (`b`). Verification proceeds only when the opening browser's
 * cookie hashes to `b`. An attacker cannot plant our cookie in another person's
 * browser without XSS, and the link alone does not reveal the nonce.
 *
 * Set client-side on purpose: `/signup/start` is a `runRoute` JSON route, and
 * `guard:contracts` is closed to new set-cookie routes (CON-07). No server
 * secret is involved.
 *
 * Isomorphic: Web Crypto exists in browsers, Node 22 and the Edge runtime.
 */
export const SIGNUP_BINDING_COOKIE = 'pp_signup_binding';
export const SIGNUP_BINDING_MAX_AGE_S = 24 * 60 * 60;
export const SIGNUP_BINDING_PATTERN = /^[0-9a-f]{64}$/;

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time for equal-length hex; the inputs are hashes, never secrets themselves. */
export function bindingMatches(expected: string, actual: string): boolean {
  if (expected.length !== actual.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  return diff === 0;
}
