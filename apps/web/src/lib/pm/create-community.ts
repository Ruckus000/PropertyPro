import {
  communities,
  userRoles,
  documentCategories,
  notificationPreferences,
  logAuditEvent,
} from '@propertypro/db';
// AUTHZ: P3-PRE-03: PM community creation — root tenant table bootstrap, no communityId available yet
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { createChecklistItems } from '@/lib/services/onboarding-checklist-service';
import { applyStarterPackToCommunity } from '@/lib/services/starter-pack-service';
import { seedDefaultSiteBranding } from '@/lib/api/branding';
import { getDefaultDocumentCategories, type CommunityType } from '@propertypro/shared';

interface CreateCommunityInput {
  userId: string;
  name: string;
  communityType: CommunityType;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  zipCode: string;
  subdomain: string;
  timezone: string;
  unitCount: number;
}

interface CreateCommunityResult {
  communityId: number;
  slug: string;
}

export async function createCommunityForPm(
  input: CreateCommunityInput,
): Promise<CreateCommunityResult> {
  const db = createUnscopedClient();

  // Wrap core inserts in a transaction to ensure atomicity.
  // If any step fails, all changes are rolled back.
  const { communityId, slug } = await db.transaction(async (tx) => {
    // 1. Insert community
    const rows = await tx
      .insert(communities)
      .values({
        name: input.name,
        slug: input.subdomain,
        communityType: input.communityType,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2 ?? null,
        city: input.city,
        state: input.state,
        zipCode: input.zipCode,
        timezone: input.timezone,
      })
      .returning({ id: communities.id, slug: communities.slug });

    const community = rows[0];
    if (!community) throw new Error('Failed to insert community');

    const cId = Number(community.id);

    // 2. Link the creator as root_manager (creator-is-root, v3). Spec §3.5(a).
    await tx.insert(userRoles).values({
      userId: input.userId,
      communityId: cId,
      role: 'root_manager',
      displayTitle: 'Administrator',
    });

    // 3. Insert default document categories
    const templates = getDefaultDocumentCategories(input.communityType);
    await tx.insert(documentCategories).values(
      templates.map((t) => ({
        communityId: cId,
        name: t.name,
        description: t.description,
      })),
    );

    // 4. Insert default notification preferences
    await tx.insert(notificationPreferences).values({
      userId: input.userId,
      communityId: cId,
      emailFrequency: 'immediate',
    });

    return { communityId: cId, slug: community.slug };
  });

  // 5. Generate onboarding checklist (outside transaction — uses scoped client, is idempotent)
  await createChecklistItems(communityId, input.userId, 'pm_admin', null, input.communityType);

  // 5b. Apply starter pack (outside transaction — best-effort, idempotent)
  // PR #5: §4.0 "site is always live" guarantee — pre-populate published site_blocks so
  // the community public site is never in an empty-state when it first goes live.
  try {
    await applyStarterPackToCommunity(communityId, input.communityType);
  } catch (err) {
    // PR #5: starter pack application is best-effort. Failure here MUST NOT
    // roll back community creation (that would lose the community + memberships
    // + categories + audit log). The PM can manually customize via the editor.
    // eslint-disable-next-line no-console
    console.error('applyStarterPackToCommunity failed', { communityId, err });
  }

  // 5c. Seed default site branding — layout (from community type) + the
  // layout's default theme preset (spec §4.0). Best-effort + idempotent for
  // the same reason as 5b: a catalog read failure must not lose the community.
  // Leaves site_onboarding_completed_at null so the "customize your site"
  // prompts still surface.
  try {
    await seedDefaultSiteBranding(communityId, input.communityType);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('seedDefaultSiteBranding failed', { communityId, err });
  }

  // 6. Audit log (outside transaction — best-effort, should not fail community creation)
  await logAuditEvent({
    userId: input.userId,
    communityId,
    action: 'create',
    resourceType: 'community',
    resourceId: String(communityId),
    newValues: { name: input.name, slug: input.subdomain, type: input.communityType },
  });

  return { communityId, slug };
}
