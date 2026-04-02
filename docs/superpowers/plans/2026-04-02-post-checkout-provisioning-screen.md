# Post-Checkout Provisioning Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static "Payment successful" dead-end with a live provisioning progress screen that auto-logs the user into their new dashboard.

**Architecture:** New `GET /api/v1/auth/provisioning-status` endpoint polls provisioning state and generates a cached magic link token on completion. The checkout return page becomes a thin server wrapper + `ProvisioningProgress` client component that polls the API, auto-logs in via `verifyOtp`, and redirects to the dashboard with community context.

**Tech Stack:** Next.js 15 (App Router), Supabase Auth (`generateLink` + `verifyOtp`), Tailwind CSS, Lucide icons, design system tokens

**Spec:** `docs/superpowers/specs/2026-04-02-post-checkout-provisioning-screen-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `apps/web/src/lib/services/stripe-service.ts:90` | Append `signupRequestId` to return URL |
| Modify | `apps/web/src/middleware.ts:76-107` | Add provisioning-status to TOKEN_AUTH_ROUTES |
| Create | `apps/web/src/app/api/v1/auth/provisioning-status/route.ts` | Status polling endpoint + cached magic link token generation |
| Modify | `apps/web/src/app/(public)/signup/checkout/return/page.tsx` | Thin server wrapper extracting params → client component |
| Create | `apps/web/src/components/signup/provisioning-progress.tsx` | Client component: progress UI, polling, auto-login, redirect |
| Create | `apps/web/__tests__/auth/provisioning-status-route.test.ts` | Unit tests for the API endpoint |

---

### Task 1: Append signupRequestId to Stripe return URL

**Files:**
- Modify: `apps/web/src/lib/services/stripe-service.ts:90`

This one-line change ensures the client component has `signupRequestId` in the URL without an extra server call.

- [ ] **Step 1: Update the return_url**

In `apps/web/src/lib/services/stripe-service.ts`, change line 90:

```typescript
// Before:
return_url: `${returnBaseUrl}/signup/checkout/return?session_id={CHECKOUT_SESSION_ID}`,

// After:
return_url: `${returnBaseUrl}/signup/checkout/return?session_id={CHECKOUT_SESSION_ID}&signupRequestId=${encodeURIComponent(signupRequestId)}`,
```

`{CHECKOUT_SESSION_ID}` is a Stripe template variable that gets replaced at redirect time. `signupRequestId` is a plain string (UUID) passed into this function.

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/services/stripe-service.ts
git commit -m "feat(signup): append signupRequestId to Stripe checkout return URL"
```

---

### Task 2: Add provisioning-status to middleware TOKEN_AUTH_ROUTES

**Files:**
- Modify: `apps/web/src/middleware.ts:76-107`

The provisioning-status endpoint is called before the user has a session (they just paid, provisioning is creating their account). It must be in `TOKEN_AUTH_ROUTES` so middleware skips the auth redirect.

- [ ] **Step 1: Add the route entry**

In `apps/web/src/middleware.ts`, add to the `TOKEN_AUTH_ROUTES` array (after the existing `/api/v1/auth/resend-verification` entry):

```typescript
  // Provisioning status polling: no session yet, signupRequestId-authenticated [Provisioning Screen]
  { path: '/api/v1/auth/provisioning-status', method: 'GET' },
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/middleware.ts
git commit -m "feat(signup): add provisioning-status to unauthenticated routes"
```

---

### Task 3: Create provisioning-status API route — tests first

**Files:**
- Create: `apps/web/__tests__/auth/provisioning-status-route.test.ts`

Write all tests before the implementation. The test file follows the same mock pattern as `apps/web/__tests__/auth/demo-login-route.test.ts` — use `vi.hoisted()` for mock state and `vi.mock()` for module mocks.

- [ ] **Step 1: Write the test file**

