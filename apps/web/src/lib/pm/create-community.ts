import {
  communities,
  userRoles,
  documentCategories,
  notificationPreferences,
  logAuditEvent,
} from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { createChecklistItems } from '@/lib/services/onboarding-checklist-service';
import type { CommunityType } from '@propertypro/shared';

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

type CategoryTemplate = { name: string; description: string };

const CONDO_HOA_CATEGORIES: CategoryTemplate[] = [
  { name: 'Governing Documents', description: 'Articles, bylaws, declarations, and rules' },
  { name: 'Financial Records', description: 'Budgets, financial reports, and audits' },
  { name: 'Meeting Records', description: 'Notices, agendas, and minutes' },
  { name: 'Correspondence', description: 'Official letters and notices' },
  { name: 'Contracts', description: 'Vendor and service contracts' },
];

const APARTMENT_CATEGORIES: CategoryTemplate[] = [
  { name: 'Lease Agreements', description: 'Signed lease agreements and addenda' },
  { name: 'Maintenance Records', description: 'Work orders and inspection reports' },
  { name: 'Communications', description: 'Tenant notices and correspondence' },
  { name: 'Financials', description: 'Rent rolls and financial summaries' },
  { name: 'Compliance', description: 'Inspection reports and certificates' },
];

export async function createCommunityForPm(
  input: CreateCommunityInput,
): Promise<CreateCommunityResult> {
  const db = createUnscopedClient();

  // 1. Insert community
  const rows = await db
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

  const communityId = Number(community.id);

  // 2. Link PM as admin
  await db.insert(userRoles).values({
    userId: input.userId,
    communityId,
    role: 'pm_admin',
    displayTitle: 'Administrator',
  });

  // 3. Generate onboarding checklist
  await createChecklistItems(communityId, input.userId, 'pm_admin', input.communityType);

  // 4. Insert default document categories
  const templates =
    input.communityType === 'apartment' ? APARTMENT_CATEGORIES : CONDO_HOA_CATEGORIES;
  await db.insert(documentCategories).values(
    templates.map((t) => ({
      communityId,
      name: t.name,
      description: t.description,
    })),
  );

  // 5. Insert default notification preferences
  await db.insert(notificationPreferences).values({
    userId: input.userId,
    communityId,
    emailFrequency: 'immediate',
  });

  // 6. Audit log
  await logAuditEvent({
    userId: input.userId,
    communityId,
    action: 'create',
    resourceType: 'community',
    resourceId: String(communityId),
    newValues: { name: input.name, slug: input.subdomain, type: input.communityType },
  });

  return { communityId, slug: community.slug };
}
