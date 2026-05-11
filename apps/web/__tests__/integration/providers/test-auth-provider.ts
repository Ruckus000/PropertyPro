import { AsyncLocalStorage } from 'node:async_hooks';

export interface TestAuthState {
  currentActorUserId: string | null;
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

  const userId = currentState?.currentActorUserId;
  if (!userId) {
    throw new Error('Test actor not set. Call setActor() before making requests.');
  }
  return userId;
}
