import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import {
  createScopedClient,
  notificationPreferences,
  logAuditEvent,
} from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { getDefaultPreferences } from '@/lib/utils/email-preferences';

const communityIdSchema = z.coerce.number().int().positive();

const patchSchema = z.object({
  communityId: z.number().int().positive(),
  emailAnnouncements: z.boolean(),
  emailDocuments: z.boolean(),
  emailMeetings: z.boolean(),
  emailMaintenance: z.boolean(),
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
        emailAnnouncements: (row['emailAnnouncements'] as boolean | undefined) ?? true,
        emailDocuments: (row['emailDocuments'] as boolean | undefined) ?? true,
        emailMeetings: (row['emailMeetings'] as boolean | undefined) ?? true,
        emailMaintenance: (row['emailMaintenance'] as boolean | undefined) ?? true,
      }
    : { userId, communityId, ...defaults };

  return NextResponse.json({ data });
});

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json();
  const result = patchSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError('Invalid preference update payload');
  }

  const communityId = resolveEffectiveCommunityId(req, result.data.communityId);
  const {
    emailAnnouncements,
    emailDocuments,
    emailMeetings,
    emailMaintenance,
  } = result.data;
  const userId = await requireAuthenticatedUserId();
  await requireCommunityMembership(communityId, userId);

  const scoped = createScopedClient(communityId);
  const existing = (await scoped.query(notificationPreferences)).find(
    (r) => r['userId'] === userId,
  );

  const updateValues = {
    emailAnnouncements,
    emailDocuments,
    emailMeetings,
    emailMaintenance,
  } as const;

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
  });

  return NextResponse.json({
    data: { userId, communityId, ...updateValues },
  });
});
