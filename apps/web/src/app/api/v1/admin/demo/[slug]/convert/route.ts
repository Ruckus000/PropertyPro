/**
 * POST /api/v1/admin/demo/[slug]/convert
 *
 * Creates a Stripe checkout session for converting a demo community
 * into a paid subscription. The Stripe webhook handler will complete
 * the conversion when checkout succeeds.
 *
 * Auth: session-based (under /api/v1/ protected prefix) + pm_admin role check.
 */
import { NextResponse, type NextRequest } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import { eq, and, isNull } from '@propertypro/db/filters';
import { demoInstances, communities, userRoles } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { PLAN_IDS } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { NotFoundError } from '@/lib/api/errors/NotFoundError';
import { ForbiddenError } from '@/lib/api/errors';
import { ValidationError } from '@/lib/api/errors/ValidationError';

// ---------------------------------------------------------------------------
// CORS — admin app runs on a different origin
// ---------------------------------------------------------------------------

const ADMIN_ORIGINS = [
  'http://localhost:3001',
  process.env.ADMIN_APP_URL,
].filter(Boolean) as string[];

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ADMIN_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get('origin')),
  });
}

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

const convertBodySchema = z.object({
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
    const origin = req.headers.get('origin');

    // 0. Verify the caller has pm_admin role (platform-level operation)
    const userId = await requireAuthenticatedUserId();
    const db = createUnscopedClient();
    const adminCheck = await db
      .select({ id: userRoles.id })
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.role, 'pm_admin')))
      .limit(1);
    if (!adminCheck.length) {
      throw new ForbiddenError();
    }

    // 1. Validate request body
    const body = await req.json();
    const parsed = convertBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request body', {
        issues: parsed.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      });
    }

    const { planId, customerEmail, customerName } = parsed.data;

    // 2. Look up demo by slug (exclude soft-deleted communities)
    const [demo] = await db
      .select({
        id: demoInstances.id,
        communityId: demoInstances.seededCommunityId,
        communityName: communities.name,
        isDemo: communities.isDemo,
        demoExpiresAt: communities.demoExpiresAt,
      })
      .from(demoInstances)
      .innerJoin(communities, eq(demoInstances.seededCommunityId, communities.id))
      .where(
        and(
          eq(demoInstances.slug, slug),
          isNull(demoInstances.deletedAt),
          isNull(communities.deletedAt),
        ),
      )
      .limit(1);

    if (!demo || !demo.communityId) {
      throw new NotFoundError('Demo not found');
    }

    if (!demo.isDemo) {
      throw new ValidationError('This demo has already been converted', {
        slug: 'Community is no longer a demo',
      });
    }

    // Check expiry
    if (demo.demoExpiresAt && new Date(demo.demoExpiresAt) < new Date()) {
      throw new ValidationError('This demo has expired', {
        slug: 'Demo has expired',
      });
    }

    // 3. Resolve Stripe price ID from env
    const envKey = `STRIPE_PRICE_${planId.toUpperCase()}`;
    const priceId = process.env[envKey];
    if (!priceId) {
      throw new ValidationError(`No Stripe price configured for plan: ${planId}`, {
        planId: `Price not configured for plan ${planId}`,
      });
    }

    // 4. Create Stripe checkout session
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: customerEmail,
      success_url: `${req.nextUrl.origin}/demo/${slug}/converted?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.nextUrl.origin}/demo/${slug}`,
      metadata: {
        demoId: String(demo.id),
        communityId: String(demo.communityId),
        planId,
        slug,
        customerEmail,
        customerName,
      },
    });

    return NextResponse.json(
      { checkoutUrl: session.url },
      { headers: corsHeaders(origin) },
    );
  },
);
