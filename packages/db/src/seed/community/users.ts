/** Seeded users: public.users upsert, Supabase auth user sync, and the public/auth id reconcile (the approved compliance_audit_log trigger override — scripts/verify-audit-log-trigger-overrides.ts). */
import { randomUUID } from 'node:crypto';
import { eq, sql } from '../../filters';
import { users } from '../../schema';
import { createAdminClient } from '../../supabase/admin';
import { db, debugSeed, extractRows } from './context';

const AUDIT_LOG_MAINTENANCE_LOCK_NAMESPACE = 817;
const AUDIT_LOG_MAINTENANCE_LOCK_KEY = 1;

export function getDefaultPassword(): string {
  const pw = process.env.DEMO_DEFAULT_PASSWORD;
  if (!pw) {
    throw new Error(
      'DEMO_DEFAULT_PASSWORD environment variable must be set to run the seed script.',
    );
  }
  return pw;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(label: string, value: string): void {
  if (!UUID_RE.test(value)) {
    throw new Error(`${label} is not a valid UUID: ${value}`);
  }
}

function assertSqlIdentifier(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return `"${name.replace(/"/g, '""')}"`;
}

async function rekeyAllForeignKeysToPublicUsers(
  tx: Pick<typeof db, 'execute'>,
  oldPublicUserId: string,
  authUserId: string,
): Promise<void> {
  const fkRows = await tx.execute(sql`
    SELECT tc.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_schema = 'public'
      AND ccu.table_name = 'users'
      AND ccu.column_name = 'id'
  `);

  // postgres-js returns a RowList (array); node-pg shape uses { rows: [] }
  const raw = fkRows as unknown;
  const rows: Array<{ table_name: string; column_name: string }> = Array.isArray(raw)
    ? (raw as Array<{ table_name: string; column_name: string }>)
    : ((raw as { rows?: Array<{ table_name: string; column_name: string }> }).rows ?? []);

  for (const row of rows) {
    if (row.table_name === 'compliance_audit_log') {
      continue;
    }
    // Table and column names are validated identifiers; the uuid values are
    // passed through driver parameter binding so they cannot inject SQL even
    // if assertUuid were bypassed.
    const table = assertSqlIdentifier(row.table_name);
    const column = assertSqlIdentifier(row.column_name);
    await tx.execute(
      sql`UPDATE ${sql.raw(table)} SET ${sql.raw(column)} = ${authUserId}::uuid WHERE ${sql.raw(column)} = ${oldPublicUserId}::uuid`,
    );
  }

  // Briefly disable the append-only guard trigger to move audit rows to the
  // new user id. Wrapped in the same transaction as the caller, so a failure
  // rolls the DDL back and the trigger is always re-enabled before commit.
  await tx.execute(
    sql`ALTER TABLE compliance_audit_log DISABLE TRIGGER compliance_audit_log_append_only_guard`,
  );
  await tx.execute(
    sql`UPDATE compliance_audit_log SET user_id = ${authUserId}::uuid WHERE user_id = ${oldPublicUserId}::uuid`,
  );
  await tx.execute(
    sql`ALTER TABLE compliance_audit_log ENABLE TRIGGER compliance_audit_log_append_only_guard`,
  );
}

export interface ReconcilePublicUserProfile {
  email: string;
  fullName: string;
  phone?: string | null;
}

/**
 * Seed/demo-only helper run with service-role privileges during reconcile flows.
 * Concurrent Promise.all callers serialize at the ACCESS EXCLUSIVE DDL on
 * compliance_audit_log when the append-only guard trigger is disabled/enabled.
 * A self-referencing FK on public.users would need bespoke handling because the
 * current FK scan would silently skip carrying that relationship onto the
 * replacement row; none exist today.
 *
 * Re-keys every FK to public.users from a stale UUID to the Supabase auth user id.
 * public.users.id must match auth.users.id so sessions resolve user_roles.
 */
export async function reconcilePublicUserIdWithAuthId(
  oldPublicUserId: string,
  authUserId: string,
  profile: ReconcilePublicUserProfile,
): Promise<void> {
  assertUuid('oldPublicUserId', oldPublicUserId);
  assertUuid('authUserId', authUserId);

  if (oldPublicUserId === authUserId) {
    return;
  }

  await db.transaction(async (tx) => {
    // The audit-log trigger is database-wide. Serialize this exceptional,
    // seed-only mutation with other approved maintenance paths.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${AUDIT_LOG_MAINTENANCE_LOCK_NAMESPACE}, ${AUDIT_LOG_MAINTENANCE_LOCK_KEY})`,
    );
    const oldRow = await tx.select().from(users).where(eq(users.id, oldPublicUserId)).limit(1);
    if (!oldRow[0]) {
      throw new Error(`reconcilePublicUserIdWithAuthId: no public.users row for ${oldPublicUserId}`);
    }

    const authRow = await tx.select().from(users).where(eq(users.id, authUserId)).limit(1);

    if (authRow[0]) {
      await tx
        .update(users)
        .set({
          fullName: profile.fullName,
          phone: profile.phone ?? undefined,
          updatedAt: new Date(),
        })
        .where(eq(users.id, authUserId));

      await rekeyAllForeignKeysToPublicUsers(tx, oldPublicUserId, authUserId);
      await tx.delete(users).where(eq(users.id, oldPublicUserId));
      return;
    }

    const orphanEmail = `orphan+${oldPublicUserId}@seed.propertypro.invalid`;
    await tx
      .update(users)
      .set({ email: orphanEmail, updatedAt: new Date() })
      .where(eq(users.id, oldPublicUserId));

    const o = oldRow[0];
    await tx.insert(users).values({
      id: authUserId,
      email: profile.email.toLowerCase(),
      fullName: profile.fullName,
      phone: profile.phone ?? o.phone,
      phoneVerifiedAt: o.phoneVerifiedAt,
      avatarUrl: o.avatarUrl,
      otpLastSentAt: o.otpLastSentAt,
      otpFailedAttempts: o.otpFailedAttempts,
      otpLockedUntil: o.otpLockedUntil,
      createdAt: o.createdAt,
      updatedAt: new Date(),
      deletedAt: o.deletedAt,
    });

    await rekeyAllForeignKeysToPublicUsers(tx, oldPublicUserId, authUserId);
    await tx.delete(users).where(eq(users.id, oldPublicUserId));
  });
}

