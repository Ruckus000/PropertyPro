import { pathToFileURL } from 'node:url';
import Stripe from 'stripe';
import {
  assessmentLineItems,
  assessments,
  billingGroups,
  communities,
  complianceChecklistItems,
  createAdminClient,
  documents,
  emergencyBroadcastRecipients,
  emergencyBroadcasts,
  esignSigners,
  esignSubmissions,
  esignTemplates,
  stripePrices,
  meetings,
  notificationPreferences,
  units,
  users,
  violations,
} from '@propertypro/db';
import { and, eq, inArray, isNull, sql } from '@propertypro/db/filters';
import {
  ensureSeededDocumentStorage,
  ensureNotificationPreference,
  seedCommunity,
  seedDocumentCategories,
  reconcilePublicUserIdWithAuthId,
  seedRoles,
  type SeededDocumentCategoryIds,
  type SeedCommunityConfig,
  type SeedCommunityResult,
  type SeedUserConfig,
} from '@propertypro/db/seed/seed-community';
import { closeUnscopedClient, createUnscopedClient } from '@propertypro/db/unsafe';
import { getComplianceTemplate, type CommunityType, type PlanId } from '@propertypro/shared';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { DEMO_COMMUNITIES, DEMO_USERS } from './config/demo-data';
import { runSeedSafetyChecks } from './lib/seed-safety';
import {
  getOrCreateBillingGroupForPm,
  recalculateVolumeTier,
} from '../apps/web/src/lib/billing/billing-group-service';
import { determineTier } from '../apps/web/src/lib/billing/tier-calculator';

const db = createUnscopedClient();

interface DemoSeedOptions {
  syncAuthUsers?: boolean;
}

type CanonicalRole = SeedUserConfig['role'];
type DemoCommunitySlug = (typeof DEMO_COMMUNITIES)[number]['slug'];

interface CommunityRoleAssignment {
  email: string;
  role: CanonicalRole;
}

const DEBUG_DEMO_SEED = process.env.DEBUG_DEMO_SEED === '1';

const PRIMARY_ASSIGNMENTS: Record<DemoCommunitySlug, CommunityRoleAssignment[]> = {
  'sunset-condos': [
    { email: 'board.president@sunset.local', role: 'board_president' },
    { email: 'board.member@sunset.local', role: 'board_member' },
    { email: 'owner.one@sunset.local', role: 'owner' },
    { email: 'tenant.one@sunset.local', role: 'tenant' },
    { email: 'cam.one@sunset.local', role: 'cam' },
    { email: 'pm.admin@sunset.local', role: 'property_manager_admin' },
  ],
  'palm-shores-hoa': [
    { email: 'board.president@sunset.local', role: 'board_president' },
  ],
  'sunset-ridge-apartments': [
    { email: 'site.manager@sunsetridge.local', role: 'site_manager' },
    { email: 'pm.admin@sunset.local', role: 'property_manager_admin' },
    { email: 'tenant.apt101@sunsetridge.local', role: 'tenant' },
    { email: 'tenant.apt102@sunsetridge.local', role: 'tenant' },
    { email: 'tenant.apt201@sunsetridge.local', role: 'tenant' },
    { email: 'tenant.apt202@sunsetridge.local', role: 'tenant' },
    { email: 'tenant.apt301@sunsetridge.local', role: 'tenant' },
    { email: 'tenant.apt302@sunsetridge.local', role: 'tenant' },
    { email: 'tenant.apt103@sunsetridge.local', role: 'tenant' },
    { email: 'tenant.apt104@sunsetridge.local', role: 'tenant' },
    { email: 'tenant.apt105@sunsetridge.local', role: 'tenant' },
    { email: 'tenant.apt106@sunsetridge.local', role: 'tenant' },
    { email: 'tenant.apt203@sunsetridge.local', role: 'tenant' },
    { email: 'tenant.apt204@sunsetridge.local', role: 'tenant' },
    { email: 'tenant.apt205@sunsetridge.local', role: 'tenant' },
    { email: 'tenant.apt206@sunsetridge.local', role: 'tenant' },
    { email: 'tenant.apt303@sunsetridge.local', role: 'tenant' },
  ],
};

const CROSS_COMMUNITY_ASSIGNMENTS: Array<{ slug: DemoCommunitySlug; email: string; role: CanonicalRole }> = [
  { slug: 'palm-shores-hoa', email: 'owner.one@sunset.local', role: 'owner' },
  // Tenants are excluded: a tenant belongs to exactly one community.
  { slug: 'palm-shores-hoa', email: 'cam.one@sunset.local', role: 'cam' },
  { slug: 'palm-shores-hoa', email: 'pm.admin@sunset.local', role: 'property_manager_admin' },
];

const GLOBAL_PREF_USER_EMAILS = [
  'board.president@sunset.local',
  'board.member@sunset.local',
  'owner.one@sunset.local',
  'tenant.one@sunset.local',
  'cam.one@sunset.local',
  'pm.admin@sunset.local',
  'site.manager@sunsetridge.local',
] as const;

const demoUsersByEmail = new Map<string, (typeof DEMO_USERS)[number]>(
  DEMO_USERS.map((user) => [user.email, user]),
);

const DEMO_PM_PORTFOLIO_EMAIL = 'pm.admin@sunset.local';
const DEMO_PM_PORTFOLIO_NAME = 'Pat PM Demo Portfolio';
const DEMO_PM_PORTFOLIO_KEY = 'demo_pm_portfolio';
const DEMO_PM_PORTFOLIO_ORIGIN = 'demo_seed_pm_portfolio';
const DEMO_PM_PORTFOLIO_CUSTOMER_METADATA = {
  origin: DEMO_PM_PORTFOLIO_ORIGIN,
  portfolioKey: DEMO_PM_PORTFOLIO_KEY,
};

// Demo plans: keep each demo on a plan that exercises its community type's
// feature surface so demos can showcase the full product. `professional`
// enables maintenance requests, work orders, and amenities for the condo/HOA
// demos — needed so the Operations hub renders on those communities after
// the Phase 1 plan-gating unification. `operations_plus` covers the
// apartment feature set.
const PM_PORTFOLIO_PLAN_BY_SLUG: Record<DemoCommunitySlug, PlanId> = {
  'sunset-condos': 'professional',
  'palm-shores-hoa': 'professional',
  'sunset-ridge-apartments': 'operations_plus',
};

const REUSABLE_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
  'active',
  'trialing',
  'past_due',
  'unpaid',
]);
const STORAGE_RETRY_DELAYS_MS = [400, 1000, 2000] as const;

interface DemoPortfolioCommunity {
  id: number;
  slug: DemoCommunitySlug;
  name: string;
  communityType: CommunityType;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  billingGroupId: number | null;
  subscriptionPlan: string | null;
  subscriptionStatus: string | null;
}

let stripeClient: Stripe | null = null;

function debugSeed(message: string): void {
  if (DEBUG_DEMO_SEED) {
    // eslint-disable-next-line no-console
    console.log(`[seed-demo] ${message}`);
  }
}

function isRetryableStorageSeedError(message: string): boolean {
  return /gateway timeout|timed out|timeout|503|504|not visible in storage listing|no data returned/i.test(
    message,
  );
}

