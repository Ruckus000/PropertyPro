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

/** Clears both the `createUser` and the `updateUserById` call logs and hooks. */
export function clearCapturedAuthCreateUsers(): void {
  calls.length = 0;
  failNextFor.clear();
  updateCalls.length = 0;
  failNextUpdateFor.clear();
}

// ---------------------------------------------------------------------------
// updateUserById: succeeds, unless a test made the next call for that id fail.
// The account-deletion purge rewrites auth.users through it, so this is what
// lets an integration test drive a purge to completion, or crash it part way.
// ---------------------------------------------------------------------------

export interface InjectedAuthUpdateError {
  status: number;
  code?: string;
  message: string;
}

export const INJECTED_AUTH_UPDATE_USER_ERROR: InjectedAuthUpdateError = {
  status: 500,
  message: 'injected: auth admin updateUserById failed',
};

const updateCalls: string[] = [];
const failNextUpdateFor = new Map<string, InjectedAuthUpdateError>();

export async function authAdminUpdateUserByIdDouble(id: string, _attrs?: unknown) {
  updateCalls.push(id);
  const failure = failNextUpdateFor.get(id);
  if (failure) {
    failNextUpdateFor.delete(id);
    return { data: { user: null }, error: { name: 'AuthApiError', ...failure } };
  }
  return { data: { user: { id } }, error: null };
}

/** Make the next `updateUserById` for this user id fail once. */
export function failNextAuthUpdateUserFor(
  id: string,
  error: InjectedAuthUpdateError = INJECTED_AUTH_UPDATE_USER_ERROR,
): void {
  failNextUpdateFor.set(id, error);
}

/** The user ids `updateUserById` was called with, in order. */
export function getCapturedAuthUpdateUserIds(): readonly string[] {
  return updateCalls;
}
