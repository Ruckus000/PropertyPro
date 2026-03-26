/**
 * Demo self-service upgrade page.
 *
 * Authenticates the demo user via Supabase SSR cookie-based session,
 * validates they are one of the demo instance's user IDs, and shows
 * plan selection + checkout form.
 *
 * Auth: Direct @supabase/ssr server client (NOT middleware headers —
 * /demo/* is not in middleware's protected path set).
 */
import { redirect, notFound } from 'next/navigation';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { demoInstances, communities } from '@propertypro/db';
import { eq, and, isNull } from '@propertypro/db/filters';
import { createServerClient } from '@/lib/supabase/server';
import { computeDemoStatus } from '@propertypro/shared';
import type { CommunityType } from '@propertypro/shared';
import { SIGNUP_PLAN_OPTIONS } from '@/lib/auth/signup-schema';
import { UpgradeForm } from './upgrade-form';

interface UpgradePageProps {
  params: Promise<{ slug: string }>;
}

async function loadDemoForUpgrade(slug: string) {
  const db = createUnscopedClient();
  const rows = await db
    .select({
      id: demoInstances.id,
      slug: demoInstances.slug,
      seededCommunityId: demoInstances.seededCommunityId,
      demoResidentUserId: demoInstances.demoResidentUserId,
      demoBoardUserId: demoInstances.demoBoardUserId,
      communityName: communities.name,
      communityType: communities.communityType,
      isDemo: communities.isDemo,
      trialEndsAt: communities.trialEndsAt,
      demoExpiresAt: communities.demoExpiresAt,
      deletedAt: communities.deletedAt,
    })
    .from(demoInstances)
    .innerJoin(communities, eq(communities.id, demoInstances.seededCommunityId))
    .where(
      and(
        eq(demoInstances.slug, slug),
        isNull(demoInstances.deletedAt),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export default async function DemoUpgradePage({ params }: UpgradePageProps) {
  const { slug } = await params;
  const demo = await loadDemoForUpgrade(slug);

  if (!demo) {
    notFound();
  }

  // Already converted → redirect to converted page
  if (!demo.isDemo) {
    redirect(`/demo/${slug}/converted`);
  }

  // Expired (soft-deleted) → redirect to landing page
  const status = computeDemoStatus({
    isDemo: demo.isDemo,
    trialEndsAt: demo.trialEndsAt,
    demoExpiresAt: demo.demoExpiresAt,
    deletedAt: demo.deletedAt,
  });

  if (status === 'expired') {
    redirect(`/demo/${slug}`);
  }

  // Auth: validate current user is a demo user
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/demo/${slug}`);
  }

  const isDemoUser =
    user.id === demo.demoResidentUserId ||
    user.id === demo.demoBoardUserId;

  if (!isDemoUser) {
    redirect(`/demo/${slug}`);
  }

  const communityType = demo.communityType as CommunityType;
  const plans = SIGNUP_PLAN_OPTIONS[communityType];

  return (
    <main className="flex min-h-screen items-start justify-center bg-[var(--surface-page)] px-4 py-12 sm:py-16">
      <div className="w-full max-w-[640px]">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            {demo.communityName}
          </h1>
          <p className="mt-2 text-base text-[var(--text-secondary)]">
            Choose your plan to get started
          </p>
        </div>

        <UpgradeForm
          slug={slug}
          communityName={demo.communityName}
          communityType={communityType}
          plans={plans.map((p) => ({
            id: p.id,
            label: p.label,
            monthlyPriceUsd: p.monthlyPriceUsd,
            description: p.description,
          }))}
        />
      </div>
    </main>
  );
}
