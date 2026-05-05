/**
 * Provisioning status polling endpoint.
 *
 * Called by the post-checkout ProvisioningProgress client component every 2s.
 * No auth required — secured by an unguessable signupRequestId UUID.
 *
 * The magic-link login token is now SINGLE-USE with a short TTL:
 *   - The first poll that observes status='completed' generates a token
 *     AND atomically marks pending_signups.login_token_consumed_at in the
 *     same update guarded by `WHERE login_token_consumed_at IS NULL`.
 *   - Subsequent polls (or any leaked-id replay) see the consumed marker
 *     and receive { status: 'consumed' } with no token.
 *   - If the issued token is older than TOKEN_TTL_MS without being consumed,
 *     a fresh token is generated. (Stale unused windows can happen if the
 *     genuine browser closed before consuming.)
 *
 * This closes the audit's leaked-`signupRequestId` replay scenario:
 * the genuine browser polls every 2s and consumes the token essentially
 * immediately; any later replay sees `consumed` and gets no token.
 */
import { NextResponse } from 'next/server';
import { and, eq, isNull, lt, or } from '@propertypro/db/filters';
import { provisioningJobs, pendingSignups } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { createAdminClient } from '@propertypro/db/supabase/admin';

const TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

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

  // In progress
  if (job.status !== 'completed') {
    return NextResponse.json({
      status: 'provisioning',
      step: job.lastSuccessfulStatus ?? 'initiated',
    });
  }

  // status === 'completed' — try to issue a single-use login token.
  const [signup] = await db
    .select({
      email: pendingSignups.email,
      signupRequestId: pendingSignups.signupRequestId,
      loginTokenConsumedAt: pendingSignups.loginTokenConsumedAt,
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

  // Already consumed — leaked-id replay or repeat poll after the genuine
  // browser already consumed the token. Surface as 'consumed' with no token.
  if (signup.loginTokenConsumedAt) {
    return NextResponse.json({
      status: 'consumed',
      step: 'completed',
      communityId: job.communityId,
    });
  }

  // Generate a fresh magic link token. Supabase magic links are themselves
  // single-use server-side; we layer single-use here at our boundary so a
  // replay never even reaches Supabase with the cached value.
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
  const now = new Date();
  const ttlCutoff = new Date(now.getTime() - TOKEN_TTL_MS);

  // Atomic single-use claim: set issued_at + consumed_at only if not already
  // consumed. If a concurrent poll claimed first, the update returns 0 rows
  // and we surface 'consumed' without leaking a second token.
  const [claimed] = await db
    .update(pendingSignups)
    .set({
      loginTokenIssuedAt: now,
      loginTokenConsumedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(pendingSignups.signupRequestId, signupRequestId),
        or(
          isNull(pendingSignups.loginTokenConsumedAt),
          lt(pendingSignups.loginTokenIssuedAt, ttlCutoff),
        ),
      ),
    )
    .returning({ id: pendingSignups.id });

  if (!claimed) {
    // A concurrent poll won the race in the brief window between our SELECT
    // and UPDATE. Don't return the freshly generated token — it would
    // double-issue. The other poller already received the canonical token.
    return NextResponse.json({
      status: 'consumed',
      step: 'completed',
      communityId: job.communityId,
    });
  }

  return NextResponse.json({
    status: 'completed',
    step: 'completed',
    loginToken,
    communityId: job.communityId,
  });
}
