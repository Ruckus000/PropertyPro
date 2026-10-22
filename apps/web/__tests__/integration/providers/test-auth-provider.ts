import { AsyncLocalStorage } from 'node:async_hooks';
import { UnauthorizedError } from '@/lib/api/errors';

/**
 * Session double for the integration suite.
 *
 * `setup-integration.ts` routes `requireAuthenticatedUserId()` here, because a
 * vanilla Postgres (CI's integration container) has no Supabase Auth to hold a
 * session. Only the IDENTITY is supplied: everything a route does with that id
 * afterwards — membership lookup, role resolution, permission checks, tenant
 * scoping — is the real code against the real database.
 */
export interface TestAuthState {
  currentActorUserId: string | null;
  /**
   * Signed out. The double then throws `UnauthorizedError`, exactly as the real
   * gate does when `supabase.auth.getUser()` finds no session. Distinct from a
   * null actor, which means a test forgot to pick one and throws a plain Error.
   */
  signedOut?: boolean;
}

let currentState: TestAuthState | null = null;
const actorStorage = new AsyncLocalStorage<string>();

export function registerTestAuthState(state: TestAuthState): void {
  currentState = state;
}

export function clearTestAuthState(): void {
  currentState = null;
}

export function runWithTestAuthUserId<T>(userId: string, callback: () => T): T {
  return actorStorage.run(userId, callback);
}

export function getTestAuthUserId(): string {
  const asyncActorUserId = actorStorage.getStore();
  if (asyncActorUserId) {
    return asyncActorUserId;
  }

  if (currentState?.signedOut) {
    throw new UnauthorizedError();
  }

  const userId = currentState?.currentActorUserId;
  if (!userId) {
    throw new Error('Test actor not set. Call setActor() before making requests.');
  }
  return userId;
}
