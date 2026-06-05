/**
 * Portfolio-template service — manages a property manager's personal,
 * user-owned library of reusable site-branding templates on the
 * `site_portfolio_templates` table.
 *
 * AUTHZ: `site_portfolio_templates` is NOT tenant-scoped (no community_id
 * column); rows are keyed by `owner_user_id` and RLS restricts every row to
 * its owner via auth.uid(). The scoped client cannot target it, so reads and
 * writes go through `createUnscopedClient()` and ALWAYS filter by
 * `owner_user_id = ownerUserId` as defense-in-depth alongside RLS. Caller
 * authorization (pm_admin in ≥1 community + `hasSitePortfolioTemplates` plan
 * feature) is verified upstream at the route layer
 * (`apps/web/src/app/api/v1/pm/portfolio/templates/*`).
 *
 * NODE RUNTIME ONLY — depends on storage-copy helpers that use server-only
 * secrets. Must never be imported by edge middleware.
 */
import { sitePortfolioTemplates, communities, userRoles, deleteStorageObject, logAuditEvent } from '@propertypro/db';
// site_portfolio_templates is a user-owned (NOT tenant-scoped) table — no
// community_id column, so the scoped client cannot target it. The access-gate
// helper additionally joins user_roles → communities (root tenant table) to
// resolve the actor's per-community plan. Caller authz (pm_admin +
// hasSitePortfolioTemplates) is enforced at the route layer
// (apps/web/src/app/api/v1/pm/portfolio/templates/*).
// AUTHZ: user-owned + root tenant tables — query/write by owner_user_id / primary key via the unsafe client.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { and, desc, eq, isNull } from '@propertypro/db/filters';
import {
  extractTemplateBranding,
  getEffectiveFeatures,
  resolvePlanId,
  type CommunityType,
  type PortfolioTemplateBranding,
} from '@propertypro/shared';
import { getBrandingForCommunity } from '@/lib/api/branding';
import { copyStorageObject } from '@/lib/site-assets/copy-object';
import { NotFoundError } from '@/lib/api/errors';

const ASSET_BUCKET = 'documents';

export interface PortfolioTemplateSummary {
  id: number;
  name: string;
  siteLogoPath: string | null;
  createdAt: string;
  updatedAt: string;
  branding: PortfolioTemplateBranding;
}

