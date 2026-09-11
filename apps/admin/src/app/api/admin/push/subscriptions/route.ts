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
 * The POST additionally records `displacedUserId` when the registration takes an
 * endpoint off another operator. The upsert is keyed on `endpoint` alone, so
 * that is a thing this route can do; without the field, the trail named only the
 * admin who acted and the operator whose alerts stopped appeared nowhere.
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
 * The four push services a real `pushManager.subscribe()` can return.
 *
 * `https://` alone (the table's CHECK, and the refine below) bounds the SCHEME
 * and not the HOST — and `web-push` POSTs a signed request to whatever string it
 * is handed, from the cron process, every fifteen minutes. That made an
 * authenticated operator able to point the server at any https host. It is blind
 * (no response body is returned or logged) and every actor here is already
 * `super_admin`, so it was never a privilege boundary — but a browser cannot
 * mint anything outside this list, so nothing legitimate is lost by saying so.
 *
 * Adding a service is one line. A rejection is a 400 naming the host, not a
 * silent failure, so a push service we have not met is diagnosable from the
 * response rather than from a subscription that never delivers.
 */
const PUSH_SERVICE_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge, and every other Chromium
  /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/, // Firefox
  /^([a-z0-9-]+\.)*notify\.windows\.com$/, // Windows / WNS
  /^([a-z0-9-]+\.)*push\.apple\.com$/, // Safari, iOS/iPadOS
];

export function isKnownPushService(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  return PUSH_SERVICE_HOSTS.some((pattern) => pattern.test(url.hostname));
}

/**
 * `https://` is asserted here as well as by the table's CHECK constraint.
 * `web-push` POSTs to whatever string it is handed, so the bound is on where we
 * will send — a DB error is a 500, and this is a 400 that says why. The host is
 * bounded too; see `PUSH_SERVICE_HOSTS`.
 */
const endpointSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine((value) => value.startsWith('https://'), {
    message: 'endpoint must be an https:// URL',
  })
  .refine(isKnownPushService, {
    message: 'endpoint must be a known push service',
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

  // Who, if anyone, is about to lose this endpoint.
  //
  // The upsert below is keyed on `endpoint` ALONE, so an operator who knows
  // another's endpoint can re-point that row at themselves and silently end the
  // other operator's alerts. That is deliberate — a device handed to a different
  // operator should move with it — but the audit entry named only the ACTING
  // admin, so the displaced one appeared nowhere in the trail and "why did my
  // alerts stop" was unanswerable. Everyone here is `super_admin`, so this
  // crosses no privilege boundary; it is a record, not a gate.
  //
  // Read BEFORE the write, and never fatal: a failed read costs a field in the
  // metadata, and must not cost the operator their subscription.
  const { data: previous } = await db
    .from('platform_admin_push_subscriptions')
    .select('user_id')
    .eq('endpoint', parsed.endpoint)
    .maybeSingle();
  const previousUserId = (previous as { user_id?: string } | null)?.user_id ?? null;
  const displacedUserId = previousUserId && previousUserId !== admin.id ? previousUserId : null;

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
    metadata: {
      pushService: endpointOrigin(parsed.endpoint),
      // Only present when this registration took the endpoint off someone else.
      ...(displacedUserId ? { displacedUserId } : {}),
    },
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
