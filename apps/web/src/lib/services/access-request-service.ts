/**
 * Access Request Service — self-service resident signup with OTP verification.
 *
 * Flow: submit → OTP email → verify → admin reviews → approve/deny.
 * Approval creates a Supabase auth user + users row + user_roles row.
 */

import crypto from 'node:crypto';
import { createElement } from 'react';

import {
  createScopedClient,
  accessRequests,
  users,
  userRoles,
  communities,
  notificationPreferences,
  logAuditEvent,
} from '@propertypro/db';
import { eq, and, isNull } from '@propertypro/db/filters';
import {
  OtpVerificationEmail,
  AccessRequestPendingEmail,
  AccessRequestApprovedEmail,
  AccessRequestDeniedEmail,
  sendEmail,
} from '@propertypro/email';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { ValidationError, NotFoundError } from '@/lib/api/errors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

function hashOtp(otp: string): string {
  const secret = process.env.OTP_HMAC_SECRET ?? 'dev-secret';
  return crypto.createHmac('sha256', secret).update(otp).digest('hex');
}

function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

// ---------------------------------------------------------------------------
// submitAccessRequest
// ---------------------------------------------------------------------------

export async function submitAccessRequest(params: {
  communityId: number;
  communitySlug: string;
  email: string;
  fullName: string;
  phone?: string;
  claimedUnitNumber?: string;
  isUnitOwner: boolean;
  refCode?: string;
}): Promise<{ requestId: number; resent: boolean }> {
  const { communityId, email, fullName, phone, claimedUnitNumber, isUnitOwner, refCode } = params;
  const normalizedEmail = email.toLowerCase();
  const scoped = createScopedClient(communityId);

  // Check for existing pending_verification request (same email + community)
  const existingRequests = await scoped.query(accessRequests);
  const pendingVerification = existingRequests.find(
    (r) =>
      (r['email'] as string).toLowerCase() === normalizedEmail &&
      r['status'] === 'pending_verification',
  );

  if (pendingVerification) {
    // Resend OTP
    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await scoped.update(
      accessRequests,
      { otpHash, otpExpiresAt, otpAttempts: 0 },
      eq(accessRequests.id, pendingVerification['id'] as number),
    );

    // Load community for branding
    const communityRows = await scoped.query(communities);
    const community = communityRows[0];

    await sendEmail({
      to: normalizedEmail,
      subject: `Your verification code for ${(community?.['name'] as string) ?? 'PropertyPro'}`,
      category: 'transactional',
      react: createElement(OtpVerificationEmail, {
        branding: { communityName: (community?.['name'] as string) ?? 'PropertyPro' },
        recipientName: (pendingVerification['fullName'] as string) ?? fullName,
        otpCode: otp,
        expiresInMinutes: 10,
      }),
    });

    return { requestId: pendingVerification['id'] as number, resent: true };
  }

  // Check if email already belongs to a community member
  const existingUsers = await scoped.query(users);
  const existingUser = existingUsers.find(
    (u) => (u['email'] as string).toLowerCase() === normalizedEmail,
  );

  if (existingUser) {
    const existingRoles = await scoped.query(userRoles);
    const hasRole = existingRoles.some((r) => r['userId'] === existingUser['id']);
    if (hasRole) {
      throw new ValidationError('This email is already associated with a member of this community.');
    }
  }

  // Generate OTP
  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

  // Insert access request
  const inserted = await scoped.insert(accessRequests, {
    email: normalizedEmail,
    fullName,
    phone: phone ?? null,
    claimedUnitNumber: claimedUnitNumber ?? null,
    isUnitOwner,
    status: 'pending_verification',
    otpHash,
    otpExpiresAt,
    otpAttempts: 0,
    refCode: refCode ?? null,
  });

  const row = inserted[0] as Record<string, unknown>;

  // Load community for branding
  const communityRows = await scoped.query(communities);
  const community = communityRows[0];

  // Send OTP email
  await sendEmail({
    to: normalizedEmail,
    subject: `Your verification code for ${(community?.['name'] as string) ?? 'PropertyPro'}`,
    category: 'transactional',
    react: createElement(OtpVerificationEmail, {
      branding: { communityName: (community?.['name'] as string) ?? 'PropertyPro' },
      recipientName: fullName,
      otpCode: otp,
      expiresInMinutes: 10,
    }),
  });

  return { requestId: row['id'] as number, resent: false };
}

