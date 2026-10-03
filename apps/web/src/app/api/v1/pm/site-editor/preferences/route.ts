// read-entitlement:exempt — the caller's own editor UI state (mode, tour, checklist ticks); it reads no community data, so a lapsed subscription has nothing to withhold
/**
 * The website editor's per-user state (builder v4, Phase 3).
 *
 * GET   /api/v1/pm/site-editor/preferences?communityId=N — the caller's own state
 * PATCH /api/v1/pm/site-editor/preferences               — change it
 *
 * Gated like the editor itself: a management role in the community and the
 * hasSiteEditor plan feature. Rows are keyed by the session's user id, never
 * by anything in the request, so a caller can only ever touch their own.
 *
 * Two keys in user_preferences:
 *   - `site_editor_mode` — per user, across communities: a manager who chose
 *     Free edit once should not be asked again in their next community.
 *   - `site_editor_checklist:<communityId>` — per user per community, because
 *     "I reviewed the pages" is about one site.
 * Both are stored FLAT and written with `mergeUserPreference`, so two clicks
 * in quick succession cannot overwrite each other.
 *
 * No audit entry: this is the manager's own UI state, not a change to the
 * community (as for /api/v1/pm/site-setup-banner).
 */
import { runRoute } from '@/lib/api/run-route';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { requireRole, PM_MANAGER_ROLES } from '@/lib/api/role-guard';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import {
  getUserPreference,
  mergeUserPreference,
} from '@/lib/services/user-preferences-service';
import {
  EDITOR_MODES,
  MARKABLE_STEPS,
  VISITABLE_STEPS,
  getSiteEditorPreferencesContract,
  patchSiteEditorPreferencesContract,
  type SiteEditorPreferences,
} from './contract';

const MODE_KEY = 'site_editor_mode';
const checklistKey = (communityId: number) => `site_editor_checklist:${communityId}`;

async function requireEditorAccess(communityId: number): Promise<string> {
  const userId = await requireAuthenticatedUserId();
  const membership = await requireCommunityMembership(communityId, userId);
  requireRole(membership, PM_MANAGER_ROLES, 'Only property managers can use the website editor');
  await requirePlanFeature(communityId, 'hasSiteEditor');
  return userId;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Reads only the values this route writes; anything else in the row is ignored. */
async function readPreferences(userId: string, communityId: number): Promise<SiteEditorPreferences> {
  const [modeRow, checklistRow] = await Promise.all([
    getUserPreference(userId, MODE_KEY),
    getUserPreference(userId, checklistKey(communityId)),
  ]);
  const modeValue = asRecord(modeRow);
  const checklist = asRecord(checklistRow);
  const mode = EDITOR_MODES.find((m) => m === modeValue['mode']) ?? null;
  return {
    mode,
    tourDone: modeValue['tourDone'] === true,
    marked: MARKABLE_STEPS.filter((k) => checklist[`mark.${k}`] === true),
    visited: VISITABLE_STEPS.filter((k) => checklist[`visit.${k}`] === true),
  };
}

export const GET = withErrorHandler(
  runRoute(getSiteEditorPreferencesContract, async ({ communityId }) => {
    const userId = await requireEditorAccess(communityId);
    return readPreferences(userId, communityId);
  }),
);

export const PATCH = withErrorHandler(
  runRoute(patchSiteEditorPreferencesContract, async ({ body, communityId }) => {
    const userId = await requireEditorAccess(communityId);

    if (body.mark !== undefined && body.mark === body.unmark) {
      throw new ValidationError('Choose either mark or unmark for a step, not both.');
    }

    const modePatch: Record<string, string | boolean> = {};
    if (body.mode !== undefined) modePatch['mode'] = body.mode;
    if (body.tourDone !== undefined) modePatch['tourDone'] = body.tourDone;

    const checklistPatch: Record<string, string | boolean> = {};
    if (body.mark !== undefined) checklistPatch[`mark.${body.mark}`] = true;
    if (body.unmark !== undefined) checklistPatch[`mark.${body.unmark}`] = false;
    if (body.visit !== undefined) checklistPatch[`visit.${body.visit}`] = true;

    if (Object.keys(modePatch).length === 0 && Object.keys(checklistPatch).length === 0) {
      throw new ValidationError('Nothing to change.');
    }

    await Promise.all([
      Object.keys(modePatch).length > 0 ? mergeUserPreference(userId, MODE_KEY, modePatch) : null,
      Object.keys(checklistPatch).length > 0
        ? mergeUserPreference(userId, checklistKey(communityId), checklistPatch)
        : null,
    ]);
    return readPreferences(userId, communityId);
  }),
);