Create `apps/web/__tests__/auth/provisioning-status-route.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mock state ───────────────────────────────────────────────────────
const {
  state,
  eqMock,
  createUnscopedClientMock,
  createAdminClientMock,
  generateLinkMock,
  updateSetMock,
} = vi.hoisted(() => {
  interface JobRow {
    id: number;
    signupRequestId: string;
    communityId: number | null;
    status: string;
    lastSuccessfulStatus: string | null;
  }
  interface SignupRow {
    email: string;
    payload: Record<string, unknown> | null;
    signupRequestId: string;
  }

  const state = {
    jobRows: [] as JobRow[],
    signupRows: [] as SignupRow[],
    queryCallIndex: 0,
  };

  const eqMock = vi.fn(() => Symbol('eq_predicate'));

  const updateWhereMock = vi.fn(async () => []);
  const updateSetMock = vi.fn(() => ({ where: updateWhereMock }));
  const updateMock = vi.fn(() => ({ set: updateSetMock }));

  const limitMock = vi.fn(async () => {
    const idx = state.queryCallIndex++;
    return idx === 0 ? state.jobRows : state.signupRows;
  });
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));

  const createUnscopedClientMock = vi.fn(() => ({
    select: selectMock,
    update: updateMock,
  }));

  const generateLinkMock = vi.fn();
  const createAdminClientMock = vi.fn(() => ({
    auth: { admin: { generateLink: generateLinkMock } },
  }));

  return {
    state,
    eqMock,
    createUnscopedClientMock,
    createAdminClientMock,
    generateLinkMock,
    updateSetMock,
  };
});

// ── Module mocks ─────────────────────────────────────────────────────────────
vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));
vi.mock('@propertypro/db', () => ({
  provisioningJobs: { signupRequestId: 'signup_request_id', id: 'id' },
  pendingSignups: { signupRequestId: 'signup_request_id', payload: 'payload' },
}));
vi.mock('@propertypro/db/filters', () => ({ eq: eqMock }));
vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}));

// ── Import route handler (after mocks) ──────────────────────────────────────
const { GET } = await import(
  '@/app/api/v1/auth/provisioning-status/route'
);

function makeRequest(signupRequestId?: string): Request {
  const params = signupRequestId
    ? `?signupRequestId=${encodeURIComponent(signupRequestId)}`
    : '';
  return new Request(`http://localhost:3000/api/v1/auth/provisioning-status${params}`);
}

