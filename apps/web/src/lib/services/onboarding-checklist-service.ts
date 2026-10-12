import { createScopedClient } from '@propertypro/db';
import { onboardingChecklistItems } from '@propertypro/db';
import { eq, and, isNull } from '@propertypro/db/filters';
import { isNamedUniqueViolation } from '@/lib/db/postgres-error';
import { checkPermissionV2 } from '@/lib/db/access-control';
import { getDocumentCategoryNames } from '@/lib/services/document-category-service';
import {
  PM_SCOPE_DB_ROLES,
  getFeaturesForCommunity,
  hasBoardDesignation,
  normalizeCategoryName,
  type BoardDesignation,
  type CommunityRole,
} from '@propertypro/shared';

// ─── Item key definitions ────────────────────────────────────
export const ADMIN_CONDO_ITEMS = [
  'upload_first_document',
  'add_units',
  'invite_first_member',
  'review_compliance',
  'post_announcement',
] as const;

export const ADMIN_APARTMENT_ITEMS = [
  'upload_community_rules',
  'add_units',
  'invite_first_member',
  'post_announcement',
] as const;

export const PM_ADMIN_ITEMS = [
  'customize_portal',
] as const;

export const BOARD_MEMBER_ITEMS = [
  'review_announcement',
  'check_compliance',
  'update_preferences',
] as const;

export const OWNER_TENANT_ITEMS = [
  'review_announcement',
  'access_document',
  'update_preferences',
] as const;

export type ChecklistItemKey =
  | (typeof ADMIN_CONDO_ITEMS)[number]
  | (typeof ADMIN_APARTMENT_ITEMS)[number]
  | (typeof PM_ADMIN_ITEMS)[number]
  | (typeof BOARD_MEMBER_ITEMS)[number]
  | (typeof OWNER_TENANT_ITEMS)[number];

// ─── Display text mapping ────────────────────────────────────
export const CHECKLIST_DISPLAY: Record<ChecklistItemKey, string> = {
  upload_first_document: 'Upload your first compliance document',
  upload_community_rules: 'Upload your community rules',
  add_units: 'Add your units',
  invite_first_member: 'Add a board member or resident',
  review_compliance: 'Review your compliance score',
  post_announcement: 'Post your first announcement',
  customize_portal: 'Customize your portal',
  review_announcement: "Review your community's latest announcement",
  check_compliance: 'Check community compliance status',
  access_document: 'Access a community document',
  update_preferences: 'Update your notification preferences',
};

// ─── Membership → item keys resolver ─────────────────────────
type CommunityType = 'condo_718' | 'hoa_720' | 'apartment';

/** The parts of a community membership that decide which tasks apply. */
export interface ChecklistMember {
  role: CommunityRole;
  designation: BoardDesignation | null;
  communityType: CommunityType;
  isUnitOwner: boolean;
}

export function getItemKeysForRole(member: ChecklistMember): readonly ChecklistItemKey[] {
  const can = (resource: 'residents' | 'documents' | 'compliance', action: 'read' | 'write') =>
    checkPermissionV2(member.role, member.communityType, resource, action, {
      isUnitOwner: member.isUnitOwner,
    });
  const adminBase =
    member.communityType === 'apartment' ? ADMIN_APARTMENT_ITEMS : ADMIN_CONDO_ITEMS;

  // Setup tasks go to people who can perform them. A board title grants no
  // write permission (designation is read only by statutory features), so a
  // resident board president handed "Add your units" hit a 403 on every setup
  // task and could never finish the list (onboarding audit F6).
  if (can('residents', 'write') && can('documents', 'write')) {
    return (PM_SCOPE_DB_ROLES as readonly string[]).includes(member.role)
      ? [...adminBase, ...PM_ADMIN_ITEMS]
      : adminBase;
  }
  if (hasBoardDesignation(member.designation)) {
    // Tenants cannot read compliance, and apartments have none.
    const canSeeCompliance =
      getFeaturesForCommunity(member.communityType).hasCompliance && can('compliance', 'read');
    return canSeeCompliance
      ? BOARD_MEMBER_ITEMS
      : BOARD_MEMBER_ITEMS.filter((key) => key !== 'check_compliance');
  }
  return OWNER_TENANT_ITEMS;
}