interface TemplateRow {
  id: number;
  name: string;
  siteLogoPath: string | null;
  branding: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toSummary(row: TemplateRow): PortfolioTemplateSummary {
  return {
    id: row.id,
    name: row.name,
    siteLogoPath: row.siteLogoPath,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    branding: (row.branding ?? {}) as PortfolioTemplateBranding,
  };
}

/**
 * Returns true when the user holds `pm_admin` in ≥1 non-deleted community whose
 * effective features include `hasSitePortfolioTemplates`. `findManagedCommunities
 * PortfolioUnscoped` carries no plan field, so this resolves the per-community
 * plan directly.
 */
export async function userHasPortfolioTemplatesAccess(userId: string): Promise<boolean> {
  const db = createUnscopedClient();
  const rows = await db
    .select({
      communityType: communities.communityType,
      subscriptionPlan: communities.subscriptionPlan,
    })
    .from(userRoles)
    .innerJoin(communities, eq(communities.id, userRoles.communityId))
    .where(
      and(
        eq(userRoles.userId, userId),
        eq(userRoles.role, 'pm_admin'),
        isNull(communities.deletedAt),
      ),
    );
  return rows.some(
    (r) =>
      getEffectiveFeatures(r.communityType as CommunityType, resolvePlanId(r.subscriptionPlan))
        .hasSitePortfolioTemplates,
  );
}

/** List the owner's non-deleted templates, newest first. */
export async function listTemplates(ownerUserId: string): Promise<PortfolioTemplateSummary[]> {
  const db = createUnscopedClient();
  const rows = (await db
    .select({
      id: sitePortfolioTemplates.id,
      name: sitePortfolioTemplates.name,
      siteLogoPath: sitePortfolioTemplates.siteLogoPath,
      branding: sitePortfolioTemplates.branding,
      createdAt: sitePortfolioTemplates.createdAt,
      updatedAt: sitePortfolioTemplates.updatedAt,
    })
    .from(sitePortfolioTemplates)
    .where(
      and(
        eq(sitePortfolioTemplates.ownerUserId, ownerUserId),
        isNull(sitePortfolioTemplates.deletedAt),
      ),
    )
    .orderBy(desc(sitePortfolioTemplates.id))) as TemplateRow[];
  return rows.map(toSummary);
}

/** Rename one of the owner's templates. NotFoundError when no matching live row. */
export async function renameTemplate(
  ownerUserId: string,
  id: number,
  name: string,
): Promise<PortfolioTemplateSummary> {
  const db = createUnscopedClient();
  const rows = (await db
    .update(sitePortfolioTemplates)
    .set({ name, updatedAt: new Date() })
    .where(
      and(
        eq(sitePortfolioTemplates.id, id),
        eq(sitePortfolioTemplates.ownerUserId, ownerUserId),
        isNull(sitePortfolioTemplates.deletedAt),
      ),
    )
    .returning({
      id: sitePortfolioTemplates.id,
      name: sitePortfolioTemplates.name,
      siteLogoPath: sitePortfolioTemplates.siteLogoPath,
      branding: sitePortfolioTemplates.branding,
      createdAt: sitePortfolioTemplates.createdAt,
      updatedAt: sitePortfolioTemplates.updatedAt,
    })) as TemplateRow[];

  const row = rows[0];
  if (!row) {
    throw new NotFoundError('Template not found');
  }

  return toSummary(row);
}

/**
 * Snapshot a community's branding (token subset) into a new template owned by
 * the caller, copying the wordmark logo asset (if any) into the template's
 * storage namespace and recording its destination path.
 */
export async function createFromCommunity(
  ownerUserId: string,
  communityId: number,
  name: string,
): Promise<PortfolioTemplateSummary> {
  const branding = await getBrandingForCommunity(communityId);
  const captured = branding ? extractTemplateBranding(branding) : ({} as PortfolioTemplateBranding);

  const db = createUnscopedClient();
  const inserted = (await db
    .insert(sitePortfolioTemplates)
    .values({ ownerUserId, name, branding: captured, siteLogoPath: null })
    .returning({
      id: sitePortfolioTemplates.id,
      name: sitePortfolioTemplates.name,
      siteLogoPath: sitePortfolioTemplates.siteLogoPath,
      branding: sitePortfolioTemplates.branding,
      createdAt: sitePortfolioTemplates.createdAt,
      updatedAt: sitePortfolioTemplates.updatedAt,
    })) as TemplateRow[];

  const row = inserted[0];
  if (!row) {
    throw new NotFoundError('Failed to create template');
  }

  let siteLogoPath: string | null = null;
  const sourceLogoPath = branding?.siteLogoPath;
  if (sourceLogoPath) {
    // Best-effort: the row is already committed, so a logo-copy failure must NOT
    // leave an orphaned row behind. Swallow and keep the template logo-less
    // (still usable) rather than 500-ing with a ghost row.
    try {
      const destPath = `portfolio-templates/${row.id}/site-logo.webp`;
      await copyStorageObject(ASSET_BUCKET, sourceLogoPath, destPath);
      siteLogoPath = destPath;
      await db
        .update(sitePortfolioTemplates)
        .set({ siteLogoPath })
        .where(eq(sitePortfolioTemplates.id, row.id));
    } catch {
      // logo unavailable — template is created without it.
    }
  }

  await logAuditEvent({
    userId: ownerUserId,
    action: 'portfolio_template_created',
    resourceType: 'portfolio_template',
    resourceId: String(row.id),
    communityId,
    newValues: { name, sourceCommunityId: communityId },
  });

  return toSummary({ ...row, siteLogoPath });
}

/**
 * Soft-delete one of the owner's templates and best-effort purge its copied
 * logo asset (the row delete is the source of truth — a storage failure is
 * swallowed).
 */
export async function deleteTemplate(ownerUserId: string, id: number): Promise<void> {
  const db = createUnscopedClient();
  const rows = (await db
    .select({
      id: sitePortfolioTemplates.id,
      siteLogoPath: sitePortfolioTemplates.siteLogoPath,
    })
    .from(sitePortfolioTemplates)
    .where(
      and(
        eq(sitePortfolioTemplates.id, id),
        eq(sitePortfolioTemplates.ownerUserId, ownerUserId),
        isNull(sitePortfolioTemplates.deletedAt),
      ),
    )
    .limit(1)) as Array<{ id: number; siteLogoPath: string | null }>;

  const row = rows[0];
  if (!row) {
    throw new NotFoundError('Template not found');
  }

  if (row.siteLogoPath) {
    try {
      await deleteStorageObject(ASSET_BUCKET, row.siteLogoPath);
    } catch {
      // Best-effort: the soft-delete below is the source of truth.
    }
  }

  await db
    .update(sitePortfolioTemplates)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(sitePortfolioTemplates.id, id),
        eq(sitePortfolioTemplates.ownerUserId, ownerUserId),
      ),
    );
}
