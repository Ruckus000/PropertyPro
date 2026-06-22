import { createScopedClient } from '@propertypro/db';
import { onboardingChecklistItems } from '@propertypro/db';
import { eq, and, isNull } from '@propertypro/db/filters';
import {
  PM_SCOPE_DB_ROLES,
  isBoardPresident,
  hasBoardDesignation,
  type BoardDesignation,
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
  'review_compliance',
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

// ─── Role → item keys resolver ───────────────────────────────
type CommunityType = 'condo_718' | 'hoa_720' | 'apartment';
type Role = string;

export function getItemKeysForRole(
  role: Role,
  designation: BoardDesignation | null,
  communityType: CommunityType,
): readonly ChecklistItemKey[] {
  // role-v3 (Phase 3.3): keyed on the v3 DB role + nullable board designation.
  // Board membership is the designation column, independent of the base role.
  // CORNER (0 prod rows today — root is vacant): a PM-scope role that ALSO holds a
  // board designation (e.g. the model's self-managed root_manager + board_president)
  // resolves designation-FIRST here, so it gets the board onboarding set rather than
  // adminBase+customize_portal. Onboarding-only, no permission impact; revisit at
  // Phase 4 if self-managed roots should keep the PM-admin onboarding nudge.
  const adminBase =
    communityType === 'apartment' ? ADMIN_APARTMENT_ITEMS : ADMIN_CONDO_ITEMS;

  // board_president designation → admin base set.
  if (isBoardPresident(designation)) {
    return adminBase;
  }
  // board_member designation → board-member checklist (regardless of base role).
  if (hasBoardDesignation(designation)) {
    return BOARD_MEMBER_ITEMS;
  }
  // PM-scope roles (pm_admin / property_manager / root_manager) get the admin
  // base set plus customize_portal — parity with the pre-3.3 PM_SCOPE branch.
  if ((PM_SCOPE_DB_ROLES as readonly string[]).includes(role)) {
    return [...adminBase, ...PM_ADMIN_ITEMS];
  }
  // resident (no board designation) → owner/tenant checklist.
  return OWNER_TENANT_ITEMS;
}

// ─── Create checklist items for a user ───────────────────────
export async function createChecklistItems(
  communityId: number,
  userId: string,
  role: Role,
  designation: BoardDesignation | null,
  communityType: CommunityType,
): Promise<void> {
  const itemKeys = getItemKeysForRole(role, designation, communityType);
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
      // Swallow unique-constraint violations (duplicate key / 23505).
      // Any other error is re-thrown.
      const isUniqueViolation =
        err instanceof Error &&
        (err.message.includes('unique') ||
          err.message.includes('duplicate') ||
          (err as { code?: string }).code === '23505');
      if (!isUniqueViolation) throw err;
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
    eq(onboardingChecklistItems.userId, userId),
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
