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
import {
  generateAndCacheLoginToken,
  getPendingSignupBySignupRequestId,
  getProvisioningJobBySignupRequestId,
} from '@/lib/services/provisioning-service';

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const signupRequestId = searchParams.get('signupRequestId');

  if (!signupRequestId) {
    return NextResponse.json(
      { error: 'signupRequestId query parameter is required' },
      { status: 400 },
    );
  }

  // Look up the provisioning job
  const job = await getProvisioningJobBySignupRequestId(signupRequestId);

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
    const signup = await getPendingSignupBySignupRequestId(signupRequestId);

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

    // Generate fresh magic link token (and cache it for subsequent polls)
    const loginToken = await generateAndCacheLoginToken(
      signupRequestId,
      signup.email,
      payload,
    );
    if (!loginToken) {
      return NextResponse.json(
        { error: 'Failed to generate login token' },
        { status: 500 },
      );
    }

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
