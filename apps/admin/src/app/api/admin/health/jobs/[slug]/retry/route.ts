/**
 * POST /api/admin/health/jobs/[slug]/retry — fire one scheduled job by hand.
 *
 * ## This is a trust boundary, not a convenience
 *
 * The slug arrives in the URL and ends up interpolated into a `fetch` aimed at
 * `${WEB_APP_ORIGIN}/api/v1/internal/<slug>`, carrying the platform-wide
 * `CRON_SECRET`. That secret is the ONLY thing authenticating twenty privileged,
 * side-effectful endpoints on the web app — `expire-demos` soft-deletes
 * communities, `late-fee-processor` assesses money, `provision` creates tenants.
 * So this route is a way to make the web app run privileged work, addressed by a
 * string an attacker controls, authenticated by a secret the attacker never sees.
 *
 * Three gates, in this order, and the order is the point:
 *
 * 1. `requirePlatformAdmin()` — first statement, before the slug is even read.
 * 2. **Shape**: `/^[a-z0-9-]+$/`. No `.`, no `/`, no `%`, no uppercase. This is
 *    what stops `../../internal/provision` and `//evil.test/x` from becoming a
 *    different URL than the template reads like. Checked BEFORE the database, so
 *    a traversal attempt costs no query.
 * 3. **Membership** of `listKnownJobSlugs()` — the slugs actually observed in
 *    `cron_runs`. The shape check alone is insufficient and not by a small
 *    margin: `provision` and `readiness` both match the pattern and are both
 *    real privileged endpoints, and neither is a cron job. An allowlist derived
 *    from observed rows cannot drift from the truth the way a hard-coded one can.
 *
 * ## The path is a lookup, not a reconstruction
 *
 * `${origin}/api/v1/internal/${slug}` was right for 16 of the 17 registered jobs
 * and wrong for the one nested route. `internalPathForCronSlug` owns the
 * exception and `guard:cron-job-tagging` asserts it against the registry, so a
 * future nested job fails the build rather than shipping a button that 404s.
 *
 * And two refusals rather than a guess: an unset `WEB_APP_ORIGIN` must not
 * become a RELATIVE fetch (which would resolve against the admin app and make
 * this route call something unintended on localhost), and an unset `CRON_SECRET`
 * must not become `Bearer undefined` on the wire. Both are 503 — a configuration
 * problem, not a bad request.
 *
 * ## The header shape
 *
 * `requireCronSecret` in `apps/web/src/lib/api/cron-auth.ts` reads
 * `Authorization: Bearer <token>` (lowercased prefix check, then `slice`) and
 * compares timing-safely against `CRON_SECRET`. Per-route secret names are what
 * made every cron 401 silently for months behind a green Vercel dashboard — do
 * not introduce one here.
 *
 * AUTHZ: requirePlatformAdmin() — super_admin only, enforced on the first line.
 */
import { NextResponse, type NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { NotFoundError } from '@propertypro/shared/http';

import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { logAdminAction } from '@/lib/audit/log-admin-action';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { internalPathForCronSlug } from '@/lib/server/cron-job-paths';
import { listKnownJobSlugs } from '@/lib/server/health';

/**
 * The only slug shape that can exist in `apps/web/src/lib/cron/registry.ts`.
 *
 * Anchored at both ends and with no `.`, `/`, `%` or uppercase in the class, so
 * the value cannot change which path the template addresses. A single missing
 * anchor here is the whole vulnerability.
 */
const JOB_SLUG_PATTERN = /^[a-z0-9-]+$/;

/** Bounded: a hung cron must not hold an admin request open indefinitely. */
const RETRY_TIMEOUT_MS = 30_000;

/**
 * Resolve the web app's origin, or `null`.
 *
 * Parsed rather than string-tested so a value like `file:///etc` or
 * `javascript:…` is rejected on its protocol, and the trailing slash is dropped
 * so the built URL cannot contain `//api`.
 */
function resolveWebOrigin(): string | null {
  const raw = process.env.WEB_APP_ORIGIN;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function misconfigured(message: string): NextResponse {
  return NextResponse.json({ error: { code: 'NOT_CONFIGURED', message } }, { status: 503 });
}

export const POST = withAdminErrorHandler(
  async (_request: NextRequest, context: { params: Promise<{ slug: string }> }) => {
    const admin = await requirePlatformAdmin();

    const { slug } = await context.params;

    // Shape first, so a traversal attempt never reaches the database.
    if (!JOB_SLUG_PATTERN.test(slug)) {
      // 404, not 400: this route only admits slugs it already knows about, so
      // "that is not a job" is the honest answer and it reveals nothing about
      // which strings would have been accepted.
      throw new NotFoundError('Unknown scheduled job');
    }

    const known = await listKnownJobSlugs();
    if (!known.includes(slug)) {
      throw new NotFoundError('Unknown scheduled job');
    }

    const origin = resolveWebOrigin();
    if (!origin) {
      return misconfigured(
        'WEB_APP_ORIGIN is not set to an http(s) origin, so the scheduled job cannot be reached.',
      );
    }

    const secret = process.env.CRON_SECRET;
    if (!secret) {
      return misconfigured('CRON_SECRET is not set, so the scheduled job cannot be authenticated.');
    }

    let response: Response;
    try {
      // The path is LOOKED UP, not reconstructed. `notification-digests-process`
      // lives at `/api/v1/internal/notification-digests/process`, and the slug's
      // `/` → `-` substitution is not reversible — so interpolating the slug
      // POSTed to a path that does not exist and the UI reported the 404 as the
      // job failing. See `cron-job-paths.ts`.
      response = await fetch(`${origin}${internalPathForCronSlug(slug)}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(RETRY_TIMEOUT_MS),
      });
    } catch (error) {
      // The real message goes to Sentry, not to the response. A transport error
      // here carries the resolved host and port of an internal deployment
      // (`ECONNREFUSED 10.x.x.x:3000`, a DNS name), which is infrastructure
      // topology and does not belong in a body the browser can read.
      Sentry.captureException(error, { tags: { cron_retry_slug: slug } });

      // Nothing ran, so nothing is audited: an entry here would record a retry
      // that never reached the job.
      return NextResponse.json(
        {
          error: {
            code: 'BAD_GATEWAY',
            message: 'The web app did not answer. The retry was not delivered.',
          },
        },
        { status: 502 },
      );
    }

    // Audited after the call and from values already in hand — the job ran (or
    // refused), and that is what the trail records.
    await logAdminAction({
      admin,
      action: 'cron_job_retried',
      resourceType: 'cron_job',
      resourceId: slug,
      // Platform-level: a scheduled job belongs to no single community.
      communityId: null,
      metadata: { status: response.status },
    });

    // 200 with `ok: false` when the job itself failed. A 5xx here would read as
    // "the console is broken" when what happened is that the retry was
    // delivered and the job refused it.
    return NextResponse.json({ data: { status: response.status, ok: response.ok } });
  },
);
