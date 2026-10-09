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
import { seedNewCommunitySite } from '@/lib/services/new-community-site';
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
        // Collected by the form and, until migration 0081, dropped here. It
        // decides whether Florida's website rules apply (packages/shared
        // `requirementLevel`).
        unitCount: input.unitCount,
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

  // 5. Generate onboarding checklist outside the transaction. The community is
  // already valid once its core transaction commits, so this must not make the
  // caller retry a creation that already succeeded.
  try {
    await createChecklistItems(communityId, input.userId, 'root_manager', null, input.communityType);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('createChecklistItems failed', { communityId, err });
  }

  // 5b. Starter website: published starter-pack sections + default layout and
  // colour set (spec §4.0 "site is always live"). Outside the transaction and
  // best-effort: a failure must not roll back the community, its memberships,
  // categories and audit log. Never throws.
  await seedNewCommunitySite(communityId, input.communityType);

  // 6. Audit log (outside transaction — best-effort, should not fail a
  // committed community creation). The append-only audit table remains intact;
  // this only prevents a transient logging failure from stranding the creator.
  try {
    await logAuditEvent({
      userId: input.userId,
      communityId,
      action: 'create',
      resourceType: 'community',
      resourceId: String(communityId),
      newValues: { name: input.name, slug: input.subdomain, type: input.communityType },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('logAuditEvent failed during community creation', { communityId, err });
  }

  return { communityId, slug };
}
