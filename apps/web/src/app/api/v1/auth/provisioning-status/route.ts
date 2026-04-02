/**
 * Provisioning status polling endpoint.
 *
 * Called by the post-checkout ProvisioningProgress client component every 2s.
 * No auth required — secured by unguessable signupRequestId UUID.
 *
 * Returns current provisioning step. On completion, generates a one-time
 * magic link token (cached in pending_signups.payload) for auto-login.
 */
import { NextResponse } from 'next/server';
import { eq } from '@propertypro/db/filters';
import { provisioningJobs, pendingSignups } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { createAdminClient } from '@propertypro/db/supabase/admin';

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const signupRequestId = searchParams.get('signupRequestId');

  if (!signupRequestId) {
    return NextResponse.json(
      { error: 'signupRequestId query parameter is required' },
      { status: 400 },
    );
  }

  const db = createUnscopedClient();

  // Look up the provisioning job
  const [job] = await db
    .select({
      id: provisioningJobs.id,
      signupRequestId: provisioningJobs.signupRequestId,
      communityId: provisioningJobs.communityId,
      status: provisioningJobs.status,
      lastSuccessfulStatus: provisioningJobs.lastSuccessfulStatus,
    })
    .from(provisioningJobs)
    .where(eq(provisioningJobs.signupRequestId, signupRequestId))
    .limit(1);

  // No job yet — webhook hasn't fired. Normal during the first few polls.
  if (!job) {
    return NextResponse.json({ status: 'pending', step: 'waiting' });
  }

  // Failed
  if (job.status === 'failed') {
    return NextResponse.json({
      status: 'failed',
      step: job.lastSuccessfulStatus ?? 'initiated',
    });
  }

  // Completed — generate or return cached magic link token
  if (job.status === 'completed') {
    const [signup] = await db
      .select({
        email: pendingSignups.email,
        payload: pendingSignups.payload,
        signupRequestId: pendingSignups.signupRequestId,
      })
      .from(pendingSignups)
      .where(eq(pendingSignups.signupRequestId, signupRequestId))
      .limit(1);

    if (!signup) {
      return NextResponse.json(
        { error: 'Signup record not found' },
        { status: 500 },
      );
    }

    // Check for cached token in payload
    const payload = (signup.payload ?? {}) as Record<string, unknown>;
    const cachedToken = typeof payload.loginToken === 'string' ? payload.loginToken : null;

    if (cachedToken) {
      return NextResponse.json({
        status: 'completed',
        step: 'completed',
        loginToken: cachedToken,
        communityId: job.communityId,
      });
    }

    // Generate fresh magic link token
    const admin = createAdminClient();
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: signup.email,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error(
        '[provisioning-status] Failed to generate magic link:',
        linkError?.message,
      );
      return NextResponse.json(
        { error: 'Failed to generate login token' },
        { status: 500 },
      );
    }

    const loginToken: string = linkData.properties.hashed_token;

    // Cache the token in pending_signups.payload so subsequent polls reuse it
    await db
      .update(pendingSignups)
      .set({
        payload: { ...payload, loginToken },
      })
      .where(eq(pendingSignups.signupRequestId, signupRequestId));

    return NextResponse.json({
      status: 'completed',
      step: 'completed',
      loginToken,
      communityId: job.communityId,
    });
  }

  // In progress
  return NextResponse.json({
    status: 'provisioning',
    step: job.lastSuccessfulStatus ?? 'initiated',
  });
}
