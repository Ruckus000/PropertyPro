/**
 * Supabase Auth admin double for the integration suite.
 *
 * `setup-integration.ts` routes `createAdminClient().auth.admin.createUser`
 * here. Like real GoTrue it echoes a caller-supplied `id` and otherwise mints a
 * fresh UUID (the stub used to return the literal 'test-auth-user', which no
 * uuid column — e.g. `pending_signups.auth_user_id` — can store, so any path
 * that creates an auth user without pre-choosing its id could not be exercised).
 *
 * Tests can read every call back, and make the next call for one email fail
 * the way GoTrue reports a failure (`{ data: { user: null }, error }`).
 */
import { randomUUID } from 'node:crypto';

export interface CapturedAuthCreateUser {
  email: string | undefined;
  /** The id returned, or null when the call was made to fail. */
  id: string | null;
}

export const INJECTED_AUTH_CREATE_USER_ERROR = 'injected: auth admin createUser failed';

const calls: CapturedAuthCreateUser[] = [];
const failNextFor = new Set<string>();

export async function authAdminCreateUserDouble(attrs?: { id?: string; email?: string }) {
  const email = attrs?.email;
  if (email !== undefined && failNextFor.delete(email)) {
    calls.push({ email, id: null });
    return {
      data: { user: null },
      error: { name: 'AuthApiError', status: 500, message: INJECTED_AUTH_CREATE_USER_ERROR },
    };
  }
  const id = attrs?.id ?? randomUUID();
  calls.push({ email, id });
  return { data: { user: { id } }, error: null };
}

/** Make the next `createUser` for this email fail once. */
export function failNextAuthCreateUserFor(email: string): void {
  failNextFor.add(email);
}

export function getCapturedAuthCreateUsers(): readonly CapturedAuthCreateUser[] {
  return calls;
}

export function clearCapturedAuthCreateUsers(): void {
  calls.length = 0;
  failNextFor.clear();
}