// ---------------------------------------------------------------------------
// verifyOtp
// ---------------------------------------------------------------------------

export async function verifyOtp(params: {
  requestId: number;
  otp: string;
  communityId: number;
}): Promise<{ verified: true }> {
  const { requestId, otp, communityId } = params;
  const scoped = createScopedClient(communityId);

  // Query access request
  const rows = await scoped.query(accessRequests);
  const request = rows.find((r) => r['id'] === requestId);

  if (!request) {
    throw new NotFoundError('Access request not found');
  }

  if (request['status'] !== 'pending_verification') {
    throw new ValidationError('This request has already been verified.');
  }

  // Check max attempts
  if ((request['otpAttempts'] as number) >= 5) {
    throw new ValidationError('Maximum verification attempts exceeded. Please submit a new request.');
  }

  // Check expiry
  const expiresAt = new Date(request['otpExpiresAt'] as string);
  if (expiresAt < new Date()) {
    throw new ValidationError('Verification code has expired. Please request a new one.');
  }

  // Verify OTP with timing-safe comparison
  const computedHash = hashOtp(otp);
  const storedHash = request['otpHash'] as string;

  const isValid = crypto.timingSafeEqual(
    Buffer.from(computedHash, 'hex'),
    Buffer.from(storedHash, 'hex'),
  );

  if (!isValid) {
    // Increment attempts
    await scoped.update(
      accessRequests,
      { otpAttempts: (request['otpAttempts'] as number) + 1 },
      eq(accessRequests.id, requestId),
    );
    throw new ValidationError('Invalid verification code.');
  }

  // OTP correct — transition to pending
  await scoped.update(
    accessRequests,
    {
      status: 'pending',
      emailVerifiedAt: new Date(),
    },
    eq(accessRequests.id, requestId),
  );

  // Send admin notification
  const communityRows = await scoped.query(communities);
  const community = communityRows[0];
  const communityName = (community?.['name'] as string) ?? 'PropertyPro';

  // Find admin users to notify
  const roleRows = await scoped.query(userRoles);
  const adminRoles = roleRows.filter((r) => {
    const presetKey = r['presetKey'] as string | null;
    return (
      presetKey === 'board_president' ||
      presetKey === 'cam' ||
      r['role'] === 'pm_admin'
    );
  });

  const userRows = await scoped.query(users);
  const dashboardUrl = `${getBaseUrl()}/dashboard/residents`;

  for (const adminRole of adminRoles) {
    const adminUser = userRows.find((u) => u['id'] === adminRole['userId']);
    if (!adminUser) continue;

    await sendEmail({
      to: adminUser['email'] as string,
      subject: `New resident access request for ${communityName}`,
      category: 'transactional',
      react: createElement(AccessRequestPendingEmail, {
        branding: { communityName },
        adminName: (adminUser['fullName'] as string) ?? 'Admin',
        requesterName: request['fullName'] as string,
        requesterEmail: request['email'] as string,
        claimedUnit: (request['claimedUnitNumber'] as string) ?? undefined,
        dashboardUrl,
      }),
    });
  }

  return { verified: true };
}

// ---------------------------------------------------------------------------
// approveAccessRequest
// ---------------------------------------------------------------------------

