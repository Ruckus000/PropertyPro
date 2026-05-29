/**
 * POST /api/v1/demo/[slug]/self-service-upgrade
 *
 * Creates a Stripe checkout session for self-service demo-to-paid conversion.
 * The Stripe webhook handler completes the conversion when checkout succeeds
 * (same handleDemoConversion() path as admin-initiated conversions).
 *
 * Auth: Supabase SSR cookie-based session. User must be one of the demo
 * instance's user IDs (board or resident demo user).
 *
 * Plan A1 drain #149. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for schemas and auth-chain rationale.
 */
import Stripe from 'stripe';
import { computeDemoStatus } from '@propertypro/shared';
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { NotFoundError } from '@/lib/api/errors/NotFoundError';
import { ForbiddenError } from '@/lib/api/errors';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { resolveStripePrice } from '@/lib/services/stripe-service';
import { isPlanAvailableForCommunityType } from '@/lib/auth/signup-schema';
import { emitConversionEvent } from '@/lib/services/conversion-events';
import { createServerClient } from '@/lib/supabase/server';
import { getDemoInstanceForUpgrade } from '@/lib/services/demo-conversion';
import { demoSelfServiceUpgradePostContract } from './contract';

export const POST = withErrorHandler(
  runRoute(demoSelfServiceUpgradePostContract, async ({ params, body, req }) => {
    const { slug } = params;

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new ForbiddenError('Authentication required');
    }

    const { planId, customerEmail, customerName } = body;

    const demo = await getDemoInstanceForUpgrade(slug);
    if (!demo || !demo.communityId) {
      throw new NotFoundError('Demo not found');
    }

    const isDemoUser =
      user.id === demo.demoResidentUserId || user.id === demo.demoBoardUserId;

    if (!isDemoUser) {
      throw new ForbiddenError('Not authorized for this demo');
    }

    if (!demo.isDemo) {
      throw new ValidationError('This demo has already been converted', {
        slug: 'Community is no longer a demo',
      });
    }

    const status = computeDemoStatus({
      isDemo: demo.isDemo,
      trialEndsAt: demo.trialEndsAt,
      demoExpiresAt: demo.demoExpiresAt,
      deletedAt: demo.deletedAt,
    });

    if (status === 'expired') {
      throw new ValidationError('This demo has expired', {
        slug: 'Demo has expired',
      });
    }

    if (!isPlanAvailableForCommunityType(demo.communityType, planId)) {
      throw new ValidationError('This plan is not available for this community type', {
        planId: 'Invalid plan for community type',
      });
    }
    const priceId = await resolveStripePrice(planId, demo.communityType, 'month');

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: customerEmail,
      success_url: `${req.nextUrl.origin}/demo/${slug}/converted?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.nextUrl.origin}/demo/${slug}/upgrade`,
      metadata: {
        demoId: String(demo.id),
        communityId: String(demo.communityId),
        planId,
        slug,
        customerEmail,
        customerName,
      },
    });

    await emitConversionEvent({
      communityId: demo.communityId,
      eventType: 'self_service_upgrade_started',
      source: 'web_app',
      dedupeKey: `community:${demo.communityId}:upgrade:${session.id}`,
      userId: user.id,
    });

    return { checkoutUrl: session.url };
  }),
);
