/**
 * Post-conversion success page — 4-state server component.
 *
 * State 1: Demo not found → 404
 * State 2: Checkout completed, webhook pending → show polling client
 * State 3: Checkout terminal failure (expired/open) → "Try again" link
 * State 4: Conversion complete → personalized or generic success content
 *
 * Session binding: when session_id is present and valid, shows personalized
 * content (email, community-type next steps). Without valid session, shows
 * generic content only — prevents data leak from public URL.
 */
export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { demoInstances, communities } from '@propertypro/db';
import { eq, and, isNull } from '@propertypro/db/filters';
import type { CommunityType } from '@propertypro/shared';
import { retrieveCheckoutSession } from '@/lib/services/stripe-service';
import { PollingClient } from './polling-client';

interface ConvertedPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ session_id?: string }>;
}

async function loadDemoForConverted(slug: string) {
  const db = createUnscopedClient();
  const rows = await db
    .select({
      id: demoInstances.id,
      slug: demoInstances.slug,
      seededCommunityId: demoInstances.seededCommunityId,
      communityName: communities.name,
      communityType: communities.communityType,
      isDemo: communities.isDemo,
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

function getNextSteps(communityType: string): string[] {
  switch (communityType) {
    case 'condo_718':
    case 'hoa_720':
      return [
        'Set your password via the welcome email',
        'Upload your governing documents',
        'Invite board members',
      ];
    case 'apartment':
      return [
        'Set your password via the welcome email',
        'Set up your unit directory',
        'Configure visitor and package logging',
      ];
    default:
      return [
        'Set your password via the welcome email',
        'Configure your community settings',
        'Invite your team',
      ];
  }
}

export default async function ConvertedPage({ params, searchParams }: ConvertedPageProps) {
  const { slug } = await params;
  const { session_id: sessionId } = await searchParams;

  const demo = await loadDemoForConverted(slug);

  // State 1: Demo not found or soft-deleted
  if (!demo) {
    notFound();
  }

  // Try to load Stripe session for personalization + state detection
  let stripeSession: Awaited<ReturnType<typeof retrieveCheckoutSession>> | null = null;
  let sessionValid = false;

  if (sessionId) {
    try {
      stripeSession = await retrieveCheckoutSession(sessionId);
      // Verify session metadata slug matches URL slug
      sessionValid = stripeSession.metadata?.slug === slug;
    } catch {
      // Session retrieval failed — treat as no session
    }
  }

  // State 2: Checkout completed, webhook pending
  // Demo still has is_demo=true but Stripe session is complete
  if (demo.isDemo && stripeSession && sessionValid && stripeSession.status === 'complete') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--surface-page)] px-4">
        <div className="w-full max-w-md rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] p-8 shadow-sm">
          <PollingClient />
        </div>
      </main>
    );
  }

  // State 3: Checkout terminal failure
  if (demo.isDemo && stripeSession && sessionValid && (stripeSession.status === 'expired' || stripeSession.status === 'open')) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--surface-page)] px-4">
        <div className="w-full max-w-md rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] p-8 text-center shadow-sm">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--status-danger-bg)]">
            <svg className="h-8 w-8 text-[var(--status-danger)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="mb-3 text-2xl font-semibold text-[var(--text-primary)]">
            Checkout was not completed
          </h1>
          <p className="mb-6 text-base text-[var(--text-secondary)]">
            Your checkout session expired or was cancelled. You can try again anytime.
          </p>
          <a
            href={`/demo/${slug}/upgrade`}
            className="inline-flex h-10 items-center justify-center rounded-[10px] bg-[var(--interactive-primary)] px-6 text-sm font-semibold text-white transition-colors hover:bg-[var(--interactive-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)] focus-visible:ring-offset-2"
          >
            Try Again
          </a>
        </div>
      </main>
    );
  }

  // State 4: Conversion complete (is_demo === false)
  // OR: demo still active but no valid session — show generic
  const isConverted = !demo.isDemo;
  const customerEmail = sessionValid ? stripeSession?.customer_details?.email ?? stripeSession?.metadata?.customerEmail : null;
  const isPersonalized = isConverted && sessionValid && customerEmail;
  const nextSteps = getNextSteps(demo.communityType);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--surface-page)] px-4">
      <div className="w-full max-w-md rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] p-8 text-center shadow-sm">
        {/* Checkmark Icon */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--status-success-bg)]">
          <svg
            className="h-8 w-8 text-[var(--status-success)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="mb-3 text-2xl font-semibold text-[var(--text-primary)]">
          {isConverted ? 'Your community is now live' : 'Thank you'}
        </h1>

        {isPersonalized ? (
          <>
            <p className="mb-8 text-base text-[var(--text-secondary)]">
              We sent a welcome email to <strong className="font-semibold text-[var(--text-primary)]">{customerEmail}</strong>
            </p>
            <div className="space-y-4 text-left">
              {nextSteps.map((step, i) => (
                <div key={i} className="flex gap-3">
                  <span className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--status-brand-bg)] text-sm font-medium text-[var(--status-brand)]">
                    {i + 1}
                  </span>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{step}</p>
                </div>
              ))}
            </div>
            <a
              href="/auth/login"
              className="mt-8 inline-flex h-10 items-center justify-center rounded-[10px] bg-[var(--interactive-primary)] px-6 text-sm font-semibold text-white transition-colors hover:bg-[var(--interactive-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)] focus-visible:ring-offset-2"
            >
              Go to Your Community
            </a>
          </>
        ) : (
          <>
            <p className="mb-8 text-base text-[var(--text-secondary)]">
              {isConverted
                ? 'Check your email for login instructions.'
                : 'Your checkout is being processed. Check your email for login instructions.'}
            </p>
            <a
              href="/auth/login"
              className="inline-flex h-10 items-center justify-center rounded-[10px] bg-[var(--interactive-primary)] px-6 text-sm font-semibold text-white transition-colors hover:bg-[var(--interactive-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--interactive-primary)] focus-visible:ring-offset-2"
            >
              Go to Login
            </a>
          </>
        )}
      </div>
    </main>
  );
}
