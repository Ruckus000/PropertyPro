/**
 * POST /api/admin/demos/[slug]/convert
 *
 * Creates a Stripe checkout session for converting a demo community
 * into a paid subscription. The Stripe webhook handler (in the web app)
 * completes the conversion when checkout succeeds.
 *
 * Auth: platform admin session (requirePlatformAdmin).
 *
 * success_url and cancel_url target the web app origin because the
 * customer-facing checkout flow lives there. Checkout metadata shape
 * is identical to the self-service flow so the webhook handler needs
 * no changes.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { getStripeClient } from '@/lib/stripe';
import { createAdminClient } from '@propertypro/db/supabase/admin';

// ---------------------------------------------------------------------------
// Plan validation (inlined — admin app does not import web app modules)
// ---------------------------------------------------------------------------

const PLANS_BY_COMMUNITY_TYPE: Record<string, string[]> = {
  condo_718: ['essentials', 'professional'],
  hoa_720: ['essentials', 'professional'],
  apartment: ['operations_plus'],
};

function isPlanValidForCommunityType(communityType: string, planId: string): boolean {
  const plans = PLANS_BY_COMMUNITY_TYPE[communityType];
  return plans ? plans.includes(planId) : false;
}

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

const convertBodySchema = z.object({
  planId: z.string().min(1, 'Plan ID is required'),
  customerEmail: z.string().email('Valid email is required'),
  customerName: z.string().min(1, 'Customer name is required').max(200),
});

// ---------------------------------------------------------------------------
// Web app origin for success/cancel URLs
// ---------------------------------------------------------------------------

function getWebAppOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_WEB_APP_URL ??
    process.env.WEB_APP_BASE_URL ??
    'http://localhost:3000'
  );
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  // 0. Auth — requirePlatformAdmin throws Response(401/403) on failure
  let admin;
  try {
    admin = await requirePlatformAdmin();
  } catch (err) {
    if (err instanceof Response) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: err.statusText || 'Unauthorized' } },
        { status: err.status },
      );
    }
    throw err;
  }

  const { slug } = await context.params;

  // 1. Validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 400 },
    );
  }

  const parsed = convertBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parsed.error.issues,
        },
      },
      { status: 400 },
    );
  }

  const { planId, customerEmail, customerName } = parsed.data;

  // 2. Look up demo by slug (exclude soft-deleted)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data: demos, error: queryError } = await db
    .from('demo_instances')
    .select(`
      id,
      seeded_community_id,
      communities!demo_instances_seeded_community_id_fkey (
        id,
        name,
        community_type,
        is_demo,
        demo_expires_at,
        deleted_at
      )
    `)
    .eq('slug', slug)
    .is('deleted_at', null)
    .limit(1);

  if (queryError) {
    console.error('[convert/POST] Query error:', queryError.message);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to look up demo' } },
      { status: 500 },
    );
  }

  const demoRow = demos?.[0];
  const community = demoRow?.communities;

  if (!demoRow || !community || community.deleted_at) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Demo not found' } },
      { status: 404 },
    );
  }

  if (!community.is_demo) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'This demo has already been converted' } },
      { status: 400 },
    );
  }

  // Check expiry
  if (community.demo_expires_at && new Date(community.demo_expires_at) < new Date()) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'This demo has expired' } },
      { status: 400 },
    );
  }

  // 3. Validate plan for community type
  if (!isPlanValidForCommunityType(community.community_type, planId)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'This plan is not available for this community type' } },
      { status: 400 },
    );
  }

  // 4. Resolve Stripe price from stripe_prices table
  const { data: priceRow, error: priceError } = await db
    .from('stripe_prices')
    .select('stripe_price_id')
    .eq('plan_id', planId)
    .eq('community_type', community.community_type)
    .eq('billing_interval', 'month')
    .limit(1)
    .single();

  if (priceError || !priceRow) {
    console.error('[convert/POST] Price lookup error:', priceError?.message);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: `No Stripe price configured for plan=${planId}` } },
      { status: 500 },
    );
  }

  // 5. Create Stripe checkout session
  const stripe = getStripeClient();
  const webAppOrigin = getWebAppOrigin();

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceRow.stripe_price_id, quantity: 1 }],
      customer_email: customerEmail,
      success_url: `${webAppOrigin}/demo/${slug}/converted?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${webAppOrigin}/demo/${slug}`,
      metadata: {
        demoId: String(demoRow.id),
        communityId: String(demoRow.seeded_community_id),
        planId,
        slug,
        customerEmail,
        customerName,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe checkout creation failed';
    console.error('[convert/POST] Stripe error:', message);
    return NextResponse.json(
      { error: { code: 'STRIPE_ERROR', message } },
      { status: 500 },
    );
  }

  // 6. Emit conversion_initiated event (best-effort)
  try {
    await db.from('conversion_events').insert({
      demo_id: demoRow.id,
      community_id: demoRow.seeded_community_id,
      event_type: 'conversion_initiated',
      source: 'admin_app',
      dedupe_key: `demo:${demoRow.id}:conversion_initiated:${session.id}`,
      occurred_at: new Date().toISOString(),
      user_id: admin.id,
      metadata: {},
    });
  } catch (err) {
    console.warn('[convert/POST] Failed to emit conversion event:', err);
  }

  return NextResponse.json({ data: { checkoutUrl: session.url } });
}
