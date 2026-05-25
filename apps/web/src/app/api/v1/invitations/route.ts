/**
 * Invitations API
 *
 * POST   /api/v1/invitations      — create an invitation and send email
 * PATCH  /api/v1/invitations      — accept invitation (one-time-use token)
 *
 * Invariants:
 * - withErrorHandler wrapper for structured errors
 * - Tenant lookups + writes go through `invitations-service` (A3 drain #60)
 * - Log audit events for invitation creation and consumption
 *
 * Pre-A3-drain-#60 the route did 5 separate `scoped.query(table)` + JS
 * `.find()` lookups (community, user, user-role, invitation-by-token,
 * accept-time user-by-id). Helpers in invitations-service replace those
 * with targeted `selectFrom(..., eq(pk, value))` lookups.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { logAuditEvent } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError, NotFoundError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { InvitationEmail, sendEmail } from '@propertypro/email';
import { createElement } from 'react';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import {
  createInvitation,
  createSupabaseAuthUserFromInvitation,
  findInvitationByToken,
  getCommunityNameForInvitation,
  getUserForInvitation,
  getUserRoleForInvitation,
  markInvitationConsumed,
} from '@/lib/services/invitations-service';

const createInvitationSchema = z.object({
  communityId: z.number().int().positive(),
  userId: z.string().min(1),
  /** Optional override for expiry; default 7 days */
  ttlDays: z.number().int().min(0).max(30).optional(),
});

const acceptInvitationSchema = z.object({
  communityId: z.number().int().positive(),
  token: z.string().min(1),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[0-9]/, 'Password must contain a number')
    .regex(/[^a-zA-Z0-9]/, 'Password must contain a special character'),
});

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// ---------------------------------------------------------------------------
// POST — create an invitation and send email
// ---------------------------------------------------------------------------

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parsed = createInvitationSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Validation failed');
  }

  const communityId = resolveEffectiveCommunityId(req, parsed.data.communityId);
  await assertNotDemoGrace(communityId);
  const { userId, ttlDays } = parsed.data;
  await requireCommunityMembership(communityId, actorUserId);

  // Load community for branding
  const community = await getCommunityNameForInvitation(communityId);
  if (!community) {
    throw new NotFoundError(`Community ${communityId} not found`);
  }

  // Load user and role within this community
  const user = await getUserForInvitation(communityId, userId);
  if (!user) {
    throw new NotFoundError(`User ${userId} not found`);
  }

  const role = (await getUserRoleForInvitation(communityId, userId)) ?? 'resident';

  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const expiresAt = addDays(new Date(), ttlDays ?? 7);

  await createInvitation({
    communityId,
    userId,
    invitedBy: actorUserId,
    token,
    expiresAt,
  });

  const inviteUrl = `${getBaseUrl()}/auth/accept-invite?token=${encodeURIComponent(token)}&communityId=${communityId}`;

  await sendEmail({
    to: user.email,
    subject: `You're invited to ${community.name} on PropertyPro`,
    category: 'transactional',
    react: createElement(InvitationEmail, {
      branding: { communityName: community.name },
      inviteeName: user.fullName ?? 'there',
      inviterName: req.headers.get('x-user-full-name') || req.headers.get('x-user-email') || 'Your administrator',
      role,
      inviteUrl,
      expiresInDays: ttlDays ?? 7,
    }),
  });

  await logAuditEvent({
    userId: actorUserId,
    action: 'user_invited',
    resourceType: 'invitation',
    resourceId: token,
    communityId,
    newValues: { userId, expiresAt: expiresAt.toISOString() },
  });

  return NextResponse.json({ data: { success: true } });
});

// ---------------------------------------------------------------------------
// PATCH — accept an invitation using token (one-time use)
// ---------------------------------------------------------------------------

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const body: unknown = await req.json();
  const parsed = acceptInvitationSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Validation failed');
  }

  // Token-authenticated exception: invitation acceptance does not require
  // an authenticated session user. Middleware allows this endpoint through.
  const communityId = resolveEffectiveCommunityId(req, parsed.data.communityId);
  await assertNotDemoGrace(communityId);
  const { token, password } = parsed.data;

  const invitation = await findInvitationByToken(communityId, token);

  if (!invitation) {
    throw new NotFoundError('Invitation not found');
  }

  if (invitation.consumedAt) {
    return NextResponse.json(
      { error: { code: 'TOKEN_USED', message: 'This invitation link has already been used.' } },
      { status: 400 },
    );
  }

  const expiresAt = invitation.expiresAt instanceof Date
    ? invitation.expiresAt
    : new Date(String(invitation.expiresAt));
  if (Date.now() >= expiresAt.getTime()) {
    return NextResponse.json(
      { error: { code: 'TOKEN_EXPIRED', message: 'This invitation link has expired.' } },
      { status: 400 },
    );
  }

  const userId = invitation.userId;

  // Load the user's email for account creation
  const user = await getUserForInvitation(communityId, userId);
  if (!user) {
    throw new NotFoundError(`User ${userId} not found`);
  }

  // Create Supabase auth user via admin client. Note: this does not sign in.
  // Client-side form will sign in after success, using returned email.
  const result = await createSupabaseAuthUserFromInvitation({
    email: user.email,
    password,
    fullName: user.fullName,
    externalUserId: userId,
  });

  if (!result.ok) {
    throw new ValidationError('Failed to create user');
  }

  await markInvitationConsumed(communityId, token, new Date());

  await logAuditEvent({
    userId,
    action: 'update',
    resourceType: 'invitation',
    resourceId: token,
    communityId,
    newValues: { consumedAt: new Date().toISOString() },
  });

  return NextResponse.json({ data: { success: true, email: user.email } });
});
