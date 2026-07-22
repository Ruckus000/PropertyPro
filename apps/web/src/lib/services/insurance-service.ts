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
import { eq } from '@propertypro/db/filters';

type ScopedClient = ReturnType<typeof createScopedClient>;
type Row = Record<string, unknown>;

// --- Policies -------------------------------------------------------------

/** List policies, soonest-expiring first. Bounded per community — not paginated. */
export async function listInsurancePolicies(scoped: ScopedClient): Promise<Row[]> {
  const rows = (await scoped.query(insurancePolicies)) as Row[];
  return rows.sort((a, b) => String(a.expiresAt).localeCompare(String(b.expiresAt)));
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
 * List certificate requests. RLS scopes non-admin actors to their own rows and
 * admin-tier to all, so this returns whatever the caller may see.
 */
export async function listCertificateRequests(scoped: ScopedClient): Promise<Row[]> {
  const rows = (await scoped.query(insuranceCertificateRequests)) as Row[];
  return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
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
