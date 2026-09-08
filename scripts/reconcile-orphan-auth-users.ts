/**
 * READ-ONLY audit: Supabase auth accounts with no application user (#947 part 2).
 *
 * ## What went wrong
 *
 * Before #946, approving an access request could create a Supabase auth user and
 * then fail on a later insert, leaving a **loginable** auth account with no
 * `public.users` row behind it. #946 fixed the cause; the accounts already
 * stranded in production are still there.
 *
 * Each one holds its email address, and `createAuthUserBoundTo` fails for an
 * address that already exists — so the corresponding access request stays
 * wedged forever, and re-approving it cannot succeed. That is the user-visible
 * symptom: "I was approved and I still cannot get in."
 *
 * ## What this script does, and does NOT do
 *
 * It REPORTS. It does not delete, disable, or modify anything, and it must stay
 * that way. Issue #947 requires each row to be confirmed as a genuine orphan
 * rather than a legitimately pre-provisioned identity before deletion, and that
 * is a judgement per row, not a predicate. A destructive prod script that nobody
 * has dry-run is how the earlier false "clean" report became dangerous.
 *
 * For each orphan it prints the auth id, email, creation time, whether the
 * account has ever signed in, and any access request sitting in `pending` (or
 * `pending_verification`) for that address — which is the evidence that tells
 * you the row is wedged rather than merely unused.
 *
 * ## Running it
 *
 *   scripts/with-env-local.sh pnpm exec tsx scripts/reconcile-orphan-auth-users.ts
 *
 * `.env.local`'s `DATABASE_URL` points at PRODUCTION. That is intended here —
 * this is an audit OF production — and it is safe because every statement below
 * is a SELECT. Do not add a write path to this file; put it in its own script
 * with its own review, and follow the data-repair CTE convention in
 * `.claude/rules/migration-safety.md` so the change lands with an audit row.
 *
 * ## The trap this script is written around
 *
 * `db.execute()` with postgres.js resolves to an ARRAY, not `{ rows }`. Reading
 * `.rows` yields `undefined`, which reads as "no orphans" — and that is exactly
 * how an earlier report came back clean while a loginable account sat in
 * production (#947). Every result here goes through `extractRows`, which
 * handles both shapes.
 */
// Read-only by design: every statement below is a SELECT. See the docblock.
// AUTHZ: CLI/ops audit script — cross-tenant read with explicit operator authorization, out-of-band of tenant scoping.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { sql } from '@propertypro/db/filters';
import { runOpsScript } from './lib/run-ops-script';
import { extractRows } from './lib/extract-rows';

interface OrphanRow {
  id: string;
  email: string | null;
  created_at: string | Date | null;
  last_sign_in_at: string | Date | null;
  role_count: string | number;
}

interface WedgedRequestRow {
  email: string;
  community_id: number;
  status: string;
  created_at: string | Date | null;
}

function formatStamp(value: string | Date | null): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

async function run(): Promise<void> {
  const db = createUnscopedClient();

  // An orphan is an auth identity with no application user. `user_roles` is
  // counted rather than joined-on so a row with roles but no `users` record —
  // a different and more alarming corruption — still shows up, flagged.
  const orphans = extractRows<OrphanRow>(
    await db.execute(sql`
      SELECT
        au.id::text                                              AS id,
        au.email                                                 AS email,
        au.created_at                                            AS created_at,
        au.last_sign_in_at                                       AS last_sign_in_at,
        (SELECT count(*) FROM public.user_roles ur WHERE ur.user_id = au.id) AS role_count
      FROM auth.users au
      LEFT JOIN public.users pu ON pu.id = au.id
      WHERE pu.id IS NULL
      ORDER BY au.created_at
    `),
  );

  // Print the denominator even when it is zero. A scan that reports "0 orphans"
  // and a scan that never ran look identical otherwise — which is the failure
  // this whole script exists because of.
  const totalAuthUsers = extractRows<{ count: string | number }>(
    await db.execute(sql`SELECT count(*) AS count FROM auth.users`),
  );
  const denominator = totalAuthUsers[0]?.count ?? 'unknown';

  // eslint-disable-next-line no-console
  console.log(
    `\nScanned ${denominator} auth.users row(s). Found ${orphans.length} with no public.users row.\n`,
  );

  if (orphans.length === 0) {
    // eslint-disable-next-line no-console
    console.log('No orphans. Nothing to reconcile.\n');
    return;
  }

  const emails = orphans.map((o) => o.email).filter((e): e is string => Boolean(e));

  // Access requests still waiting on an address an orphan is holding. This is
  // the "wedged" evidence: the request cannot be re-approved while the auth
  // account exists, because createAuthUserBoundTo will keep failing.
  const wedged =
    emails.length === 0
      ? []
      : extractRows<WedgedRequestRow>(
          await db.execute(sql`
            SELECT lower(ar.email) AS email, ar.community_id, ar.status, ar.created_at
            FROM public.access_requests ar
            WHERE lower(ar.email) = ANY(${emails.map((e) => e.toLowerCase())})
              AND ar.status IN ('pending', 'pending_verification')
            ORDER BY ar.created_at
          `),
        );

  const wedgedByEmail = new Map<string, WedgedRequestRow[]>();
  for (const row of wedged) {
    const key = row.email.toLowerCase();
    wedgedByEmail.set(key, [...(wedgedByEmail.get(key) ?? []), row]);
  }

  for (const orphan of orphans) {
    const key = orphan.email?.toLowerCase() ?? '';
    const requests = wedgedByEmail.get(key) ?? [];
    const roleCount = Number(orphan.role_count);

    // eslint-disable-next-line no-console
    console.log(`auth.users ${orphan.id}`);
    // eslint-disable-next-line no-console
    console.log(`  email          ${orphan.email ?? '(none)'}`);
    // eslint-disable-next-line no-console
    console.log(`  created        ${formatStamp(orphan.created_at)}`);
    // eslint-disable-next-line no-console
    console.log(
      `  last sign-in   ${formatStamp(orphan.last_sign_in_at)}` +
        (orphan.last_sign_in_at ? '   <-- HAS SIGNED IN, investigate before deleting' : ''),
    );
    if (roleCount > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `  user_roles     ${roleCount}   <-- roles WITHOUT a users row; not a simple orphan`,
      );
    }
    // eslint-disable-next-line no-console
    console.log(
      requests.length === 0
        ? '  access request (none pending — may be unused rather than wedged)'
        : requests
            .map(
              (r) =>
                `  access request community ${r.community_id}, ${r.status}, ${formatStamp(r.created_at)}`,
            )
            .join('\n'),
    );
    // eslint-disable-next-line no-console
    console.log('');
  }

  // eslint-disable-next-line no-console
  console.log(
    'This script does not delete anything. Confirm each row is a genuine orphan\n' +
      'rather than a pre-provisioned identity before removing it, and record the\n' +
      'removal per the data-repair convention in .claude/rules/migration-safety.md.\n',
  );
}

void runOpsScript({ name: 'reconcile-orphan-auth-users', url: import.meta.url, run });
