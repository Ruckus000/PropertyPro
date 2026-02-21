'use server';

/**
 * Checkout server action — P2-34
 *
 * Called from the checkout page client component to obtain the clientSecret
 * needed to mount Stripe EmbeddedCheckout.
 *
 * Accepts email_verified or checkout_started status to handle page refreshes
 * gracefully (returns the existing session rather than creating a duplicate).
 */
import { eq } from '@propertypro/db/filters';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { pendingSignups } from '@propertypro/db';
import {
  createEmbeddedCheckoutSession,
  retrieveCheckoutSession,
} from '@/lib/services/stripe-service';
import type { SignupPlanId } from '@/lib/auth/signup-schema';
import { headers } from 'next/headers';
import { requireCommunityType } from '@/lib/utils/community-validators';

export interface CheckoutSessionResult {
  clientSecret: string;
  sessionId: string;
}

export async function createCheckoutSession(
  signupRequestId: string,
): Promise<CheckoutSessionResult> {
  const db = createUnscopedClient();

  const rows = await db
    .select()
    .from(pendingSignups)
    .where(eq(pendingSignups.signupRequestId, signupRequestId))
    .limit(1);

  const signup = rows[0];

  if (!signup) {
    throw new Error('Signup not found');
  }

  if (signup.status !== 'email_verified' && signup.status !== 'checkout_started') {
    throw new Error(`Cannot start checkout from status "${signup.status}"`);
  }

  // If already checkout_started, retrieve the existing session to avoid
  // creating a duplicate. The clientSecret from the original session is still valid.
  if (signup.status === 'checkout_started') {
    // The sessionId was stored in the payload during the original checkout creation.
    // Fall through to create a new session if missing (idempotent recovery).
    const storedSessionId =
      signup.payload &&
      typeof signup.payload === 'object' &&
      'stripeCheckoutSessionId' in signup.payload
        ? (signup.payload.stripeCheckoutSessionId as string | undefined)
        : undefined;

    if (storedSessionId) {
      const existingSession = await retrieveCheckoutSession(storedSessionId);
      if (existingSession.client_secret) {
        return { clientSecret: existingSession.client_secret, sessionId: storedSessionId };
      }
    }
    // Session missing or expired — fall through to create a fresh one
  }

  // Determine the base URL for the return_url
  const headerStore = await headers();
  const host = headerStore.get('host') ?? 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const returnBaseUrl = `${protocol}://${host}`;

  const planId = signup.planKey as SignupPlanId;
  const communityType = requireCommunityType(
    signup.communityType,
    `createCheckoutSession(signupRequestId=${signupRequestId})`,
  );

  const result = await createEmbeddedCheckoutSession(
    signupRequestId,
    communityType,
    planId,
    signup.candidateSlug,
    signup.email,
    returnBaseUrl,
  );

  // Persist the sessionId in the payload for page-refresh recovery
  await db
    .update(pendingSignups)
    .set({
      payload: {
        ...(typeof signup.payload === 'object' && signup.payload !== null ? signup.payload : {}),
        stripeCheckoutSessionId: result.sessionId,
      },
      updatedAt: new Date(),
    })
    .where(eq(pendingSignups.signupRequestId, signupRequestId));

  return result;
}