export async function ensureUser(
  email: string,
  fullName: string,
  phone?: string,
  preferredId?: string,
): Promise<string> {
  const normalizedEmail = email.toLowerCase();
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (existing[0]) {
    let effectiveId = existing[0].id;

    if (preferredId && existing[0].id !== preferredId) {
      debugSeed(
        `reconciling public.users.id ${existing[0].id} -> Supabase auth id ${preferredId} for ${normalizedEmail}`,
      );
      await reconcilePublicUserIdWithAuthId(existing[0].id, preferredId, {
        email: normalizedEmail,
        fullName,
        phone: phone ?? existing[0].phone,
      });
      effectiveId = preferredId;
    }

    await db
      .update(users)
      .set({
        fullName,
        phone,
        updatedAt: new Date(),
      })
      .where(eq(users.id, effectiveId));
    return effectiveId;
  }

  const userId = preferredId ?? randomUUID();
  await db.insert(users).values({
    id: userId,
    email: normalizedEmail,
    fullName,
    phone,
  });
  return userId;
}

interface ExistingAuthUser {
  id: string;
  userMetadata: Record<string, unknown>;
}

export async function ensureAuthUser(
  email: string,
  fullName: string,
  password: string,
): Promise<string | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return null;
  }

  const admin = createAdminClient();
  const createResult = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (!createResult.error) {
    return createResult.data.user.id;
  }

  const message = createResult.error.message.toLowerCase();
  const duplicate = message.includes('already') || message.includes('exists');
  if (!duplicate) {
    throw createResult.error;
  }

  const existingAuthUser = await findExistingAuthUserByEmail(email);
  if (existingAuthUser) {
    await admin.auth.admin.updateUserById(existingAuthUser.id, {
      password,
      user_metadata: { ...existingAuthUser.userMetadata, full_name: fullName },
    });
    return existingAuthUser.id;
  }

  return null;
}

export async function ensureLocalAuthUserMirror(
  userId: string,
  email: string,
  fullName: string,
): Promise<void> {
  const existing = await db.execute<{ id: string }>(sql`
    select id
    from auth.users
    where id = ${userId}::uuid
    limit 1
  `);
  const rows = extractRows<{ id: string }>(existing);
  if (rows[0]) {
    return;
  }

  await db.execute(sql`
    insert into auth.users (id, email, raw_user_meta_data)
    values (
      ${userId}::uuid,
      ${email.toLowerCase()},
      ${JSON.stringify({ full_name: fullName })}::jsonb
    )
    on conflict (id) do update
    set email = excluded.email,
        raw_user_meta_data = excluded.raw_user_meta_data
  `);
}

export async function findExistingAuthUserByEmail(email: string): Promise<ExistingAuthUser | null> {
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
