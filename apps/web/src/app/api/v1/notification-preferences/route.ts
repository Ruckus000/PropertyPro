/**
 * Notification Preferences API (P1-26)
 *
 * GET    /api/v1/notification-preferences?communityId=N  — read preferences for current user
 * PATCH  /api/v1/notification-preferences                 — update preferences for current user
 *
 * Invariants:
 * - withErrorHandler wrapper (structured errors, request ID)
 * - Tenant isolation via createScopedClient(communityId)
 * - Auth via requireAuthenticatedUserId + requireCommunityMembership
 * - Audit log on updates with action 'settings_changed'
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createScopedClient,
  notificationPreferences,
  logAuditEvent,
} from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import {
  getDefaultPreferences,
  type EmailFrequency,
} from '@/lib/utils/email-preferences';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { tryAutoComplete } from '@/lib/services/onboarding-checklist-service';

const communityIdSchema = z.coerce.number().int().positive();
const emailFrequencySchema = z.enum([
  'immediate',
  'daily_digest',
  'weekly_digest',
  'never',
]) as z.ZodType<EmailFrequency>;

const patchSchema = z.object({
  communityId: z.number().int().positive(),
  emailFrequency: emailFrequencySchema.default('immediate'),
  emailAnnouncements: z.boolean(),
  emailMeetings: z.boolean(),
  inAppEnabled: z.boolean(),
  // Phase 1B: SMS consent fields (optional — backwards-compatible)
  smsEnabled: z.boolean().optional(),
  smsEmergencyOnly: z.boolean().optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const parsed = communityIdSchema.safeParse(searchParams.get('communityId'));
  if (!parsed.success) {
    throw new ValidationError('Invalid or missing communityId');
  }

  const communityId = resolveEffectiveCommunityId(req, parsed.data);
  const userId = await requireAuthenticatedUserId();
  await requireCommunityMembership(communityId, userId);

  const scoped = createScopedClient(communityId);
  const rows = await scoped.query(notificationPreferences);
  const row = rows.find((r) => r['userId'] === userId);

  const defaults = getDefaultPreferences();

  const data = row
    ? {
        userId,
        communityId,
        emailFrequency: (row['emailFrequency'] as EmailFrequency | undefined) ?? 'immediate',
        emailAnnouncements: (row['emailAnnouncements'] as boolean | undefined) ?? true,
        emailMeetings: (row['emailMeetings'] as boolean | undefined) ?? true,
        inAppEnabled: (row['inAppEnabled'] as boolean | undefined) ?? true,
        // Phase 1B: SMS consent fields
        smsEnabled: (row['smsEnabled'] as boolean | undefined) ?? false,
        smsEmergencyOnly: (row['smsEmergencyOnly'] as boolean | undefined) ?? true,
        smsConsentGivenAt: (row['smsConsentGivenAt'] as string | null) ?? null,
        smsConsentRevokedAt: (row['smsConsentRevokedAt'] as string | null) ?? null,
      }
    : { userId, communityId, ...defaults, smsEnabled: false, smsEmergencyOnly: true, smsConsentGivenAt: null, smsConsentRevokedAt: null };

  return NextResponse.json({ data });
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json();
  const result = patchSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid preference update payload');
  }

  const communityId = resolveEffectiveCommunityId(req, result.data.communityId);
  await assertNotDemoGrace(communityId);
  const { emailFrequency, emailAnnouncements, emailMeetings, inAppEnabled, smsEnabled, smsEmergencyOnly } = result.data;
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown';
  const userAgent = req.headers.get('user-agent') ?? 'unknown';

  const userId = await requireAuthenticatedUserId();
  await requireCommunityMembership(communityId, userId);

  const scoped = createScopedClient(communityId);

  const existing = (await scoped.query(notificationPreferences)).find(
    (r) => r['userId'] === userId,
  );

  const updateValues: Record<string, unknown> = {
    emailFrequency,
    emailAnnouncements,
    emailMeetings,
    inAppEnabled,
  };

  // Phase 1B: Handle SMS consent with TCPA timestamps
  if (smsEnabled !== undefined) {
    updateValues['smsEnabled'] = smsEnabled;
    if (smsEnabled) {
      // Only set consent timestamp if not already set
      const existingConsent = existing?.['smsConsentGivenAt'];
      const existingRevoked = existing?.['smsConsentRevokedAt'];
      if (!existingConsent || existingRevoked) {
        updateValues['smsConsentGivenAt'] = new Date();
        updateValues['smsConsentRevokedAt'] = null;
        updateValues['smsConsentMethod'] = 'web_form';
      }
    } else {
      // Record revocation timestamp (TCPA requires tracking)
      const existingConsent = existing?.['smsConsentGivenAt'];
      if (existingConsent) {
        updateValues['smsConsentRevokedAt'] = new Date();
      }
    }
  }
  if (smsEmergencyOnly !== undefined) {
    updateValues['smsEmergencyOnly'] = smsEmergencyOnly;
  }

  if (!existing) {
    await scoped.insert(notificationPreferences, {
      userId,
      ...updateValues,
    });
  } else {
    await scoped.update(
      notificationPreferences,
      updateValues,
      eq(notificationPreferences.userId, userId),
    );
  }

  await logAuditEvent({
    userId,
    action: 'settings_changed',
    resourceType: 'notification_preferences',
    resourceId: `${userId}:${communityId}`,
    communityId,
    newValues: updateValues as unknown as Record<string, unknown>,
    metadata: {
      ip,
      userAgent,
      ...(smsEnabled !== undefined ? { consentMethod: 'web_form' } : {}),
    },
  });

  void tryAutoComplete(communityId, userId, 'update_preferences');

  return NextResponse.json({
    data: { userId, communityId, ...updateValues },
  });
});
