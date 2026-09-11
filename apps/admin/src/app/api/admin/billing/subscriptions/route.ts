/**
 * GET /api/admin/billing/subscriptions?status= — the whole subscription portfolio.
 *
 * The `/billing` page is a Server Component and calls `getBillingOverview()`
 * directly; this exists for the client-side filter tabs and refresh, and for an
 * operator who wants the raw cents.
 *
 * The status filter is applied HERE, after the cached read, rather than being
 * pushed into `stripe.subscriptions.list`. One cached Stripe read then serves
 * every tab; filtering upstream would mean one Stripe read per tab and five
 * separately-stale KPI blocks. The KPIs and the series deliberately stay computed
 * over the UNFILTERED portfolio — an MRR headline that changed when you clicked
 * "Past due" would be a different number presented as the same one.
 *
 * Why the gate is not optional: this body carries every customer's Stripe
 * subscription and customer ids plus what each pays.
 *
 * AUTHZ: requirePlatformAdmin() — super_admin only, enforced on the first line.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { parseAdminQuery } from '@/lib/api/parse-body';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { filterBillingRows, getBillingOverview } from '@/lib/server/billing';

export const dynamic = 'force-dynamic';

/**
 * Validated rather than passed through. It never reaches SQL — `filterBillingRows`
 * compares it to a union in JS — but an unvalidated value silently matching
 * nothing would render an empty table that looks like "no past-due subscriptions",
 * which is the one answer on this screen that must never be wrong by accident.
 */
const statusSchema = z
  .enum(['all', 'active', 'trialing', 'past_due', 'canceled', 'other'])
  .optional();

export const GET = withAdminErrorHandler(async (request: NextRequest) => {
  await requirePlatformAdmin();

  const raw = request.nextUrl.searchParams.get('status');
  const status = parseAdminQuery(raw || undefined, statusSchema, 'status');
  if (status instanceof NextResponse) return status;

  const overview = await getBillingOverview();

  return NextResponse.json({
    data: { ...overview, rows: filterBillingRows(overview.rows, status ?? null) },
  });
});