// ─── Create checklist items for a user ───────────────────────
export async function createChecklistItems(
  communityId: number,
  userId: string,
  member: ChecklistMember,
): Promise<void> {
  const itemKeys = getItemKeysForRole(member);
  const scoped = createScopedClient(communityId);

  // Insert each item; the unique constraint on (communityId, userId, itemKey) acts as the
  // conflict target — so existing rows are preserved (idempotent bootstrap).
  for (const itemKey of itemKeys) {
    try {
      await scoped.insert(onboardingChecklistItems, {
        communityId,
        userId,
        itemKey,
      });
    } catch (err) {
      // Swallow only this table's own duplicate; any other error is re-thrown.
      // drizzle wraps the Postgres error, so the check reads `.cause` — the
      // message is drizzle's "Failed query: …" and names no constraint.
      if (!isNamedUniqueViolation(err, 'onboarding_checklist_community_user_key')) throw err;
    }
  }
}

// ─── Get checklist items for a user ──────────────────────────
export async function getChecklistItems(
  communityId: number,
  userId: string,
): Promise<
  Array<{
    id: number;
    itemKey: string;
    completedAt: Date | null;
    createdAt: Date;
  }>
> {
  const scoped = createScopedClient(communityId);

  const rows = await scoped.selectFrom<{
    id: number;
    itemKey: string;
    completedAt: Date | null;
    createdAt: Date;
  }>(
    onboardingChecklistItems,
    {
      id: onboardingChecklistItems.id,
      itemKey: onboardingChecklistItems.itemKey,
      completedAt: onboardingChecklistItems.completedAt,
      createdAt: onboardingChecklistItems.createdAt,
    },
    and(
      eq(onboardingChecklistItems.userId, userId),
      isNull(onboardingChecklistItems.deletedAt),
    ),
  ).orderBy(onboardingChecklistItems.createdAt);

  return rows;
}

// ─── Check if user has any checklist items (welcome signal) ──
export async function hasChecklistItems(
  communityId: number,
  userId: string,
): Promise<boolean> {
  const items = await getChecklistItems(communityId, userId);
  return items.length > 0;
}

// ─── Mark a specific item complete (idempotent) ──────────────
export async function markItemComplete(
  communityId: number,
  userId: string,
  itemKey: ChecklistItemKey,
): Promise<void> {
  const scoped = createScopedClient(communityId);

  await scoped.update(
    onboardingChecklistItems,
    { completedAt: new Date() },
    and(
      eq(onboardingChecklistItems.userId, userId),
      eq(onboardingChecklistItems.itemKey, itemKey),
      isNull(onboardingChecklistItems.completedAt),
    ),
  );
}

// ─── Auto-complete hook (fire-and-forget, never throws) ──────
export async function tryAutoComplete(
  communityId: number,
  userId: string,
  itemKey: ChecklistItemKey,
): Promise<void> {
  try {
    await markItemComplete(communityId, userId, itemKey);
  } catch {
    // Non-blocking: checklist failure must never break primary actions
  }
}

// ─── Document steps (shared by library upload and authored publish) ──
/**
 * "Upload your first compliance document" completes on any document; "Upload
 * your community rules" only on one filed under the rules category. Both are
 * no-ops for people whose list lacks the key. Never throws.
 */
export async function completeDocumentSteps(
  communityId: number,
  userId: string,
  categoryId: number | null,
): Promise<void> {
  await tryAutoComplete(communityId, userId, 'upload_first_document');
  if (categoryId == null) return;
  try {
    const names = await getDocumentCategoryNames(communityId, [categoryId]);
    if (normalizeCategoryName(names.get(categoryId)) === 'rules') {
      await tryAutoComplete(communityId, userId, 'upload_community_rules');
    }
  } catch {
    // Non-blocking: checklist failure must never break primary actions
  }
}
