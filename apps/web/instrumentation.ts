/**
 * Next.js instrumentation hook.
 *
 * Conditionally imports Sentry config based on the runtime environment.
 * This file is loaded once when Next.js starts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}