describe('GET /api/v1/auth/provisioning-status', () => {
  afterEach(() => {
    vi.clearAllMocks();
    state.jobRows = [];
    state.signupRows = [];
    state.queryCallIndex = 0;
  });

  it('returns 400 when signupRequestId is missing', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('returns pending when no provisioning job exists yet', async () => {
    state.jobRows = [];
    const res = await GET(makeRequest('abc-123'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('pending');
    expect(body.step).toBe('waiting');
  });

  it('returns provisioning with current step when job is in progress', async () => {
    state.jobRows = [{
      id: 1,
      signupRequestId: 'abc-123',
      communityId: 42,
      status: 'categories_created',
      lastSuccessfulStatus: 'categories_created',
    }];
    const res = await GET(makeRequest('abc-123'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('provisioning');
    expect(body.step).toBe('categories_created');
  });

  it('returns failed with last successful step on failure', async () => {
    state.jobRows = [{
      id: 1,
      signupRequestId: 'abc-123',
      communityId: 42,
      status: 'failed',
      lastSuccessfulStatus: 'user_linked',
    }];
    const res = await GET(makeRequest('abc-123'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('failed');
    expect(body.step).toBe('user_linked');
  });

  it('generates and returns loginToken + communityId on completed', async () => {
    state.jobRows = [{
      id: 1,
      signupRequestId: 'abc-123',
      communityId: 42,
      status: 'completed',
      lastSuccessfulStatus: 'completed',
    }];
    state.signupRows = [{
      email: 'test@example.com',
      payload: {},
      signupRequestId: 'abc-123',
    }];
    generateLinkMock.mockResolvedValue({
      data: { properties: { hashed_token: 'magic-token-hash' } },
      error: null,
    });

    const res = await GET(makeRequest('abc-123'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('completed');
    expect(body.loginToken).toBe('magic-token-hash');
    expect(body.communityId).toBe(42);
    // Should have called generateLink with magiclink type
    expect(generateLinkMock).toHaveBeenCalledWith({
      type: 'magiclink',
      email: 'test@example.com',
    });
  });

  it('returns cached loginToken on repeated polls after completion', async () => {
    state.jobRows = [{
      id: 1,
      signupRequestId: 'abc-123',
      communityId: 42,
      status: 'completed',
      lastSuccessfulStatus: 'completed',
    }];
    state.signupRows = [{
      email: 'test@example.com',
      payload: { loginToken: 'cached-token-hash' },
      signupRequestId: 'abc-123',
    }];

    const res = await GET(makeRequest('abc-123'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.loginToken).toBe('cached-token-hash');
    // Should NOT have called generateLink — used cache
    expect(generateLinkMock).not.toHaveBeenCalled();
  });

  it('returns 500 when generateLink fails', async () => {
    state.jobRows = [{
      id: 1,
      signupRequestId: 'abc-123',
      communityId: 42,
      status: 'completed',
      lastSuccessfulStatus: 'completed',
    }];
    state.signupRows = [{
      email: 'test@example.com',
      payload: {},
      signupRequestId: 'abc-123',
    }];
    generateLinkMock.mockResolvedValue({
      data: null,
      error: { message: 'rate limited' },
    });

    const res = await GET(makeRequest('abc-123'));
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `pnpm test -- apps/web/__tests__/auth/provisioning-status-route.test.ts`
Expected: All tests FAIL (module not found — route handler doesn't exist yet)

- [ ] **Step 3: Commit test file**

```bash
git add apps/web/__tests__/auth/provisioning-status-route.test.ts
git commit -m "test(signup): add provisioning-status API route tests (red)"
```

---

### Task 4: Implement provisioning-status API route

**Files:**
- Create: `apps/web/src/app/api/v1/auth/provisioning-status/route.ts`

**Key references:**
- Schema: `packages/db/src/schema/provisioning-jobs.ts` — `provisioningJobs` table with `signupRequestId`, `status`, `lastSuccessfulStatus`, `communityId`
- Schema: `packages/db/src/schema/pending-signups.ts` — `pendingSignups` table with `email`, `payload` (JSONB), `signupRequestId`
- Admin client: `packages/db/src/supabase/admin.ts` — `createAdminClient()` for `generateLink`
- Existing pattern: `apps/web/src/lib/services/demo-session.ts:38` — `generateLink` + `hashed_token` extraction

- [ ] **Step 1: Create the route handler**

Create `apps/web/src/app/api/v1/auth/provisioning-status/route.ts`:

```typescript
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
import { eq } from '@propertypro/db/filters';
import { provisioningJobs, pendingSignups } from '@propertypro/db';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { createAdminClient } from '@propertypro/db/supabase/admin';

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

  // Completed — generate or return cached magic link token
  if (job.status === 'completed') {
    const [signup] = await db
      .select({
        email: pendingSignups.email,
        payload: pendingSignups.payload,
        signupRequestId: pendingSignups.signupRequestId,
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

    // Generate fresh magic link token
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

    // Cache the token in pending_signups.payload so subsequent polls reuse it
    await db
      .update(pendingSignups)
      .set({
        payload: { ...payload, loginToken },
      })
      .where(eq(pendingSignups.signupRequestId, signupRequestId));

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
```

- [ ] **Step 2: Run tests — verify they pass**

Run: `pnpm test -- apps/web/__tests__/auth/provisioning-status-route.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: no new errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/v1/auth/provisioning-status/route.ts
git commit -m "feat(signup): add provisioning-status polling API with cached magic link token"
```

---

### Task 5: Convert checkout return page to server wrapper + client component

**Files:**
- Modify: `apps/web/src/app/(public)/signup/checkout/return/page.tsx`
- Create: `apps/web/src/components/signup/provisioning-progress.tsx`

The return page becomes a thin server component that extracts URL params and delegates to the client component. The client component handles all interactive behavior: polling, progress display, auto-login, and redirect.

- [ ] **Step 1: Create the ProvisioningProgress client component**

Create `apps/web/src/components/signup/provisioning-progress.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';
import {
  CheckCircle2,
  CircleDashed,
  Loader2,
  Layers,
  ShieldCheck,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

interface ProvisioningStatusResponse {
  status: 'pending' | 'provisioning' | 'completed' | 'failed';
  step: string;
  loginToken?: string;
  communityId?: number;
}

interface ProvisioningProgressProps {
  signupRequestId: string;
}

// ── Step mapping ─────────────────────────────────────────────────────────────

const STAGES = [
  { label: 'Creating your portal', icon: Layers },
  { label: 'Setting up compliance tools', icon: ShieldCheck },
  { label: 'Finalizing your account', icon: Sparkles },
] as const;

function mapProvisioningStep(step: string): number {
  if (['community_created', 'user_linked'].includes(step)) return 0;
  if (['checklist_generated', 'categories_created', 'preferences_set'].includes(step)) return 1;
  if (['email_sent', 'completed'].includes(step)) return 2;
  return 0;
}

// ── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2_000;
const MAX_POLLS = 15; // 30s total

// ── Component ────────────────────────────────────────────────────────────────

export function ProvisioningProgress({ signupRequestId }: ProvisioningProgressProps) {
  const router = useRouter();
  const [activeStage, setActiveStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const pollCountRef = useRef(0);
  const stoppedRef = useRef(false);

  const handleComplete = useCallback(
    async (loginToken: string, communityId?: number) => {
      stoppedRef.current = true;
      // Mark final stage as active before login attempt
      setActiveStage(2);

      try {
        const supabase = createBrowserClient();
        const { error: otpError } = await supabase.auth.verifyOtp({
          token_hash: loginToken,
          type: 'magiclink',
        });

        if (otpError) {
          // Token expired or already consumed — fall back to login
          router.push('/auth/login?message=portal-ready');
          return;
        }

        // Session established — redirect to dashboard with community context
        const dashboardUrl = communityId
          ? `/dashboard?communityId=${communityId}`
          : '/select-community';
        router.push(dashboardUrl);
      } catch {
        router.push('/auth/login?message=portal-ready');
      }
    },
    [router],
  );

  useEffect(() => {
    const timer = setInterval(async () => {
      if (stoppedRef.current) return;

      pollCountRef.current += 1;

      if (pollCountRef.current > MAX_POLLS) {
        stoppedRef.current = true;
        setError(
          'Something went wrong setting up your portal. Our team has been notified — we\u2019ll email you when it\u2019s ready.',
        );
        return;
      }

      try {
        const res = await fetch(
          `/api/v1/auth/provisioning-status?signupRequestId=${encodeURIComponent(signupRequestId)}`,
        );

        if (!res.ok) {
          // Non-200 responses are transient — keep polling
          return;
        }

        const data: ProvisioningStatusResponse = await res.json();

        if (data.status === 'completed' && data.loginToken) {
          await handleComplete(data.loginToken, data.communityId);
          return;
        }

        if (data.status === 'failed') {
          stoppedRef.current = true;
          setError(
            'Something went wrong setting up your portal. Our team has been notified — we\u2019ll email you when it\u2019s ready.',
          );
          return;
        }

        // pending or provisioning — update progress
        if (data.status === 'provisioning') {
          setActiveStage(mapProvisioningStep(data.step));
        }
        // 'pending' (webhook not fired yet) keeps first step as active — no state change needed
      } catch {
        // Network error — keep polling
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [signupRequestId, handleComplete]);

  // ── Error state ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16">
        <div className="rounded-[10px] border border-border bg-surface-card p-6">
          <div
            role="alert"
            className="rounded-[10px] border-l-[3px] border-l-status-danger-border bg-status-danger-subtle p-4"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-danger-fg" aria-hidden="true" />
              <div className="space-y-1">
                <p className="text-base font-medium text-content">{error}</p>
                <a
                  href="/auth/login"
                  className="text-sm font-medium text-interactive hover:text-interactive-hover"
                >
                  Go to login
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ── Progress state ───────────────────────────────────────────────────────
  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <div className="rounded-[10px] border border-border bg-surface-card p-6">
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-content">
              Setting up your community
            </h1>
            <p className="mt-2 text-base text-content-secondary">
              This usually takes just a few seconds.
            </p>
          </div>

          <div className="space-y-3" aria-live="polite">
            {STAGES.map((stage, idx) => {
              const isCompleted = idx < activeStage;
              const isActive = idx === activeStage;
              const isPending = idx > activeStage;
              const Icon = stage.icon;

              return (
                <div
                  key={stage.label}
                  className={cn(
                    'flex items-center gap-3 rounded-[10px] px-4 py-3 transition-colors duration-250 ease-[cubic-bezier(0,0,0.2,1)]',
                    isActive && 'bg-surface-muted',
                  )}
                  {...(isActive ? { role: 'status' } : {})}
                >
                  {/* Status icon */}
                  {isCompleted && (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-status-success-fg" aria-hidden="true" />
                  )}
                  {isActive && (
                    <Loader2
                      className="h-4 w-4 shrink-0 animate-spin text-interactive"
                      aria-label="Loading"
                    />
                  )}
                  {isPending && (
                    <CircleDashed className="h-4 w-4 shrink-0 text-content-disabled" aria-hidden="true" />
                  )}

                  {/* Stage icon + label */}
                  <Icon
                    className={cn(
                      'h-4 w-4 shrink-0',
                      isCompleted && 'text-content',
                      isActive && 'text-content',
                      isPending && 'text-content-disabled',
                    )}
                    aria-hidden="true"
                  />
                  <span
                    className={cn(
                      'text-base',
                      isCompleted && 'text-content',
                      isActive && 'font-medium text-content',
                      isPending && 'text-content-disabled',
                    )}
                  >
                    {stage.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Replace the server page with a thin wrapper**

Replace the contents of `apps/web/src/app/(public)/signup/checkout/return/page.tsx`:

```tsx
/**
 * Stripe Checkout return page — thin server wrapper.
 *
 * Extracts signupRequestId + session_id from URL params and delegates
 * to the ProvisioningProgress client component for polling + auto-login.
 */
import { ProvisioningProgress } from '@/components/signup/provisioning-progress';

interface CheckoutReturnPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CheckoutReturnPage({ searchParams }: CheckoutReturnPageProps) {
  const resolved = await searchParams;
  const signupRequestId =
    typeof resolved['signupRequestId'] === 'string' ? resolved['signupRequestId'] : null;

  if (!signupRequestId) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-content">Invalid return URL</h1>
        <p className="mt-2 text-sm text-content-secondary">
          Missing signup reference. Please restart the signup process.
        </p>
        <a
          href="/signup"
          className="mt-6 inline-block text-sm font-medium text-interactive hover:text-interactive-hover"
        >
          &larr; Back to sign up
        </a>
      </main>
    );
  }

  return <ProvisioningProgress signupRequestId={signupRequestId} />;
}
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: no new errors

- [ ] **Step 4: Verify lint**

Run: `pnpm lint`
Expected: no new errors (the `cn()` import, Lucide icons, and Supabase client are all existing dependencies)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/signup/provisioning-progress.tsx apps/web/src/app/\(public\)/signup/checkout/return/page.tsx
git commit -m "feat(signup): add provisioning progress screen with auto-login

Replaces static 'Payment successful' page with a polling progress UI
that auto-logs users into their dashboard via magic link on completion."
```

---

### Task 6: Add reduced-motion support for spinner

**Files:**
- Modify: `apps/web/src/components/signup/provisioning-progress.tsx`

The `animate-spin` Tailwind utility doesn't automatically respect `prefers-reduced-motion`. Per the design system, all motion must degrade gracefully.

- [ ] **Step 1: Check if global reduced-motion handling exists**

Search `apps/web/src/app/globals.css` or `packages/ui/src/styles/` for a global `prefers-reduced-motion` rule that disables `animate-spin`. If it already exists and covers all animations, skip this task entirely — the global rule handles it.

If no global rule exists, add a CSS utility class to the component. In `provisioning-progress.tsx`, replace the `Loader2` className:

```tsx
// Before:
className="h-4 w-4 shrink-0 animate-spin text-interactive"

// After:
className="h-4 w-4 shrink-0 animate-spin text-interactive motion-reduce:animate-none motion-reduce:opacity-75"
```

This replaces the spin with a static dim state for reduced-motion users.

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: no new errors

- [ ] **Step 3: Commit (if changed)**

```bash
git add apps/web/src/components/signup/provisioning-progress.tsx
git commit -m "a11y(signup): respect prefers-reduced-motion on provisioning spinner"
```

---

### Task 7: Run all tests and verify build

**Files:** None (verification only)

- [ ] **Step 1: Run provisioning-status tests**

Run: `pnpm test -- apps/web/__tests__/auth/provisioning-status-route.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 2: Run full unit test suite**

Run: `pnpm test`
Expected: All existing tests still pass, no regressions

- [ ] **Step 3: Run typecheck across all packages**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 4: Run lint (includes DB access guard)**

Run: `pnpm lint`
Expected: no errors. The provisioning-status route uses `createUnscopedClient` from `@propertypro/db/unsafe` which is the correct import for cross-tenant admin queries. The CI guard (`scripts/verify-scoped-db-access.ts`) should not flag it — but verify.

- [ ] **Step 5: Run production build**

Run: `pnpm build`
Expected: build succeeds with no errors

- [ ] **Step 6: Commit any fixes needed from CI checks, then final commit**

If any issues surfaced in steps 1-5, fix them and commit. Then:

```bash
git log --oneline -10
```

Verify the commit history looks clean: one commit per task, clear messages.
