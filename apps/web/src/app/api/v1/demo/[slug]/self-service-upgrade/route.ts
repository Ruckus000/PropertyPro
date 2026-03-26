/**
 * POST /api/v1/demo/[slug]/self-service-upgrade
 *
 * Creates a Stripe checkout session for self-service demo-to-paid conversion.
 * The Stripe webhook handler completes the conversion when checkout succeeds
 * (same handleDemoConversion() path as admin-initiated conversions).
 *
 * Auth: Supabase SSR cookie-based session. User must be one of the demo
 * instance's user IDs (board or resident demo user).
 */
import { NextResponse, type NextRequest } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import { eq, and, isNull } from '@propertypro/db/filters';
import { demoInstances, communities } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { PLAN_IDS } from '@propertypro/shared';
import { computeDemoStatus } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { NotFoundError } from '@/lib/api/errors/NotFoundError';
import { ForbiddenError } from '@/lib/api/errors';
import { ValidationError } from '@/lib/api/errors/ValidationError';
import { resolveStripePrice } from '@/lib/services/stripe-service';
import { isPlanAvailableForCommunityType } from '@/lib/auth/signup-schema';
import { emitConversionEvent } from '@/lib/services/conversion-events';
import { createServerClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

const upgradeBodySchema = z.object({
  planId: z.enum(PLAN_IDS),
  customerEmail: z.string().email('Valid email is required'),
  customerName: z.string().min(1, 'Customer name is required').max(200),
});

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export const POST = withErrorHandler(
  async (
    req: NextRequest,
    context: { params: Promise<{ slug: string }> },
  ): Promise<NextResponse> => {
    const { slug } = await context.params;

    // 0. Authenticate via Supabase SSR cookie session
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new ForbiddenError('Authentication required');
    }

    // 1. Validate request body
    const body = await req.json();
    const parsed = upgradeBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request body', {
        issues: parsed.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      });
    }

    const { planId, customerEmail, customerName } = parsed.data;

    // 2. Look up demo by slug
    const db = createUnscopedClient();
    const [demo] = await db
      .select({
        id: demoInstances.id,
        communityId: demoInstances.seededCommunityId,
        communityName: communities.name,
        communityType: communities.communityType,
        isDemo: communities.isDemo,
        trialEndsAt: communities.trialEndsAt,
        demoExpiresAt: communities.demoExpiresAt,
        deletedAt: communities.deletedAt,
        demoResidentUserId: demoInstances.demoResidentUserId,
        demoBoardUserId: demoInstances.demoBoardUserId,
      })
      .from(demoInstances)
      .innerJoin(communities, eq(demoInstances.seededCommunityId, communities.id))
      .where(
        and(
          eq(demoInstances.slug, slug),
          isNull(demoInstances.deletedAt),
        ),
      )
      .limit(1);

    if (!demo || !demo.communityId) {
      throw new NotFoundError('Demo not found');
    }

    // 3. Verify caller is a demo user
    const isDemoUser =
      user.id === demo.demoResidentUserId ||
      user.id === demo.demoBoardUserId;

    if (!isDemoUser) {
      throw new ForbiddenError('Not authorized for this demo');
    }

    // 4. Check demo status
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

    // 5. Validate plan for community type + resolve price from DB
    if (!isPlanAvailableForCommunityType(demo.communityType, planId)) {
      throw new ValidationError('This plan is not available for this community type', {
        planId: 'Invalid plan for community type',
      });
    }
    const priceId = await resolveStripePrice(planId, demo.communityType, 'month');

    // 6. Create Stripe checkout session — same metadata shape as admin convert
    //    so handleDemoConversion() works unchanged
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

    // 7. Emit self_service_upgrade_started event (awaited best-effort)
    await emitConversionEvent({
      communityId: demo.communityId,
      eventType: 'self_service_upgrade_started',
      source: 'web_app',
      dedupeKey: `community:${demo.communityId}:upgrade:${session.id}`,
      userId: user.id,
    });

    return NextResponse.json({ checkoutUrl: session.url });
  },
);
