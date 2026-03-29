/**
 * Shared URL utilities.
 *
 * Centralises the base-URL resolution that was previously duplicated across
 * many service files.
 */

/**
 * Returns the canonical base URL for the web app.
 *
 * Resolution order:
 *  1. `NEXT_PUBLIC_APP_URL` (explicit override, used in production)
 *  2. `VERCEL_URL` (auto-set by Vercel deployments, always HTTPS)
 *  3. Localhost fallback for local development
 */
export function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}
