/**
 * POST   /api/admin/push/subscriptions — register this browser for web push
 * DELETE /api/admin/push/subscriptions — unregister it
 *
 * Self-scoped by construction, like `/api/admin/preferences`: the `userId`
 * comes from `requirePlatformAdmin()` and is never read from the request. The
 * DELETE additionally filters on `user_id` as well as `endpoint`, so one
 * operator cannot unsubscribe another's device by quoting its endpoint — the
 * endpoint is UNIQUE platform-wide, so without that filter it would be a
 * sufficient key on its own.
 *
 * ## What is audited, and what is deliberately not recorded
 *
 * `platform_admin_audit_log` is APPEND-ONLY, so anything written here is
 * permanent and uncorrectable. A subscription's `endpoint` + `p256dh` + `auth`
 * are together a capability to deliver notifications to a named operator's
 * device, which is precisely the reason migration 0073 revokes the table from
 * `anon`/`authenticated`. So the entry records the endpoint's ORIGIN (which push
 * service, useful for diagnosing a provider-wide failure) and nothing else —
 * never the path, never either key.
 *
 * It is `bestEffort`, unlike the destructive actions in that log. The row is
 * already written by the time the audit entry is attempted, and the toggle
 * reverts on a non-2xx: throwing here would show an operator "we could not
 * subscribe you" about a subscription that exists and is receiving pushes,
 * which is a worse outcome than a missing line in the trail for a preference.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { createAdminTypedClient } from '@propertypro/db/supabase/admin';

import { parseAdminBody } from '@/lib/api/parse-body';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { logAdminAction } from '@/lib/audit/log-admin-action';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';

export const dynamic = 'force-dynamic';

/**
 * `https://` is asserted here as well as by the table's CHECK constraint.
 * `web-push` POSTs to whatever string it is handed, so the bound is on where we
 * will send — a DB error is a 500, and this is a 400 that says why.
 */
const endpointSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine((value) => value.startsWith('https://'), {
    message: 'endpoint must be an https:// URL',
  });

const subscribeSchema = z
  .object({
    endpoint: endpointSchema,
    keys: z.object({
      p256dh: z.string().min(1).max(512),
      auth: z.string().min(1).max(512),
    }),
  })
  .strict();

const unsubscribeSchema = z.object({ endpoint: endpointSchema }).strict();

/** Only the push service's origin reaches the audit log — never the path or keys. */
function endpointOrigin(endpoint: string): string {
  try {
    return new URL(endpoint).origin;
  } catch {
    return 'unparseable';
  }
}

export const POST = withAdminErrorHandler(async (request: NextRequest) => {
  const admin = await requirePlatformAdmin();

  const parsed = await parseAdminBody(request, subscribeSchema);
  if (parsed instanceof NextResponse) return parsed;

  const db = createAdminTypedClient();

  // Upsert on `endpoint`, the natural key: re-subscribing from the same browser
  // must replace the row rather than accumulate duplicates that each deliver
  // the same notification. `user_id` is part of the written row, so a device
  // handed to a different operator moves with it.
  const { error } = await db.from('platform_admin_push_subscriptions').upsert(
    {
      user_id: admin.id,
      endpoint: parsed.endpoint,
      p256dh: parsed.keys.p256dh,
      auth: parsed.keys.auth,
      user_agent: request.headers.get('user-agent')?.slice(0, 512) ?? null,
      // A re-subscribe is a fresh, working device: clear the failure count so
      // an old streak does not follow the new registration.
      failure_count: 0,
    },
    { onConflict: 'endpoint' },
  );

  if (error) {
    throw new Error(`Failed to save push subscription: ${error.message}`);
  }

  await logAdminAction({
    admin,
    action: 'push_subscription_added',
    resourceType: 'platform_admin_push_subscriptions',
    metadata: { pushService: endpointOrigin(parsed.endpoint) },
    bestEffort: true,
  });

  return NextResponse.json({ data: { subscribed: true } }, { status: 201 });
});

export const DELETE = withAdminErrorHandler(async (request: NextRequest) => {
  const admin = await requirePlatformAdmin();

  const parsed = await parseAdminBody(request, unsubscribeSchema);
  if (parsed instanceof NextResponse) return parsed;

  const db = createAdminTypedClient();

  const { error } = await db
    .from('platform_admin_push_subscriptions')
    .delete()
    .eq('endpoint', parsed.endpoint)
    // Not redundant with the endpoint filter — see the module docblock.
    .eq('user_id', admin.id);

  if (error) {
    throw new Error(`Failed to remove push subscription: ${error.message}`);
  }

  await logAdminAction({
    admin,
    action: 'push_subscription_removed',
    resourceType: 'platform_admin_push_subscriptions',
    metadata: { pushService: endpointOrigin(parsed.endpoint) },
    bestEffort: true,
  });

  return NextResponse.json({ data: { subscribed: false } });
});
