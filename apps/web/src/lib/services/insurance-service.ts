/**
 * Insurance summary service — scoped DB access for master-policy summaries and
 * certificate-request relays (spec #3).
 *
 * Every function takes an already-scoped client (AGENTS #13). Callers verify
 * insurance read/write authorization; policy-number redaction and the relay
 * email happen in the route handler.
 */
import type { createScopedClient } from '@propertypro/db';
import { documents, insuranceCertificateRequests, insurancePolicies, users } from '@propertypro/db';
import { asc, desc, eq } from '@propertypro/db/filters';

type ScopedClient = ReturnType<typeof createScopedClient>;
type Row = Record<string, unknown>;

/**
 * Explicit row caps for the two list reads below. Neither route paginates (the
 * response is a bare array under `{ policies }` / `{ requests }`), so these are
 * safety bounds, not page sizes. Sort + cap run in SQL (roadmap 3.7, PAG-06).
 *
 * - Policies: a community carries one live master policy per coverage type,
 *   plus the non-deleted history of prior terms; 500 is decades of annual
 *   renewals across every type. The Insurance hub renders the whole array.
 * - Certificate requests: a growing log (rate-limited to 5/user/day). The list
 *   GET has no in-app consumer today; the cap keeps the newest 500.
 */
export const INSURANCE_POLICY_LIST_CAP = 500;
export const CERTIFICATE_REQUEST_LIST_CAP = 500;

// --- Policies -------------------------------------------------------------

/**
 * List policies, soonest-expiring first (`expires_at ASC, id ASC`), capped at
 * INSURANCE_POLICY_LIST_CAP. Not paginated. The order is served by
 * `insurance_policies_community_expires_idx (community_id, expires_at)`.
 */
export async function listInsurancePolicies(scoped: ScopedClient): Promise<Row[]> {
  const rows = await scoped
    .selectFrom(insurancePolicies, {})
    .orderBy(asc(insurancePolicies.expiresAt), asc(insurancePolicies.id))
    .limit(INSURANCE_POLICY_LIST_CAP);
  return rows as unknown as Row[];
}

export async function getInsurancePolicyById(scoped: ScopedClient, id: number): Promise<Row | null> {
  const rows = await scoped.selectFrom(insurancePolicies, {}, eq(insurancePolicies.id, id));
  return ((rows as unknown as Row[])[0]) ?? null;
}

/** Validate a referenced document belongs to THIS community (scoped ⇒ cross-tenant safe). */
export async function getInsuranceDocumentById(scoped: ScopedClient, id: number): Promise<Row | null> {
  const rows = await scoped.selectFrom(documents, {}, eq(documents.id, id));
  return ((rows as unknown as Row[])[0]) ?? null;
}

export async function createInsurancePolicy(
  scoped: ScopedClient,
  values: Record<string, unknown>,
): Promise<Row | undefined> {
  const rows = await scoped.insert(insurancePolicies, values);
  return (rows as unknown as Row[])[0];
}

export async function updateInsurancePolicyById(
  scoped: ScopedClient,
  id: number,
  values: Record<string, unknown>,
): Promise<Row | undefined> {
  const rows = await scoped.update(insurancePolicies, values, eq(insurancePolicies.id, id));
  return (rows as unknown as Row[])[0];
}

export async function softDeleteInsurancePolicyById(
  scoped: ScopedClient,
  id: number,
): Promise<Row | undefined> {
  const rows = await scoped.softDelete(insurancePolicies, eq(insurancePolicies.id, id));
  return (rows as unknown as Row[])[0];
}

// --- Certificate requests -------------------------------------------------

/**
 * List certificate requests, newest first (`created_at DESC, id DESC`), capped
 * at CERTIFICATE_REQUEST_LIST_CAP. Not paginated.
 */
export async function listCertificateRequests(scoped: ScopedClient): Promise<Row[]> {
  const rows = await scoped
    .selectFrom(insuranceCertificateRequests, {})
    .orderBy(desc(insuranceCertificateRequests.createdAt), desc(insuranceCertificateRequests.id))
    .limit(CERTIFICATE_REQUEST_LIST_CAP);
  return rows as unknown as Row[];
}

export async function createCertificateRequest(
  scoped: ScopedClient,
  values: Record<string, unknown>,
): Promise<Row | undefined> {
  const rows = await scoped.insert(insuranceCertificateRequests, values);
  return (rows as unknown as Row[])[0];
}

/** The requesting owner's email + name, for the relay's Reply-To + confirmation. */
export async function getRequesterContact(
  scoped: ScopedClient,
  userId: string,
): Promise<{ email: string; fullName: string }> {
  const rows = (await scoped.selectFrom(users, {}, eq(users.id, userId))) as unknown as Row[];
  const row = rows[0];
  return {
    email: typeof row?.email === 'string' ? row.email : '',
    fullName: typeof row?.fullName === 'string' && row.fullName.length > 0 ? row.fullName : 'a unit owner',
  };
}
