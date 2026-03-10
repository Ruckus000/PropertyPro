export interface TestAuthState {
  currentActorUserId: string | null;
}

let currentState: TestAuthState | null = null;

export function registerTestAuthState(state: TestAuthState): void {
  currentState = state;
}

export function clearTestAuthState(): void {
  currentState = null;
}

export function getTestAuthUserId(): string {
  const userId = currentState?.currentActorUserId;
  if (!userId) {
    throw new Error('Test actor not set. Call setActor() before making requests.');
  }
  return userId;
}
