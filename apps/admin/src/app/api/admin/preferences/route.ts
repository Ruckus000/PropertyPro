/**
 * GET  /api/admin/preferences — this operator's console preferences
 * PUT  /api/admin/preferences — patch their alert preferences
 *
 * Self-scoped by construction. The `userId` is taken from
 * `requirePlatformAdmin()`'s return value and is NEVER read from the request,
 * so there is no shape of body or query string that lets one platform admin
 * read or rewrite another's settings. That is the whole authorization story
 * here, and it is why these routes carry no `userId` parameter to validate.
 *
 * These reads go through the service-role client (see `lib/server/preferences`),
 * which bypasses RLS, so the gate runs before any data is touched.
 *
 * No audit entry. `platform_admin_audit_log` records actions taken ON the
 * platform — a grant, a deletion, a billing change — and is append-only, so
 * every entry it carries is permanent. An operator muting their own push
 * notifications changes nothing another operator can observe and no tenant's
 * data; logging it would dilute the trail that matters with per-keystroke noise
 * that can never be pruned.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { parseAdminBody } from '@/lib/api/parse-body';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import {
  ALERT_PREF_KEYS,
  ERROR_SPIKE_THRESHOLD_MAX,
  ERROR_SPIKE_THRESHOLD_MIN,
  getPreferences,
  updateAlertPrefs,
} from '@/lib/server/preferences';

export const dynamic = 'force-dynamic';

/**
 * STRICT, deliberately — and deliberately unlike `parseAlertPrefs`.
 *
 * A stored row is history: it may predate this build, so it degrades to
 * defaults rather than failing. A request is a live caller who can be told it
 * is wrong, and telling them is how a typo in a future client surfaces as a 400
 * instead of as a preference that silently never saves. Same vocabulary, two
 * different obligations.
 */
const alertPrefsPatchSchema = z
  .object({
    ...Object.fromEntries(ALERT_PREF_KEYS.map((key) => [key, z.boolean().optional()])),
    errorSpikeThreshold: z
      .number()
      .int()
      .min(ERROR_SPIKE_THRESHOLD_MIN)
      .max(ERROR_SPIKE_THRESHOLD_MAX)
      .optional(),
  })
  .strict();

const updateSchema = z.object({ alertPrefs: alertPrefsPatchSchema }).strict();

export const GET = withAdminErrorHandler(async () => {
  const admin = await requirePlatformAdmin();
  const data = await getPreferences(admin.id);
  // `private, no-store`: this is one named operator's settings, and a shared
  // cache holding them would be a cross-operator leak.
  return NextResponse.json({ data }, { headers: { 'Cache-Control': 'private, no-store' } });
});

export const PUT = withAdminErrorHandler(async (request: NextRequest) => {
  const admin = await requirePlatformAdmin();

  const parsed = await parseAdminBody(request, updateSchema);
  if (parsed instanceof NextResponse) return parsed;

  const data = await updateAlertPrefs(admin.id, parsed.alertPrefs);
  return NextResponse.json({ data }, { headers: { 'Cache-Control': 'private, no-store' } });
});