export async function approveAccessRequest(params: {
  requestId: number;
  communityId: number;
  reviewerId: string;
  unitId?: number;
}): Promise<{ userId: string }> {
  const { requestId, communityId, reviewerId, unitId } = params;
  const scoped = createScopedClient(communityId);

  // Query request
  const rows = await scoped.query(accessRequests);
  const request = rows.find((r) => r['id'] === requestId);

  if (!request) {
    throw new NotFoundError('Access request not found');
  }

  if (request['status'] !== 'pending') {
    throw new ValidationError('Only pending requests can be approved.');
  }

  const requestEmail = (request['email'] as string).toLowerCase();
  const requestFullName = request['fullName'] as string;
  const requestPhone = request['phone'] as string | null;
  const requestIsUnitOwner = request['isUnitOwner'] as boolean;

  // Create Supabase auth user
  const supabase = createAdminClient();
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: requestEmail,
    email_confirm: true,
    user_metadata: { full_name: requestFullName },
  });

  if (authError || !authData?.user) {
    // Do NOT update request status so admin can retry
    throw new Error(`Failed to create auth user: ${authError?.message ?? 'Unknown error'}`);
  }

  const userId = authData.user.id;

  // Insert users row
  await scoped.insert(users, {
    id: userId,
    email: requestEmail,
    fullName: requestFullName,
    phone: requestPhone,
  });

  // Insert user_roles row
  await scoped.insert(userRoles, {
    userId,
    role: 'resident',
    unitId: unitId ?? null,
    isUnitOwner: requestIsUnitOwner,
    displayTitle: requestIsUnitOwner ? 'Owner' : 'Tenant',
  });

  // Create notification preferences
  await scoped.insert(notificationPreferences, {
    userId,
  });

  // Update access request status
  await scoped.update(
    accessRequests,
    {
      status: 'approved',
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      unitId: unitId ?? null,
    },
    eq(accessRequests.id, requestId),
  );

  // Send welcome email
  const communityRows = await scoped.query(communities);
  const community = communityRows[0];
  const communityName = (community?.['name'] as string) ?? 'PropertyPro';
  const loginUrl = `${getBaseUrl()}/auth/login`;

  await sendEmail({
    to: requestEmail,
    subject: `Welcome to ${communityName} on PropertyPro`,
    category: 'transactional',
    react: createElement(AccessRequestApprovedEmail, {
      branding: { communityName },
      recipientName: requestFullName,
      loginUrl,
    }),
  });

  // Audit log
  await logAuditEvent({
    userId: reviewerId,
    action: 'access_request.approved',
    resourceType: 'access_request',
    resourceId: String(requestId),
    communityId,
    newValues: {
      email: requestEmail,
      fullName: requestFullName,
      createdUserId: userId,
    },
  });

  return { userId };
}

// ---------------------------------------------------------------------------
// denyAccessRequest
// ---------------------------------------------------------------------------

export async function denyAccessRequest(params: {
  requestId: number;
  communityId: number;
  reviewerId: string;
  reason?: string;
}): Promise<void> {
  const { requestId, communityId, reviewerId, reason } = params;
  const scoped = createScopedClient(communityId);

  // Query request
  const rows = await scoped.query(accessRequests);
  const request = rows.find((r) => r['id'] === requestId);

  if (!request) {
    throw new NotFoundError('Access request not found');
  }

  if (request['status'] !== 'pending') {
    throw new ValidationError('Only pending requests can be denied.');
  }

  // Update status
  await scoped.update(
    accessRequests,
    {
      status: 'denied',
      denialReason: reason ?? null,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
    },
    eq(accessRequests.id, requestId),
  );

  // Send denial notification
  const communityRows = await scoped.query(communities);
  const community = communityRows[0];
  const communityName = (community?.['name'] as string) ?? 'PropertyPro';

  await sendEmail({
    to: request['email'] as string,
    subject: `Update on your access request for ${communityName}`,
    category: 'transactional',
    react: createElement(AccessRequestDeniedEmail, {
      branding: { communityName },
      recipientName: request['fullName'] as string,
      reason,
    }),
  });

  // Audit log
  await logAuditEvent({
    userId: reviewerId,
    action: 'access_request.denied',
    resourceType: 'access_request',
    resourceId: String(requestId),
    communityId,
    newValues: {
      email: request['email'] as string,
      reason: reason ?? null,
    },
  });
}

// ---------------------------------------------------------------------------
// listPendingRequests
// ---------------------------------------------------------------------------

export async function listPendingRequests(
  communityId: number,
): Promise<Record<string, unknown>[]> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.query(accessRequests);
  return rows.filter((r) => r['status'] === 'pending');
}
