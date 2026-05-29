/**
 * Route contracts for `GET`, `PATCH`, and `POST /api/v1/onboarding/checklist`.
 *
 * Plan A1 drain #123. Per-user onboarding checklist bootstrap and completion.
 *
 * GET auth-first: no `communityId` in contract — resolved in-handler via
 * `resolveEffectiveCommunityId(req, null)` after auth (#107 precedent).
 *
 * PATCH: `itemKey` validated as known checklist key; invalid keys become
 * canonical `VALIDATION_ERROR` (replaces hand-rolled `{ error: string }` 400).
 *
 * POST/PATCH optional `communityId` in body for tenant override.
 */
import { defineRoute, z } from '@propertypro/api-contract';

/** Mirrors keys in `CHECKLIST_DISPLAY` — kept here to avoid DB-bearing service import. */
const checklistItemKeySchema = z.enum([
  'upload_first_document',
  'upload_community_rules',
  'add_units',
  'invite_first_member',
  'review_compliance',
  'post_announcement',
  'customize_portal',
  'review_announcement',
  'check_compliance',
  'access_document',
  'update_preferences',
]);

export const onboardingChecklistGetContract = defineRoute({
  method: 'GET',
  path: '/api/v1/onboarding/checklist',
  request: {},
  response: z.unknown(),
  permission: { resource: 'communities', action: 'read' },
});

export const onboardingChecklistPatchContract = defineRoute({
  method: 'PATCH',
  path: '/api/v1/onboarding/checklist',
  request: {
    body: z.object({
      communityId: z.number().int().positive().optional(),
      itemKey: checklistItemKeySchema,
    }),
  },
  response: z.unknown(),
  permission: { resource: 'communities', action: 'write' },
});

export const onboardingChecklistPostContract = defineRoute({
  method: 'POST',
  path: '/api/v1/onboarding/checklist',
  request: {
    body: z.object({
      communityId: z.number().int().positive().optional(),
    }),
  },
  response: z.object({
    created: z.literal(true),
  }),
  permission: { resource: 'communities', action: 'write' },
});
