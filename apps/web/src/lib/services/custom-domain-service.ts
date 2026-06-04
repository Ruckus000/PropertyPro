/**
 * Custom-domain service — persists the PM-chosen custom domain on the
 * `communities` root tenant table and orchestrates the Vercel Domains provider.
 *
 * AUTHZ: communities is the root tenant table (no community_id column), so reads
 * and writes go through `createUnscopedClient()` and target the row by primary
 * key. Caller authorization (pm_admin/cam membership + `hasSiteCustomDomain`
 * plan feature + not-demo-grace) is verified upstream at the route layer
 * (`apps/web/src/app/api/v1/pm/site/domain/*`).
 *
 * NODE RUNTIME ONLY — depends on the Vercel Domains client which uses
 * server-only env secrets. Must never be imported by edge middleware.
 */
import { communities, logAuditEvent } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { eq } from '@propertypro/db/filters';
import { assertCustomDomainAllowed, CustomDomainNotAllowedError } from '@propertypro/shared';
import { AppError, ConflictError, ValidationError } from '@/lib/api/errors';
import {
  addProjectDomain,
  getDomainStatus,
  removeProjectDomain,
  DomainProvisioningUnavailableError,
  DomainProviderError,
} from '@/lib/domains/vercel-domains-client';

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'getpropertypro.com';

export interface DnsRecord {
  type: string;
  name: string;
  value: string;
}

export interface DomainState {
  domain: string | null;
  status: 'pending' | 'active' | 'error' | null;
  verifiedAt: string | null;
  records: DnsRecord[];
  reason: string | null;
}

interface PersistedRow {
  customDomain: string | null;
  customDomainStatus: 'pending' | 'active' | 'error' | null;
  customDomainVerifiedAt: Date | null;
}

/** Translate provider/provisioning failures into HTTP AppErrors. Re-throws others. */
function translateProviderError(e: unknown): never {
  if (e instanceof DomainProvisioningUnavailableError) {
    throw new AppError(
      'Custom-domain provisioning is not configured.',
      503,
      'DOMAIN_PROVISIONING_UNAVAILABLE',
    );
  }
  if (e instanceof DomainProviderError) {
    throw new AppError(e.message, 502, 'DOMAIN_PROVIDER_ERROR');
  }
  throw e;
}

/** True when a thrown DB error is a postgres unique violation (possibly nested). */
function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: unknown; cause?: { code?: unknown } } | null;
  return err?.code === '23505' || err?.cause?.code === '23505';
}

async function readRow(communityId: number): Promise<PersistedRow> {
  const db = createUnscopedClient();
  const rows = await db
    .select({
      customDomain: communities.customDomain,
      customDomainStatus: communities.customDomainStatus,
      customDomainVerifiedAt: communities.customDomainVerifiedAt,
    })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);
  const row = rows[0] as PersistedRow | undefined;
  return (
    row ?? { customDomain: null, customDomainStatus: null, customDomainVerifiedAt: null }
  );
}

/** Read the persisted custom-domain state. No Vercel call. */
export async function getDomain(communityId: number): Promise<DomainState> {
  const row = await readRow(communityId);
  return {
    domain: row.customDomain,
    status: row.customDomainStatus,
    verifiedAt: row.customDomainVerifiedAt ? row.customDomainVerifiedAt.toISOString() : null,
    records: [],
    reason: null,
  };
}

/** Attach a new custom domain, provisioning it at the provider and persisting it. */
export async function setDomain(
  communityId: number,
  userId: string,
  rawHost: string,
): Promise<DomainState> {
  const existing = await readRow(communityId);
  if (existing.customDomain) {
    throw new ConflictError('You already have a custom domain. Remove it first.');
  }

  let host: string;
  try {
    host = assertCustomDomainAllowed(rawHost, ROOT_DOMAIN);
  } catch (e) {
    if (e instanceof CustomDomainNotAllowedError) {
      throw new ValidationError(e.message);
    }
    throw e;
  }

  let result;
  try {
    result = await addProjectDomain(host);
  } catch (e) {
    translateProviderError(e);
  }

  const status = result.status ?? 'pending';
  const db = createUnscopedClient();
  try {
    await db
      .update(communities)
      .set({ customDomain: host, customDomainStatus: status })
      .where(eq(communities.id, communityId));
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new ConflictError('That domain is already in use by another community.');
    }
    throw e;
  }

  await logAuditEvent({
    userId,
    action: 'custom_domain_set',
    resourceType: 'community',
    resourceId: String(communityId),
    communityId,
    newValues: { customDomain: host },
  });

  return {
    domain: host,
    status,
    verifiedAt: null,
    records: result.records,
    reason: result.reason ?? null,
  };
}

/** Re-check provider status; flip to active + stamp verifiedAt on first success. */
export async function verifyDomain(communityId: number, userId: string): Promise<DomainState> {
  const existing = await readRow(communityId);
  const host = existing.customDomain;
  if (!host) {
    throw new ValidationError('No custom domain is configured.');
  }

  const result = await getDomainStatus(host);
  const db = createUnscopedClient();

  let verifiedAt: Date | null = existing.customDomainVerifiedAt;
  if (result.status === 'active' && existing.customDomainStatus !== 'active') {
    verifiedAt = new Date();
    await db
      .update(communities)
      .set({ customDomainStatus: 'active', customDomainVerifiedAt: verifiedAt })
      .where(eq(communities.id, communityId));
    await logAuditEvent({
      userId,
      action: 'custom_domain_verified',
      resourceType: 'community',
      resourceId: String(communityId),
      communityId,
      newValues: { customDomain: host },
    });
  } else {
    await db
      .update(communities)
      .set({ customDomainStatus: result.status })
      .where(eq(communities.id, communityId));
  }

  return {
    domain: host,
    status: result.status,
    verifiedAt: verifiedAt ? verifiedAt.toISOString() : null,
    records: result.records,
    reason: result.reason ?? null,
  };
}

/** Release the domain at the provider and clear the persisted columns. */
export async function removeDomain(communityId: number, userId: string): Promise<void> {
  const existing = await readRow(communityId);
  const host = existing.customDomain;

  if (host) {
    try {
      await removeProjectDomain(host);
    } catch (e) {
      translateProviderError(e);
    }
  }

  const db = createUnscopedClient();
  await db
    .update(communities)
    .set({ customDomain: null, customDomainStatus: null, customDomainVerifiedAt: null })
    .where(eq(communities.id, communityId));

  await logAuditEvent({
    userId,
    action: 'custom_domain_removed',
    resourceType: 'community',
    resourceId: String(communityId),
    communityId,
    oldValues: { customDomain: host },
  });
}
