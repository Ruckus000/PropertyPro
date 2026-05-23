/**
 * Transparency Settings API
 *
 * GET    /api/v1/transparency/settings?communityId=N
 * PATCH  /api/v1/transparency/settings
 *
 * Plan A1 drain #16. Mirrors drain #4 (community/contact) and drain #13
 * (payments/fee-policy) two-contracts-per-file GET+PATCH with audit log.
 * Both methods declare contracts in `./contract.ts`; input validation,
 * output validation, and canonical `{data}` envelope wrapping are
 * delegated to `runRoute()` from `@propertypro/api-contract`.
 *
 * Authorization invariants (preserved verbatim):
 *   GET   — `requireAuthenticatedUserId` → `resolveEffectiveCommunityId`
 *           → `requireCommunityMembership` → `hasTransparencyPage` feature
 *           gate (404 when disabled) → `requirePermission(settings/read)`
 *           → `getTransparencySettings` (404 when null) → response.
 *   PATCH — `requireAuthenticatedUserId` → parseBody (Zod, runner)
 *           → `resolveEffectiveCommunityId` → `assertNotDemoGrace`
 *           → `requireCommunityMembership` → `hasTransparencyPage` feature
 *           gate → `requirePermission(settings/write)` →
 *           `getTransparencySettings` (404 when null) →
 *           [conditional: when `body.enabled === true`:
 *             `ensureTransparencyChecklistInitialized` (ValidationError when
 *              the resulting checklist is empty) +
 *             on first enable, `body.acknowledged === true` required else
 *              ValidationError + stamp `acknowledgedAt = new Date()`]
 *           → `setTransparencySettings` → `logAuditEvent`.
 *
 * Audit log (preserved verbatim):
 *   action='settings_changed', resourceType='transparency',
 *   resourceId=String(communityId), communityId,
 *   oldValues={ enabled, acknowledgedAt: ISO|null },
 *   newValues={ enabled, acknowledgedAt: ISO|null }.
 *
 * `acknowledgedAt` Date↔ISO handling: the transparency service returns
 * `acknowledgedAt: Date | null`. The runner's `safeParse(result)` runs
 * BEFORE `NextResponse.json` serialization, so the response schema declares
 * `z.string().nullable()` and the handler calls `.toISOString()` explicitly
 * (drain #9 pattern — same handling as account/profile).
 *
 * Behavior changes vs. pre-migration:
 *   - GET / PATCH: invalid query / body shape now returns the runner's
 *     `VALIDATION_ERROR` envelope with per-field details (was: a
 *     hand-constructed `ValidationError` with a single message). Same 400.
 *   - Business-rule errors ('Generate your compliance checklist before
 *     enabling transparency' and 'Transparency scope acknowledgment is
 *     required before enabling') stay as in-route `ValidationError` —
 *     messages preserved verbatim because the consumer hook surfaces
 *     `json.error?.message` directly.
 *   - Both: header/query (header/body) mismatch already returned 404
 *     pre-migration via `resolveEffectiveCommunityId`; NO migration delta
 *     here (drain #4 precedent).
 */
import { runRoute } from '@propertypro/api-contract';
import { logAuditEvent } from '@propertypro/db';
import { getFeaturesForCommunity } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePermission } from '@/lib/db/access-control';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import {
  ensureTransparencyChecklistInitialized,
  getTransparencySettings,
  setTransparencySettings,
} from '@/lib/services/transparency-service';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import {
  getTransparencySettingsContract,
  patchTransparencySettingsContract,
} from './contract';

export const GET = withErrorHandler(
  runRoute(getTransparencySettingsContract, async ({ query, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    const features = getFeaturesForCommunity(membership.communityType);

    if (!features.hasTransparencyPage) {
      throw new NotFoundError(
        'Transparency settings are not available for this community type',
      );
    }

    requirePermission(membership, 'settings', 'read');

    const settings = await getTransparencySettings(communityId);
    if (!settings) {
      throw new NotFoundError('Community not found');
    }

    return {
      enabled: settings.enabled,
      acknowledgedAt: settings.acknowledgedAt
        ? settings.acknowledgedAt.toISOString()
        : null,
    };
  }),
);

export const PATCH = withErrorHandler(
  runRoute(patchTransparencySettingsContract, async ({ body, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    const features = getFeaturesForCommunity(membership.communityType);

    if (!features.hasTransparencyPage) {
      throw new NotFoundError(
        'Transparency settings are not available for this community type',
      );
    }

    requirePermission(membership, 'settings', 'write');

    const current = await getTransparencySettings(communityId);
    if (!current) {
      throw new NotFoundError('Community not found');
    }

    let acknowledgedAt = current.acknowledgedAt;

    if (body.enabled) {
      const checklistRows = await ensureTransparencyChecklistInitialized(
        communityId,
        membership.communityType,
      );

      if (checklistRows.length === 0) {
        throw new ValidationError(
          'Generate your compliance checklist before enabling transparency',
        );
      }

      if (!acknowledgedAt) {
        if (body.acknowledged !== true) {
          throw new ValidationError(
            'Transparency scope acknowledgment is required before enabling',
          );
        }
        acknowledgedAt = new Date();
      }
    }

    await setTransparencySettings(communityId, {
      enabled: body.enabled,
      acknowledgedAt,
    });

    await logAuditEvent({
      userId,
      action: 'settings_changed',
      resourceType: 'transparency',
      resourceId: String(communityId),
      communityId,
      oldValues: {
        enabled: current.enabled,
        acknowledgedAt: current.acknowledgedAt
          ? current.acknowledgedAt.toISOString()
          : null,
      },
      newValues: {
        enabled: body.enabled,
        acknowledgedAt: acknowledgedAt ? acknowledgedAt.toISOString() : null,
      },
    });

    return {
      enabled: body.enabled,
      acknowledgedAt: acknowledgedAt ? acknowledgedAt.toISOString() : null,
    };
  }),
);