async function retryStorageSeedOperation<T>(
  label: string,
  operation: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < STORAGE_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);

      if (!isRetryableStorageSeedError(message) || attempt === STORAGE_RETRY_DELAYS_MS.length - 1) {
        throw error;
      }

      debugSeed(
        `${label} retry ${attempt + 1}/${STORAGE_RETRY_DELAYS_MS.length - 1} after transient storage error: ${message}`,
      );
      await new Promise((resolve) => setTimeout(resolve, STORAGE_RETRY_DELAYS_MS[attempt]));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Storage seed operation failed: ${label}`);
}

function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return null;
  }

  if (!stripeClient) {
    stripeClient = new Stripe(key, { apiVersion: '2026-01-28.clover' });
  }

  return stripeClient;
}

function buildSeedUsers(assignments: CommunityRoleAssignment[]): SeedUserConfig[] {
  return assignments.map((assignment) => {
    const demoUser = demoUsersByEmail.get(assignment.email);
    if (!demoUser) {
      throw new Error(`Missing demo user for assignment email ${assignment.email}`);
    }

    return {
      email: demoUser.email,
      fullName: demoUser.fullName,
      phone: demoUser.phone,
      role: assignment.role,
    };
  });
}

function collectUserIds(results: SeedCommunityResult[]): Record<string, string> {
  const userIdsByEmail: Record<string, string> = {};

  for (const result of results) {
    for (const seededUser of result.users) {
      userIdsByEmail[seededUser.email] = seededUser.userId;
    }
  }

  return userIdsByEmail;
}

function resolveUserId(userIdsByEmail: Record<string, string>, email: string): string {
  const userId = userIdsByEmail[email];
  if (!userId) {
    throw new Error(`Missing seeded user ID for ${email}`);
  }
  return userId;
}

async function ensureDemoUserRecord(email: string, preferredId?: string): Promise<string> {
  const normalizedEmail = email.toLowerCase();
  const demoUser = demoUsersByEmail.get(email) ?? demoUsersByEmail.get(normalizedEmail);
  if (!demoUser) {
    throw new Error(`Missing demo user config for ${email}`);
  }

  if (preferredId) {
    const existingById = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, preferredId))
      .limit(1);

    if (existingById[0]) {
      return existingById[0].id;
    }
  }

  const existingByEmail = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existingByEmail[0]) {
    let effectiveId = existingByEmail[0].id;
    const authUser = await findAuthUserByEmail(normalizedEmail);
    if (authUser && existingByEmail[0].id !== authUser.id) {
      await reconcilePublicUserIdWithAuthId(existingByEmail[0].id, authUser.id, {
        email: normalizedEmail,
        fullName: demoUser.fullName,
        phone: demoUser.phone,
      });
      effectiveId = authUser.id;
    }

    await db
      .update(users)
      .set({
        fullName: demoUser.fullName,
        phone: demoUser.phone,
        updatedAt: new Date(),
      })
      .where(eq(users.id, effectiveId));
    return effectiveId;
  }

  const userId = preferredId ?? crypto.randomUUID();
  await db.insert(users).values({
    id: userId,
    email: normalizedEmail,
    fullName: demoUser.fullName,
    phone: demoUser.phone,
  });
  return userId;
}

interface MatchedAuthUser {
  id: string;
  userMetadata: Record<string, unknown>;
}

async function findAuthUserByEmail(email: string): Promise<MatchedAuthUser | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return null;
  }

  const admin = createAdminClient();
  let page = 1;
  const perPage = 200;

  while (page <= 20) {
    const listed = await admin.auth.admin.listUsers({ page, perPage });
    if (listed.error) {
      throw listed.error;
    }

    const matched = listed.data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (matched) {
      return {
        id: matched.id,
        userMetadata: (matched.user_metadata ?? {}) as Record<string, unknown>,
      };
    }

    if (listed.data.users.length < perPage) {
      break;
    }

    page += 1;
  }

  return null;
}

function shouldSyncDemoAuthUsers(): boolean {
  const raw = process.env.DEMO_SEED_SYNC_AUTH_USERS?.trim().toLowerCase();
  return raw == null || raw === '' || (raw !== '0' && raw !== 'false' && raw !== 'no');
}

function isStripeCustomer(
  customer: Stripe.Customer | Stripe.DeletedCustomer,
): customer is Stripe.Customer {
  return !('deleted' in customer && customer.deleted);
}

async function resolveSeedStripePriceId(
  planId: PlanId,
  communityType: CommunityType,
): Promise<string> {
  const [row] = await db
    .select({ stripePriceId: stripePrices.stripePriceId })
    .from(stripePrices)
    .where(
      and(
        eq(stripePrices.planId, planId),
        eq(stripePrices.communityType, communityType),
        eq(stripePrices.billingInterval, 'month'),
      ),
    )
    .limit(1);

  if (!row) {
    throw new Error(
      `Missing stripe_prices row for seeded demo billing (${planId}/${communityType}/month)`,
    );
  }

  return row.stripePriceId;
}

function isPlaceholderStripePriceId(priceId: string): boolean {
  return priceId.startsWith('price_placeholder_');
}

function isRecoverableDemoBillingStripeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';
  const type =
    typeof error === 'object' && error && 'type' in error
      ? String((error as { type?: unknown }).type ?? '')
      : '';
  const rawType =
    typeof error === 'object' && error && 'rawType' in error
      ? String((error as { rawType?: unknown }).rawType ?? '')
      : '';

  return (
    /no such price:/i.test(message) ||
    ((code === 'resource_missing' || rawType === 'invalid_request_error' || type === 'StripeInvalidRequestError') &&
      /price/i.test(message))
  );
}

function resolveExistingDemoStripeCustomerId(
  seededCommunities: DemoPortfolioCommunity[],
): string | null {
  const distinctCustomerIds = [...new Set(
    seededCommunities
      .map((community) => community.stripeCustomerId)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  )];

  if (distinctCustomerIds.length === 1) {
    return distinctCustomerIds[0]!;
  }

  return null;
}

function buildLocalDemoStripeCustomerId(): string {
  return `demo_local_customer_${DEMO_PM_PORTFOLIO_KEY}`;
}

function buildLocalDemoStripeSubscriptionId(slug: DemoCommunitySlug): string {
  return `demo_local_sub_${slug.replaceAll('-', '_')}`;
}

async function ensureLocalDemoBillingGroup(input: {
  pmUserId: string;
  customerId: string;
  communityIds: number[];
}): Promise<{ billingGroupId: number; activeCount: number; volumeTier: ReturnType<typeof determineTier> }> {
  const [existingGroup] = await db
    .select({
      id: billingGroups.id,
      stripeCustomerId: billingGroups.stripeCustomerId,
    })
    .from(billingGroups)
    .where(and(eq(billingGroups.ownerUserId, input.pmUserId), isNull(billingGroups.deletedAt)))
    .limit(1);

  let billingGroupId = existingGroup?.id ?? null;
  if (billingGroupId == null) {
    const [created] = await db
      .insert(billingGroups)
      .values({
        name: DEMO_PM_PORTFOLIO_NAME,
        stripeCustomerId: input.customerId,
        ownerUserId: input.pmUserId,
      })
      .returning({ id: billingGroups.id });

    if (!created) {
      throw new Error('Failed to create local demo billing group');
    }

    billingGroupId = created.id;
  } else {
    await db
      .update(billingGroups)
      .set({
        name: DEMO_PM_PORTFOLIO_NAME,
        stripeCustomerId: input.customerId,
        updatedAt: new Date(),
      })
      .where(eq(billingGroups.id, billingGroupId));
  }

  await db
    .update(communities)
    .set({
      billingGroupId,
      updatedAt: new Date(),
    })
    .where(inArray(communities.id, input.communityIds));

  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(communities)
    .where(and(eq(communities.billingGroupId, billingGroupId), isNull(communities.deletedAt)));
  const activeCount = countRows[0]?.count ?? 0;
  const volumeTier = determineTier(activeCount);

  await db
    .update(billingGroups)
    .set({
      activeCommunityCount: activeCount,
      volumeTier,
      couponSyncStatus: 'synced',
      updatedAt: new Date(),
    })
    .where(eq(billingGroups.id, billingGroupId));

  return { billingGroupId, activeCount, volumeTier };
}

async function seedLocalPmPortfolioBilling(input: {
  userIdsByEmail: Record<string, string>;
  seededCommunities: DemoPortfolioCommunity[];
  reason: string;
  preferredCustomerId?: string | null;
}): Promise<void> {
  const pmUserId = resolveUserId(input.userIdsByEmail, DEMO_PM_PORTFOLIO_EMAIL);
  const customerId =
    input.preferredCustomerId ??
    resolveExistingDemoStripeCustomerId(input.seededCommunities) ??
    buildLocalDemoStripeCustomerId();

  for (const community of input.seededCommunities) {
    const planId = PM_PORTFOLIO_PLAN_BY_SLUG[community.slug];

    await db
      .update(communities)
      .set({
        stripeCustomerId: customerId,
        stripeSubscriptionId: community.stripeSubscriptionId ?? buildLocalDemoStripeSubscriptionId(community.slug),
        subscriptionPlan: planId,
        subscriptionStatus: 'active',
        updatedAt: new Date(),
      })
      .where(eq(communities.id, community.id));
  }

  const result = await ensureLocalDemoBillingGroup({
    pmUserId,
    customerId,
    communityIds: input.seededCommunities.map((community) => community.id),
  });

  debugSeed(
    `pm portfolio billing seeded with local fallback (${input.reason}): group=${result.billingGroupId}, customer=${customerId}, count=${result.activeCount}, tier=${result.volumeTier}`,
  );
}

async function ensureDemoPortfolioCustomer(
  stripe: Stripe,
  seededCommunities: DemoPortfolioCommunity[],
): Promise<string> {
  const existingCustomerIds = [...new Set(
    seededCommunities
      .map((community) => community.stripeCustomerId)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  )];

  if (existingCustomerIds.length > 1) {
    throw new Error(
      `Demo PM communities already reference multiple Stripe customers: ${existingCustomerIds.join(', ')}`,
    );
  }

  const customerFromDb = existingCustomerIds[0];
  if (customerFromDb) {
    // In dev envs the Stripe customer may have been deleted out from under us;
    // fall through to list/create a fresh one instead of crashing the seed.
    const customer = await stripe.customers
      .retrieve(customerFromDb)
      .catch(() => null);
    if (customer && isStripeCustomer(customer)) {
      await stripe.customers.update(customer.id, {
        email: DEMO_PM_PORTFOLIO_EMAIL,
        name: DEMO_PM_PORTFOLIO_NAME,
        metadata: {
          ...customer.metadata,
          ...DEMO_PM_PORTFOLIO_CUSTOMER_METADATA,
        },
      });
      return customer.id;
    }
  }

  const listedCustomers = await stripe.customers.list({
    email: DEMO_PM_PORTFOLIO_EMAIL,
    limit: 100,
  });
  const seededCustomer = listedCustomers.data.find(
    (customer) =>
      customer.metadata.origin === DEMO_PM_PORTFOLIO_ORIGIN &&
      customer.metadata.portfolioKey === DEMO_PM_PORTFOLIO_KEY,
  );

  if (seededCustomer) {
    await stripe.customers.update(seededCustomer.id, {
      email: DEMO_PM_PORTFOLIO_EMAIL,
      name: DEMO_PM_PORTFOLIO_NAME,
      metadata: {
        ...seededCustomer.metadata,
        ...DEMO_PM_PORTFOLIO_CUSTOMER_METADATA,
      },
    });
    return seededCustomer.id;
  }

  const createdCustomer = await stripe.customers.create({
    email: DEMO_PM_PORTFOLIO_EMAIL,
    name: DEMO_PM_PORTFOLIO_NAME,
    metadata: DEMO_PM_PORTFOLIO_CUSTOMER_METADATA,
  });

  return createdCustomer.id;
}

async function ensureDemoPortfolioPaymentMethod(
  stripe: Stripe,
  customerId: string,
): Promise<string> {
  const paymentMethods = await stripe.paymentMethods.list({
    customer: customerId,
    type: 'card',
  });

  let paymentMethodId = paymentMethods.data[0]?.id;
  if (!paymentMethodId) {
    const paymentMethod = await stripe.paymentMethods.create({
      type: 'card',
      card: { token: 'tok_visa' },
    });
    await stripe.paymentMethods.attach(paymentMethod.id, { customer: customerId });
    paymentMethodId = paymentMethod.id;
  }

  await stripe.customers.update(customerId, {
    invoice_settings: {
      default_payment_method: paymentMethodId,
    },
  });

  return paymentMethodId;
}

function buildSeededSubscriptionMetadata(
  community: DemoPortfolioCommunity,
  planId: PlanId,
): Record<string, string> {
  return {
    origin: DEMO_PM_PORTFOLIO_ORIGIN,
    portfolioKey: DEMO_PM_PORTFOLIO_KEY,
    communitySlug: community.slug,
    communityId: String(community.id),
    planId,
  };
}

function matchesSeededSubscription(
  subscription: Stripe.Subscription,
  community: DemoPortfolioCommunity,
): boolean {
  return (
    subscription.metadata.origin === DEMO_PM_PORTFOLIO_ORIGIN &&
    subscription.metadata.portfolioKey === DEMO_PM_PORTFOLIO_KEY &&
    subscription.metadata.communitySlug === community.slug
  );
}

async function ensureDemoPortfolioSubscription(input: {
  stripe: Stripe;
  community: DemoPortfolioCommunity;
  customerId: string;
  defaultPaymentMethodId: string;
  planId: PlanId;
}): Promise<Stripe.Subscription> {
  const { stripe, community, customerId, defaultPaymentMethodId, planId } = input;
  const priceId = await resolveSeedStripePriceId(planId, community.communityType);
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 100,
    expand: ['data.items.data.price'],
  });

  const candidates = subscriptions.data.filter(
    (subscription) =>
      subscription.id === community.stripeSubscriptionId ||
      matchesSeededSubscription(subscription, community),
  );
  const reusable = candidates.find((subscription) =>
    REUSABLE_SUBSCRIPTION_STATUSES.has(subscription.status),
  );

  if (reusable) {
    const primaryItem = reusable.items.data[0];
    if (!primaryItem) {
      throw new Error(`Subscription ${reusable.id} has no items for seeded community ${community.slug}`);
    }

    const nextMetadata = {
      ...reusable.metadata,
      ...buildSeededSubscriptionMetadata(community, planId),
    };

    if (primaryItem.price.id !== priceId) {
      return stripe.subscriptions.update(reusable.id, {
        default_payment_method: defaultPaymentMethodId,
        items: [{ id: primaryItem.id, price: priceId }],
        metadata: nextMetadata,
        proration_behavior: 'none',
        expand: ['items.data.price'],
      });
    }

    await stripe.subscriptions.update(reusable.id, {
      default_payment_method: defaultPaymentMethodId,
      metadata: nextMetadata,
    });

    return reusable;
  }

  const created = await stripe.subscriptions.create({
    customer: customerId,
    collection_method: 'charge_automatically',
    default_payment_method: defaultPaymentMethodId,
    items: [{ price: priceId }],
    metadata: buildSeededSubscriptionMetadata(community, planId),
    payment_settings: {
      save_default_payment_method: 'on_subscription',
    },
    expand: ['items.data.price'],
  });

  if (!REUSABLE_SUBSCRIPTION_STATUSES.has(created.status)) {
    throw new Error(
      `Seeded subscription ${created.id} for ${community.slug} was created with unexpected status ${created.status}`,
    );
  }

  return created;
}

async function seedPmPortfolioBilling(
  userIdsByEmail: Record<string, string>,
): Promise<void> {
  const stripe = getStripeClient();
  const seededCommunities = await db
    .select({
      id: communities.id,
      slug: communities.slug,
      name: communities.name,
      communityType: communities.communityType,
      stripeCustomerId: communities.stripeCustomerId,
      stripeSubscriptionId: communities.stripeSubscriptionId,
      billingGroupId: communities.billingGroupId,
      subscriptionPlan: communities.subscriptionPlan,
      subscriptionStatus: communities.subscriptionStatus,
    })
    .from(communities)
    .where(
      and(
        inArray(communities.slug, [...DEMO_COMMUNITIES.map((community) => community.slug)]),
        isNull(communities.deletedAt),
      ),
    );

  const typedSeededCommunities = seededCommunities as DemoPortfolioCommunity[];
  if (typedSeededCommunities.length !== DEMO_COMMUNITIES.length) {
    throw new Error('Missing one or more seeded demo communities for PM portfolio billing setup');
  }

  if (!stripe) {
    await seedLocalPmPortfolioBilling({
      userIdsByEmail,
      seededCommunities: typedSeededCommunities,
      reason: 'STRIPE_SECRET_KEY is not set',
    });
    return;
  }

  const seededPriceIds = await Promise.all(
    typedSeededCommunities.map(async (community) => ({
      slug: community.slug,
      priceId: await resolveSeedStripePriceId(
        PM_PORTFOLIO_PLAN_BY_SLUG[community.slug],
        community.communityType,
      ),
    })),
  );
  const placeholderPrices = seededPriceIds.filter(({ priceId }) => isPlaceholderStripePriceId(priceId));
  if (placeholderPrices.length > 0) {
    await seedLocalPmPortfolioBilling({
      userIdsByEmail,
      seededCommunities: typedSeededCommunities,
      reason: `placeholder Stripe prices configured (${placeholderPrices.map(({ slug, priceId }) => `${slug}:${priceId}`).join(', ')})`,
    });
    return;
  }

  let customerId: string | null = null;

  try {
    customerId = await ensureDemoPortfolioCustomer(stripe, typedSeededCommunities);
    const defaultPaymentMethodId = await ensureDemoPortfolioPaymentMethod(stripe, customerId);

    for (const community of typedSeededCommunities) {
      const planId = PM_PORTFOLIO_PLAN_BY_SLUG[community.slug];
      const subscription = await ensureDemoPortfolioSubscription({
        stripe,
        community,
        customerId,
        defaultPaymentMethodId,
        planId,
      });

      await db
        .update(communities)
        .set({
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscription.id,
          subscriptionPlan: planId,
          subscriptionStatus: subscription.status,
          updatedAt: new Date(),
        })
        .where(eq(communities.id, community.id));
    }

    const pmUserId = resolveUserId(userIdsByEmail, DEMO_PM_PORTFOLIO_EMAIL);
    const { billingGroupId, stripeCustomerId } = await getOrCreateBillingGroupForPm(pmUserId);
    if (stripeCustomerId !== customerId) {
      throw new Error(
        `PM billing group customer mismatch: expected ${customerId}, got ${stripeCustomerId}`,
      );
    }

    await db
      .update(communities)
      .set({
        billingGroupId,
        updatedAt: new Date(),
      })
      .where(inArray(communities.id, typedSeededCommunities.map((community) => community.id)));

    const result = await recalculateVolumeTier(billingGroupId);
    debugSeed(
      `pm portfolio billing seeded: group=${billingGroupId}, customer=${customerId}, count=${result.activeCount}, tier=${result.newTier}`,
    );
  } catch (error) {
    if (!isRecoverableDemoBillingStripeError(error)) {
      throw error;
    }

    await seedLocalPmPortfolioBilling({
      userIdsByEmail,
      seededCommunities: typedSeededCommunities,
      reason: error instanceof Error ? error.message : 'recoverable Stripe billing seed error',
      preferredCustomerId: customerId,
    });
  }
}

function addDays(source: Date, days: number): Date {
  const value = new Date(source);
  value.setUTCDate(value.getUTCDate() + days);
  return value;
}

function subDays(source: Date, days: number): Date {
  const value = new Date(source);
  value.setUTCDate(value.getUTCDate() - days);
  return value;
}

function addHours(source: Date, hours: number): Date {
  const value = new Date(source);
  value.setUTCHours(value.getUTCHours() + hours);
  return value;
}

function monthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  return `${year}-${month}`;
}

async function upsertDocument(
  communityId: number,
  filePath: string,
  title: string,
  uploadedBy: string,
  postedAt: Date,
  categoryId: number | null,
): Promise<number> {
  const fileSize = await ensureSeededDocumentStorage(
    filePath,
    title,
    `${title} (demo transparency seed)`,
  );

  const existing = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.communityId, communityId),
        eq(documents.filePath, filePath),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(documents)
      .set({
        title,
        description: `${title} (demo transparency seed)`,
        fileName: filePath.split('/').at(-1) ?? `${title}.pdf`,
        fileSize,
        mimeType: 'application/pdf',
        uploadedBy,
        categoryId,
        deletedAt: null,
        createdAt: postedAt,
        updatedAt: postedAt,
      })
      .where(eq(documents.id, existing[0].id));
    return existing[0].id;
  }

  const [created] = await db
    .insert(documents)
    .values({
      communityId,
      title,
      description: `${title} (demo transparency seed)`,
      filePath,
      fileName: filePath.split('/').at(-1) ?? `${title}.pdf`,
      fileSize,
      mimeType: 'application/pdf',
      uploadedBy,
      categoryId,
      createdAt: postedAt,
      updatedAt: postedAt,
    })
    .returning({ id: documents.id });

  if (!created) {
    throw new Error(`Failed to create document for ${filePath}`);
  }

  return created.id;
}

function getTransparencyCategoryId(
  templateKey: string,
  categoryIds: SeededDocumentCategoryIds,
): number | null {
  switch (templateKey) {
    case '718_declaration':
    case '718_bylaws':
    case '718_articles':
    case '720_governing_docs':
    case '720_articles':
      return categoryIds.declaration ?? categoryIds.rules ?? null;
    case '718_minutes_rolling_12m':
    case '720_minutes_rolling_12m':
      return categoryIds.meeting_minutes ?? categoryIds.announcements ?? null;
    case '720_meeting_notices':
      return categoryIds.announcements ?? categoryIds.meeting_minutes ?? null;
    case '718_insurance':
    case '718_inspection_reports':
    case '718_sirs':
    case '720_insurance':
      return categoryIds.inspection_reports ?? categoryIds.rules ?? null;
    default:
      return categoryIds.rules ?? categoryIds.declaration ?? null;
  }
}

async function setChecklistDocument(
  communityId: number,
  templateKey: string,
  documentId: number | null,
  postedAt: Date | null,
): Promise<void> {
  await db
    .update(complianceChecklistItems)
    .set({
      documentId,
      documentPostedAt: postedAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(complianceChecklistItems.communityId, communityId),
        eq(complianceChecklistItems.templateKey, templateKey),
        isNull(complianceChecklistItems.deletedAt),
      ),
    );
}

async function upsertMeeting(
  communityId: number,
  title: string,
  meetingType: 'board' | 'annual' | 'special' | 'budget' | 'committee',
  startsAt: Date,
  noticePostedAt: Date | null,
): Promise<void> {
  const existing = await db
    .select({ id: meetings.id })
    .from(meetings)
    .where(
      and(
        eq(meetings.communityId, communityId),
        eq(meetings.title, title),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(meetings)
      .set({
        meetingType,
        startsAt,
        noticePostedAt,
        location: 'Community Clubhouse',
        deletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(meetings.id, existing[0].id));
    return;
  }

  await db.insert(meetings).values({
    communityId,
    title,
    meetingType,
    startsAt,
    noticePostedAt,
    location: 'Community Clubhouse',
  });
}

async function seedTransparencyDemoData(
  communityId: number,
  communityType: CommunityType,
  slug: DemoCommunitySlug,
  uploadedBy: string,
): Promise<void> {
  const categoryIds = await seedDocumentCategories(communityId, communityType);
  const template = getComplianceTemplate(communityType);
  if (template.length === 0) {
    return;
  }

  const conditionalNotRequired = slug === 'sunset-condos'
    ? new Set(['718_conflict_contracts', '718_sirs'])
    : slug === 'palm-shores-hoa'
      ? new Set(['720_bids'])
      : new Set<string>();

  const intentionallyNotPosted = slug === 'sunset-condos'
    ? new Set(['718_insurance'])
    : slug === 'palm-shores-hoa'
      ? new Set(['720_contracts'])
      : new Set<string>();

  const now = new Date();
  for (const item of template) {
    if (conditionalNotRequired.has(item.templateKey) || intentionallyNotPosted.has(item.templateKey)) {
      await setChecklistDocument(communityId, item.templateKey, null, null);
      continue;
    }

    const postedAt = subDays(now, Math.floor(Math.random() * 40) + 2);
    const documentId = await upsertDocument(
      communityId,
      `transparency/${slug}/${item.templateKey}.pdf`,
      `${item.title} (${slug})`,
      uploadedBy,
      postedAt,
      getTransparencyCategoryId(item.templateKey, categoryIds),
    );

    await setChecklistDocument(communityId, item.templateKey, documentId, postedAt);
  }

  // Seed 10/12 months of minutes documents for condo demo community.
  if (slug === 'sunset-condos') {
    for (let offset = 11; offset >= 2; offset -= 1) {
      const monthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 15, 14, 0, 0));
      await upsertDocument(
        communityId,
        `transparency/${slug}/minutes/${monthKey(monthDate)}.pdf`,
        `Board Minutes ${monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`,
        uploadedBy,
        monthDate,
        categoryIds.meeting_minutes ?? categoryIds.announcements ?? null,
      );
    }
  }

  // Seed meeting notice timing examples.
  const annualMeetingStart = addDays(now, 30);
  await upsertMeeting(
    communityId,
    `${slug} Owner Meeting (21-day notice)`,
    'annual',
    annualMeetingStart,
    subDays(annualMeetingStart, 21),
  );

  const missedAnnualStart = addDays(now, 45);
  await upsertMeeting(
    communityId,
    `${slug} Owner Meeting (10-day notice)`,
    'annual',
    missedAnnualStart,
    subDays(missedAnnualStart, 10),
  );

  const boardMeetingStart = addDays(now, 12);
  await upsertMeeting(
    communityId,
    `${slug} Board Meeting (52-hour notice)`,
    'board',
    boardMeetingStart,
    addHours(boardMeetingStart, -52),
  );

  const missedBoardStart = addDays(now, 18);
  await upsertMeeting(
    communityId,
    `${slug} Board Meeting (36-hour notice)`,
    'board',
    missedBoardStart,
    addHours(missedBoardStart, -36),
  );
}

async function seedViolationsData(
  communityId: number,
  reportedByUserId: string,
): Promise<void> {
  // Look up existing units for this community
  const communityUnits = await db
    .select({ id: units.id, unitNumber: units.unitNumber })
    .from(units)
    .where(
      and(
        eq(units.communityId, communityId),
        isNull(units.deletedAt),
      ),
    )
    .limit(4);

  if (communityUnits.length === 0) {
    debugSeed(`no units found for community ${communityId}, skipping violations seed`);
    return;
  }

  const now = new Date();
  const violationData = [
    {
      communityId,
      unitId: communityUnits[0]!.id,
      reportedByUserId,
      category: 'noise',
      description: 'Loud music playing after 10 PM on multiple occasions. Neighbors on the floor above and adjacent units have reported repeated disturbances.',
      status: 'reported' as const,
      severity: 'moderate' as const,
      evidenceDocumentIds: [],
      createdAt: subDays(now, 3),
      updatedAt: subDays(now, 3),
    },
    {
      communityId,
      unitId: communityUnits[Math.min(1, communityUnits.length - 1)]!.id,
      reportedByUserId,
      category: 'unauthorized_modification',
      description: 'Installed a satellite dish on the balcony without prior ARC approval. The dish is visible from the common area and does not comply with association guidelines.',
      status: 'noticed' as const,
      severity: 'major' as const,
      evidenceDocumentIds: [],
      noticeDate: subDays(now, 5).toISOString().slice(0, 10),
      createdAt: subDays(now, 10),
      updatedAt: subDays(now, 5),
    },
    {
      communityId,
      unitId: communityUnits[Math.min(2, communityUnits.length - 1)]!.id,
      reportedByUserId,
      category: 'parking',
      description: 'Vehicle consistently parked in the fire lane near Building C entrance. License plate observed multiple times over the past week.',
      status: 'hearing_scheduled' as const,
      severity: 'major' as const,
      evidenceDocumentIds: [],
      noticeDate: subDays(now, 14).toISOString().slice(0, 10),
      hearingDate: addDays(now, 7),
      createdAt: subDays(now, 18),
      updatedAt: subDays(now, 7),
    },
    {
      communityId,
      unitId: communityUnits[Math.min(3, communityUnits.length - 1)]!.id,
      reportedByUserId,
      category: 'pet',
      description: 'Unleashed dog observed in the pool area on three separate occasions. Community rules require all pets to be leashed in common areas.',
      status: 'fined' as const,
      severity: 'moderate' as const,
      evidenceDocumentIds: [],
      noticeDate: subDays(now, 25).toISOString().slice(0, 10),
      hearingDate: subDays(now, 10),
      createdAt: subDays(now, 30),
      updatedAt: subDays(now, 8),
    },
  ];

  // Delete existing violations for this community to avoid duplicates on re-seed
  await db.delete(violations).where(eq(violations.communityId, communityId));

  for (const data of violationData) {
    await db.insert(violations).values(data);
  }

  debugSeed(`seeded ${violationData.length} violations for community ${communityId}`);
}

/**
 * Seed emergency broadcast data for a community.
 * Adds phone verification + SMS consent for select users, plus a past broadcast.
 */
async function seedEmergencyBroadcastData(
  communityId: number,
  initiatedByUserId: string,
  recipientUserIds: string[],
): Promise<void> {
  const now = new Date();
  const consentDate = subDays(now, 30);

  // 1. Set phone_verified_at for initiator + recipients (simulate verified phones)
  const allUserIds = [initiatedByUserId, ...recipientUserIds];
  for (const userId of allUserIds) {
    await db
      .update(users)
      .set({ phoneVerifiedAt: consentDate, updatedAt: now })
      .where(eq(users.id, userId));
  }

  // 2. Enable SMS consent on notification_preferences for these users
  for (const userId of allUserIds) {
    await db
      .update(notificationPreferences)
      .set({
        smsEnabled: true,
        smsEmergencyOnly: true,
        smsConsentGivenAt: consentDate,
        smsConsentMethod: 'web_form',
        updatedAt: now,
      })
      .where(
        and(
          eq(notificationPreferences.userId, userId),
          eq(notificationPreferences.communityId, communityId),
        ),
      );
  }

  // 3. Delete any existing emergency broadcasts for this community (re-seed safe)
  await db.delete(emergencyBroadcasts).where(eq(emergencyBroadcasts.communityId, communityId));

  // 4. Insert a past completed broadcast (hurricane prep alert from 5 days ago)
  const broadcastDate = subDays(now, 5);
  const [broadcast] = await db
    .insert(emergencyBroadcasts)
    .values({
      communityId,
      title: 'Hurricane Preparation Advisory',
      body: 'A tropical storm is approaching our area and may strengthen into a hurricane. Please take the following precautions: secure loose items on balconies, stock water and non-perishable food, charge devices, and review the community evacuation plan posted in the lobby.',
      smsBody: 'EMERGENCY: Hurricane warning for Sunset Condos. Secure items, stock supplies, follow evacuation orders. Details via email.',
      severity: 'emergency',
      templateKey: 'hurricane_prep',
      targetAudience: 'all',
      channels: 'sms,email',
      recipientCount: recipientUserIds.length,
      sentCount: recipientUserIds.length,
      deliveredCount: recipientUserIds.length,
      failedCount: 0,
      initiatedBy: initiatedByUserId,
      initiatedAt: broadcastDate,
      completedAt: addDays(broadcastDate, 0), // completed same day
      createdAt: broadcastDate,
      updatedAt: broadcastDate,
    })
    .returning({ id: emergencyBroadcasts.id });

  if (!broadcast) {
    debugSeed(`failed to insert emergency broadcast for community ${communityId}`);
    return;
  }

  // 5. Insert recipient delivery records (all delivered successfully)
  for (const userId of recipientUserIds) {
    await db.insert(emergencyBroadcastRecipients).values({
      communityId,
      broadcastId: broadcast.id,
      userId,
      email: `demo-${userId.slice(0, 8)}@example.com`,
      phone: '+13055551234',
      smsStatus: 'delivered',
      smsProviderSid: `SM${userId.slice(0, 32)}`,
      smsSentAt: broadcastDate,
      smsDeliveredAt: addDays(broadcastDate, 0),
      emailStatus: 'sent',
      emailProviderId: `resend-${userId.slice(0, 16)}`,
      emailSentAt: broadcastDate,
      createdAt: broadcastDate,
      updatedAt: broadcastDate,
    });
  }

  debugSeed(`seeded emergency broadcast with ${recipientUserIds.length} recipients for community ${communityId}`);
}

// ---------------------------------------------------------------------------
// E-Sign seed data
// ---------------------------------------------------------------------------

function sanitizeStorageSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function uploadSeedEsignSourceDocument(
  communityId: number,
  templateName: string,
  description: string,
  fieldsSchema: {
    signerRoles: readonly string[];
    fields: ReadonlyArray<{ label?: string; type: string; signerRole: string }>;
  },
): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const headingFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  page.drawText(templateName, {
    x: 48,
    y: 736,
    size: 20,
    font: headingFont,
    color: rgb(0.1, 0.15, 0.21),
  });

  page.drawText(description, {
    x: 48,
    y: 706,
    size: 11,
    font: bodyFont,
    color: rgb(0.24, 0.28, 0.33),
    maxWidth: 516,
    lineHeight: 15,
  });

  page.drawText(`Signer roles: ${fieldsSchema.signerRoles.join(', ')}`, {
    x: 48,
    y: 664,
    size: 11,
    font: bodyFont,
    color: rgb(0.24, 0.28, 0.33),
  });

  page.drawText('Seeded field guide', {
    x: 48,
    y: 628,
    size: 13,
    font: headingFont,
    color: rgb(0.1, 0.15, 0.21),
  });

  let cursorY = 606;
  for (const field of fieldsSchema.fields.slice(0, 12)) {
    page.drawText(
      `- ${field.label ?? field.type} (${field.signerRole}, ${field.type})`,
      {
        x: 60,
        y: cursorY,
        size: 10,
        font: bodyFont,
        color: rgb(0.24, 0.28, 0.33),
      },
    );
    cursorY -= 18;
  }

  const pdfBytes = await pdfDoc.save();
  const storagePath = `communities/${communityId}/esign-templates/${sanitizeStorageSegment(templateName)}.pdf`;
  const admin = createAdminClient();
  const { error } = await retryStorageSeedOperation(
    `upload ${storagePath}`,
    () =>
      admin.storage.from('documents').upload(storagePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      }),
  );

  if (error) {
    throw new Error(`Failed to upload seeded e-sign source PDF: ${error.message}`);
  }

  const storageFolder = storagePath.slice(0, Math.max(storagePath.lastIndexOf('/'), 0));
  const storageFileName = storagePath.slice(storagePath.lastIndexOf('/') + 1);
  const { error: listError } = await retryStorageSeedOperation(
    `list ${storagePath}`,
    async () => {
      const result = await admin.storage
        .from('documents')
        .list(storageFolder, { limit: 100, search: storageFileName });

      const listed = (result.data ?? []).some((file) => file.name === storageFileName);
      if (!result.error && !listed) {
        throw new Error(`Seeded e-sign source PDF upload was not visible in storage listing for ${storagePath}`);
      }

      return result;
    },
  );

  if (listError) {
    throw new Error(
      `Failed to verify seeded e-sign source PDF listing: ${listError.message}`,
    );
  }

  const { data: downloadedFile, error: downloadError } = await retryStorageSeedOperation(
    `download ${storagePath}`,
    () => admin.storage.from('documents').download(storagePath),
  );

  if (downloadError || !downloadedFile) {
    throw new Error(
      `Failed to verify seeded e-sign source PDF download: ${downloadError?.message ?? 'No data returned'}`,
    );
  }

  return storagePath;
}

/**
 * Prebuilt e-sign template definitions for seeding.
 * Inlined here to avoid importing from apps/web/src (no path alias from scripts/).
 * Source of truth: apps/web/src/lib/esign/prebuilt-templates.ts
 */
const ESIGN_SEED_TEMPLATES = [
  {
    name: 'Proxy Designation Form',
    templateType: 'proxy',
    description:
      'Standard proxy form allowing unit owners to designate a voting representative for association meetings.',
    fieldsSchema: {
      version: 1,
      signerRoles: ['owner', 'proxy_holder'],
      fields: [
        { id: 'owner_name', type: 'text', signerRole: 'owner', page: 0, x: 10, y: 25, width: 35, height: 4, required: true, label: 'Owner Name' },
        { id: 'owner_unit', type: 'text', signerRole: 'owner', page: 0, x: 55, y: 25, width: 20, height: 4, required: true, label: 'Unit Number' },
        { id: 'proxy_holder_name', type: 'text', signerRole: 'owner', page: 0, x: 10, y: 35, width: 35, height: 4, required: true, label: 'Proxy Holder Name' },
        { id: 'meeting_date', type: 'date', signerRole: 'owner', page: 0, x: 55, y: 35, width: 20, height: 4, required: true, label: 'Meeting Date' },
        { id: 'owner_signature', type: 'signature', signerRole: 'owner', page: 0, x: 10, y: 70, width: 35, height: 8, required: true, label: 'Owner Signature' },
        { id: 'owner_sign_date', type: 'date', signerRole: 'owner', page: 0, x: 55, y: 72, width: 20, height: 4, required: true, label: 'Date' },
        { id: 'proxy_holder_signature', type: 'signature', signerRole: 'proxy_holder', page: 0, x: 10, y: 82, width: 35, height: 8, required: true, label: 'Proxy Holder Signature' },
        { id: 'proxy_holder_sign_date', type: 'date', signerRole: 'proxy_holder', page: 0, x: 55, y: 84, width: 20, height: 4, required: true, label: 'Date' },
      ],
    },
  },
  {
    name: 'Violation Acknowledgment',
    templateType: 'violation_ack',
    description:
      'Acknowledgment form for unit owners to confirm receipt of a violation notice and agree to corrective action.',
    fieldsSchema: {
      version: 1,
      signerRoles: ['owner'],
      fields: [
        { id: 'owner_name', type: 'text', signerRole: 'owner', page: 0, x: 10, y: 20, width: 35, height: 4, required: true, label: 'Owner Name' },
        { id: 'owner_unit', type: 'text', signerRole: 'owner', page: 0, x: 55, y: 20, width: 20, height: 4, required: true, label: 'Unit Number' },
        { id: 'violation_description', type: 'text', signerRole: 'owner', page: 0, x: 10, y: 32, width: 65, height: 4, required: false, label: 'Violation Description' },
        { id: 'corrective_deadline', type: 'date', signerRole: 'owner', page: 0, x: 10, y: 42, width: 20, height: 4, required: true, label: 'Correction Deadline' },
        { id: 'acknowledge_checkbox', type: 'checkbox', signerRole: 'owner', page: 0, x: 10, y: 55, width: 3, height: 3, required: true, label: 'I acknowledge receipt of this violation notice' },
        { id: 'agree_checkbox', type: 'checkbox', signerRole: 'owner', page: 0, x: 10, y: 62, width: 3, height: 3, required: true, label: 'I agree to take corrective action by the deadline' },
        { id: 'owner_signature', type: 'signature', signerRole: 'owner', page: 0, x: 10, y: 75, width: 35, height: 8, required: true, label: 'Owner Signature' },
        { id: 'sign_date', type: 'date', signerRole: 'owner', page: 0, x: 55, y: 77, width: 20, height: 4, required: true, label: 'Date' },
      ],
    },
  },
] as const;

/**
 * Seed e-sign templates and (optionally) a demo submission for a community.
 */
async function seedEsignData(
  communityId: number,
  createdByEmail: string,
  options: { userIdsByEmail: Record<string, string> },
  ownerEmail?: string,
): Promise<void> {
  const createdByUserId = resolveUserId(options.userIdsByEmail, createdByEmail);
  const ownerUserId = ownerEmail
    ? resolveUserId(options.userIdsByEmail, ownerEmail)
    : null;

  // Idempotent: clear dependent rows before templates to satisfy template_id FKs.
  await db
    .delete(esignSubmissions)
    .where(eq(esignSubmissions.communityId, communityId));

  await db.delete(esignTemplates).where(eq(esignTemplates.communityId, communityId));

  const insertedTemplates: Array<{ id: number; name: string }> = [];

  for (const tpl of ESIGN_SEED_TEMPLATES) {
    const sourceDocumentPath = await uploadSeedEsignSourceDocument(
      communityId,
      tpl.name,
      tpl.description,
      tpl.fieldsSchema,
    );

    const [row] = await db
      .insert(esignTemplates)
      .values({
        communityId,
        externalId: crypto.randomUUID(),
        name: tpl.name,
        description: tpl.description,
        sourceDocumentPath,
        templateType: tpl.templateType,
        fieldsSchema: tpl.fieldsSchema,
        status: 'active',
        createdBy: createdByUserId,
      })
      .returning({ id: esignTemplates.id, name: esignTemplates.name });

    if (row) insertedTemplates.push(row);
  }

  debugSeed(`seeded ${insertedTemplates.length} esign templates for community ${communityId}`);

  // For Sunset Condos: create a demo submission so the my-pending widget has data
  if (ownerUserId) {
    const proxyTemplate = insertedTemplates.find((t) => t.name === 'Proxy Designation Form');
    if (!proxyTemplate) return;

    const [submission] = await db
      .insert(esignSubmissions)
      .values({
        communityId,
        templateId: proxyTemplate.id,
        externalId: crypto.randomUUID(),
        status: 'pending',
        signingOrder: 'sequential',
        sendEmail: false,
        messageSubject: 'Annual Meeting Proxy Form',
        messageBody: 'Please designate your proxy holder for the upcoming annual meeting.',
        expiresAt: addDays(new Date(), 30),
        createdBy: createdByUserId,
      })
      .returning({ id: esignSubmissions.id });

    if (!submission) return;

    await db.insert(esignSigners).values({
      communityId,
      submissionId: submission.id,
      externalId: crypto.randomUUID(),
      userId: ownerUserId,
      email: 'owner.one@sunset.local',
      name: 'Owner One',
      role: 'owner',
      slug: crypto.randomUUID(),
      sortOrder: 0,
      status: 'pending',
    });

    await db.insert(esignSigners).values({
      communityId,
      submissionId: submission.id,
      externalId: crypto.randomUUID(),
      email: 'board.president@sunset.local',
      name: 'Board President',
      role: 'proxy_holder',
      slug: crypto.randomUUID(),
      sortOrder: 1,
      status: 'pending',
    });

    debugSeed(`seeded demo esign submission with 2 signers for community ${communityId}`);
  }
}

export async function runDemoSeed(options: DemoSeedOptions = {}): Promise<void> {
  const syncAuthUsers = options.syncAuthUsers ?? true;
  debugSeed(`runDemoSeed start (syncAuthUsers=${String(syncAuthUsers)})`);

  const communityIdsBySlug: Partial<Record<DemoCommunitySlug, number>> = {};
  const communitySeedResults: SeedCommunityResult[] = [];

  for (const community of DEMO_COMMUNITIES) {
    const usersToSeed = buildSeedUsers(PRIMARY_ASSIGNMENTS[community.slug]);

    const result = await seedCommunity(
      {
        ...community,
        isDemo: true,
      } as SeedCommunityConfig,
      usersToSeed,
      { syncAuthUsers },
    );

    communityIdsBySlug[community.slug] = result.communityId;
    communitySeedResults.push(result);
  }
  debugSeed('communities seeded via seedCommunity');

  const userIdsByEmail = collectUserIds(communitySeedResults);

  const sunsetCommunityId = communityIdsBySlug['sunset-condos'];
  const palmCommunityId = communityIdsBySlug['palm-shores-hoa'];
  const apartmentCommunityId = communityIdsBySlug['sunset-ridge-apartments'];

  if (!sunsetCommunityId || !palmCommunityId || !apartmentCommunityId) {
    throw new Error('Missing seeded community IDs');
  }

  const communityTypeBySlug = Object.fromEntries(
    DEMO_COMMUNITIES.map((c) => [c.slug, c.communityType]),
  ) as Record<DemoCommunitySlug, CommunityType>;

  const crossBySlug = new Map<DemoCommunitySlug, Array<{ communityId: number; userId: string; role: CanonicalRole }>>();
  for (const assignment of CROSS_COMMUNITY_ASSIGNMENTS) {
    const entry = {
      communityId: communityIdsBySlug[assignment.slug]!,
      userId: resolveUserId(userIdsByEmail, assignment.email),
      role: assignment.role,
    };
    const existing = crossBySlug.get(assignment.slug) ?? [];
    existing.push(entry);
    crossBySlug.set(assignment.slug, existing);
  }

  for (const [slug, assignments] of crossBySlug) {
    await seedRoles(assignments, communityTypeBySlug[slug]);
  }

  const crossAssignments = CROSS_COMMUNITY_ASSIGNMENTS.map((assignment) => ({
    communityId: communityIdsBySlug[assignment.slug]!,
    userId: resolveUserId(userIdsByEmail, assignment.email),
  }));

  await Promise.all(
    crossAssignments.map((a) => ensureNotificationPreference(a.communityId, a.userId)),
  );

  await Promise.all(
    DEMO_COMMUNITIES.flatMap((community) => {
      const communityId = communityIdsBySlug[community.slug]!;
      return GLOBAL_PREF_USER_EMAILS.map((email) => {
        const userId = resolveUserId(userIdsByEmail, email);
        return ensureNotificationPreference(communityId, userId);
      });
    }),
  );
  const condoAndHoa = await db
    .select({
      id: communities.id,
      slug: communities.slug,
      communityType: communities.communityType,
    })
    .from(communities)
    .where(
      and(
        inArray(communities.slug, ['sunset-condos', 'palm-shores-hoa', 'sunset-ridge-apartments']),
        isNull(communities.deletedAt),
      ),
    );

  const boardPresidentId = await ensureDemoUserRecord(
    'board.president@sunset.local',
    resolveUserId(userIdsByEmail, 'board.president@sunset.local'),
  );
  userIdsByEmail['board.president@sunset.local'] = boardPresidentId;
  for (const community of condoAndHoa) {
    if (community.communityType === 'apartment') {
      await db
        .update(communities)
        .set({
          transparencyEnabled: false,
          transparencyAcknowledgedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(communities.id, community.id));
      continue;
    }

    await seedTransparencyDemoData(
      community.id,
      community.communityType,
      community.slug as DemoCommunitySlug,
      boardPresidentId,
    );

    await db
      .update(communities)
      .set({
        transparencyEnabled: true,
        transparencyAcknowledgedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(communities.id, community.id));
  }

  debugSeed('cross-community role and notification fixups complete');

  // Link owner to unit 1A for Sunset Condos (payments + assessments require unit association)
  const ownerUserId = await ensureDemoUserRecord(
    'owner.one@sunset.local',
    resolveUserId(userIdsByEmail, 'owner.one@sunset.local'),
  );
  userIdsByEmail['owner.one@sunset.local'] = ownerUserId;
  {
    const firstUnit = await db
      .select({ id: units.id })
      .from(units)
      .where(and(eq(units.communityId, sunsetCommunityId), isNull(units.deletedAt)))
      .orderBy(units.unitNumber)
      .limit(1);

    if (firstUnit[0]) {
      await db.transaction(async (tx) => {
        await tx
          .update(units)
          .set({ ownerUserId, updatedAt: new Date() })
          .where(eq(units.id, firstUnit[0]!.id));

        await tx.execute(sql`
          UPDATE user_roles
          SET unit_id = ${firstUnit[0]!.id}
          WHERE community_id = ${sunsetCommunityId}
            AND user_id = ${ownerUserId}
        `);
      });
      debugSeed(`linked owner to unit ${firstUnit[0].id} in community ${sunsetCommunityId}`);
    }
  }

  // Seed violation data for condo and HOA communities (apartments don't have violations)
  await seedViolationsData(sunsetCommunityId, ownerUserId);
  // Palm Shores gets 2 violations (reported + resolved via the same function, we re-use first 2)
  await seedViolationsData(palmCommunityId, boardPresidentId);
  debugSeed('violations seed complete');

  // Seed emergency broadcast data for Sunset Condos
  const camUserId = await ensureDemoUserRecord(
    'cam.one@sunset.local',
    resolveUserId(userIdsByEmail, 'cam.one@sunset.local'),
  );
  userIdsByEmail['cam.one@sunset.local'] = camUserId;
  const tenantUserId = await ensureDemoUserRecord(
    'tenant.one@sunset.local',
    resolveUserId(userIdsByEmail, 'tenant.one@sunset.local'),
  );
  userIdsByEmail['tenant.one@sunset.local'] = tenantUserId;
  const emergencyRecipientIds = [ownerUserId, boardPresidentId, tenantUserId];
  await seedEmergencyBroadcastData(sunsetCommunityId, camUserId, emergencyRecipientIds);
  debugSeed('emergency broadcast seed complete');

  // Seed e-sign templates for all communities, demo submission for Sunset only
  await seedEsignData(
    sunsetCommunityId,
    'board.president@sunset.local',
    { userIdsByEmail },
    'owner.one@sunset.local',
  );
  await seedEsignData(
    palmCommunityId,
    'board.president@sunset.local',
    { userIdsByEmail },
  );
  await seedEsignData(
    apartmentCommunityId,
    'site.manager@sunsetridge.local',
    { userIdsByEmail },
  );
  debugSeed('esign seed complete');

  // Seed assessment + line item data for Sunset Condos
  await seedAssessmentData(sunsetCommunityId, boardPresidentId);
  debugSeed('assessment seed complete');

  await seedPmPortfolioBilling(userIdsByEmail);
  debugSeed('pm portfolio billing seed complete');

  debugSeed('runDemoSeed complete');
}

/**
 * Seeds assessment and line item data for a demo community.
 * Creates two assessments (monthly maintenance + one-time special) with
 * line items for all units in the community.
 */
async function seedAssessmentData(communityId: number, createdByUserId: string): Promise<void> {
  await db
    .delete(assessmentLineItems)
    .where(eq(assessmentLineItems.communityId, communityId));

  await db
    .delete(assessments)
    .where(eq(assessments.communityId, communityId));

  // Get all units for this community
  const communityUnits = await db
    .select({ id: units.id })
    .from(units)
    .where(and(eq(units.communityId, communityId), isNull(units.deletedAt)));

  if (communityUnits.length === 0) {
    debugSeed(`no units found for community ${communityId}, skipping assessment seed`);
    return;
  }

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

  // 1. Monthly maintenance assessment
  const [monthlyAssessment] = await db
    .insert(assessments)
    .values({
      communityId,
      title: 'Monthly Maintenance Assessment',
      description: 'Regular monthly assessment for common area maintenance, insurance, and reserves.',
      amountCents: 35000, // $350.00
      frequency: 'monthly',
      dueDay: 1,
      lateFeeAmountCents: 2500, // $25.00
      lateFeeDaysGrace: 15,
      startDate: `${lastMonthStr}-01`,
      isActive: true,
      createdByUserId,
    })
    .returning({ id: assessments.id });

  // 2. One-time special assessment
  const [specialAssessment] = await db
    .insert(assessments)
    .values({
      communityId,
      title: 'Special Assessment — Roof Repair',
      description: 'One-time special assessment for emergency roof repairs approved at March board meeting.',
      amountCents: 150000, // $1,500.00
      frequency: 'one_time',
      dueDay: 15,
      lateFeeAmountCents: 5000, // $50.00
      lateFeeDaysGrace: 30,
      startDate: `${thisMonth}-15`,
      isActive: true,
      createdByUserId,
    })
    .returning({ id: assessments.id });

  if (!monthlyAssessment || !specialAssessment) {
    throw new Error(`Failed to create seeded assessments for community ${communityId}`);
  }

  // Generate line items for monthly assessment — last month (overdue) + this month (pending)
  const lastMonthDue = `${lastMonthStr}-01`;
  const thisMonthDue = `${thisMonth}-01`;
  const specialDue = `${thisMonth}-15`;

  const lineItemValues = [];

  for (const unit of communityUnits) {
    // Last month's assessment — overdue (due date has passed)
    lineItemValues.push({
      assessmentId: monthlyAssessment.id,
      communityId,
      unitId: unit.id,
      amountCents: 35000,
      dueDate: lastMonthDue,
      status: 'overdue' as const,
      lateFeeCents: 2500, // grace period elapsed
    });

    // This month's assessment — pending
    lineItemValues.push({
      assessmentId: monthlyAssessment.id,
      communityId,
      unitId: unit.id,
      amountCents: 35000,
      dueDate: thisMonthDue,
      status: 'pending' as const,
      lateFeeCents: 0,
    });

    // Special assessment — pending
    lineItemValues.push({
      assessmentId: specialAssessment.id,
      communityId,
      unitId: unit.id,
      amountCents: 150000,
      dueDate: specialDue,
      status: 'pending' as const,
      lateFeeCents: 0,
    });
  }

  await db.insert(assessmentLineItems).values(lineItemValues);

  debugSeed(`seeded 2 assessments with ${lineItemValues.length} line items for community ${communityId}`);
}

async function main(): Promise<void> {
  try {
    const syncAuthUsers = shouldSyncDemoAuthUsers();
    await runSeedSafetyChecks({
      databaseUrl: process.env.DATABASE_URL ?? '',
      db,
    });
    await runDemoSeed({ syncAuthUsers });
    // eslint-disable-next-line no-console
    console.log('Demo seed complete.');
  } finally {
    await closeUnscopedClient();
  }
}

const isEntrypoint = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isEntrypoint) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Demo seed failed:', error);
      process.exit(1);
    });
}
