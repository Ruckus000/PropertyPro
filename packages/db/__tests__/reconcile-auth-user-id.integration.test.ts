/**
 * Integration tests for reconcilePublicUserIdWithAuthId.
 *
 * Exercises the helper against a real Postgres (DATABASE_URL) because it
 * rewrites FK data across every tenant table referencing public.users.id
 * and transiently disables the compliance_audit_log append-only guard.
 *
 * Skipped when DATABASE_URL is not set.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '../src/schema';
import {
  announcements,
  communities,
  complianceAuditLog,
  users,
} from '../src/schema';
import { reconcilePublicUserIdWithAuthId } from '../src/seed/seed-community';

const describeDb = process.env.DATABASE_URL ? describe.sequential : describe.skip;

describeDb('reconcilePublicUserIdWithAuthId (integration)', () => {
  const auditLogMaintenanceLockNamespace = 817;
  const auditLogMaintenanceLockKey = 1;
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  const runTag = `reconcile-${Date.now()}-${randomUUID().slice(0, 6)}`;
  let communityId: number;

  const createdUserIds = new Set<string>();
  const createdAnnouncementIds: number[] = [];
  const createdAuditLogIds: number[] = [];

  function trackUser(id: string): string {
    createdUserIds.add(id);
    return id;
  }

  function emailFor(label: string): string {
    return `${label}.${runTag}@seed.propertypro.invalid`;
  }

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 2 });
    db = drizzle(sql, { schema });

    const [community] = await db
      .insert(communities)
      .values({
        name: `Reconcile Test ${runTag}`,
        slug: `reconcile-test-${runTag}`,
        communityType: 'condo_718',
        timezone: 'America/New_York',
      })
      .returning({ id: communities.id });
    if (!community) throw new Error('failed to create test community');
    communityId = community.id;
  });

  afterAll(async () => {
    try {
      // The trigger is database-wide; keep every privileged cleanup statement
      // in one transaction and the shared advisory-lock namespace.
      await sql.begin(async (tx) => {
        const txDb = drizzle(tx, { schema });
        await tx`SELECT pg_advisory_xact_lock(${auditLogMaintenanceLockNamespace}, ${auditLogMaintenanceLockKey})`;
        if (createdAuditLogIds.length > 0) {
          await tx.unsafe(
            'alter table compliance_audit_log disable trigger compliance_audit_log_append_only_guard',
          );
          await txDb
            .delete(complianceAuditLog)
            .where(inArray(complianceAuditLog.id, createdAuditLogIds));
        }
        if (createdAnnouncementIds.length > 0) {
          await txDb.delete(announcements).where(inArray(announcements.id, createdAnnouncementIds));
        }
        for (const id of createdUserIds) {
          await txDb.delete(users).where(eq(users.id, id)).catch(() => undefined);
        }
        if (communityId) {
          await txDb.delete(communities).where(eq(communities.id, communityId));
        }
        if (createdAuditLogIds.length > 0) {
          await tx.unsafe(
            'alter table compliance_audit_log enable trigger compliance_audit_log_append_only_guard',
          );
        }
      });
    } finally {
      await sql.end();
    }
  });

  it('rejects non-UUID values via assertUuid before touching the DB', async () => {
    await expect(
      reconcilePublicUserIdWithAuthId('not-a-uuid', randomUUID(), {
        email: emailFor('guard-old'),
        fullName: 'Guard Test',
      }),
    ).rejects.toThrow(/not a valid UUID/);

    await expect(
      reconcilePublicUserIdWithAuthId(randomUUID(), "1; drop table users;--", {
        email: emailFor('guard-auth'),
        fullName: 'Guard Test',
      }),
    ).rejects.toThrow(/not a valid UUID/);
  });

  it('returns early with no DB mutation when old and auth ids match', async () => {
    const sameId = randomUUID();
    // The helper returns before any SELECT, so the non-existent user id is fine.
    await expect(
      reconcilePublicUserIdWithAuthId(sameId, sameId, {
        email: emailFor('noop'),
        fullName: 'Noop Test',
      }),
    ).resolves.toBeUndefined();
  });

  it('orphan branch: inserts new row at authId, rewrites FKs, deletes stale row', async () => {
    const oldId = trackUser(randomUUID());
    const authId = trackUser(randomUUID());
    const email = emailFor('orphan');

    // Seed only the stale public.users row. No row exists yet at authId.
    await db.insert(users).values({
      id: oldId,
      email,
      fullName: 'Orphan Old Name',
      phone: '+15551110001',
    });

    // Create an FK referrer so we can assert rekey happened.
    const [ann] = await db
      .insert(announcements)
      .values({
        communityId,
        title: 'Orphan rekey test',
        body: '<p>test</p>',
        publishedBy: oldId,
      })
      .returning({ id: announcements.id });
    createdAnnouncementIds.push(ann!.id);

    // And an audit row so we exercise the append-only guard path.
    const [audit] = await db
      .insert(complianceAuditLog)
      .values({
        userId: oldId,
        communityId,
        action: 'create',
        resourceType: 'document',
        resourceId: `reconcile-${runTag}-orphan`,
      })
      .returning({ id: complianceAuditLog.id });
    createdAuditLogIds.push(audit!.id);

    await reconcilePublicUserIdWithAuthId(oldId, authId, {
      email,
      fullName: 'Orphan New Name',
      phone: '+15551110002',
    });

    // Stale row gone.
    const oldRow = await db.select().from(users).where(eq(users.id, oldId));
    expect(oldRow).toHaveLength(0);

    // New row exists at authId with the updated profile.
    const newRow = await db.select().from(users).where(eq(users.id, authId));
    expect(newRow).toHaveLength(1);
    expect(newRow[0]?.email).toBe(email);
    expect(newRow[0]?.fullName).toBe('Orphan New Name');
    expect(newRow[0]?.phone).toBe('+15551110002');

    // FK on announcements points at authId.
    const annAfter = await db.select().from(announcements).where(eq(announcements.id, ann!.id));
    expect(annAfter[0]?.publishedBy).toBe(authId);

    // FK on compliance_audit_log points at authId (even though it's append-only).
    const auditAfter = await db
      .select()
      .from(complianceAuditLog)
      .where(eq(complianceAuditLog.id, audit!.id));
    expect(auditAfter[0]?.userId).toBe(authId);
  });

  it('merge branch: deletes stale row, updates existing auth row, rewrites FKs', async () => {
    const oldId = trackUser(randomUUID());
    const authId = trackUser(randomUUID());
    const staleEmail = emailFor('merge-stale');
    const authEmail = emailFor('merge-auth');

    // Two separate rows: stale (with FKs) and the real auth row (initially profile-less).
    await db.insert(users).values([
      { id: oldId, email: staleEmail, fullName: 'Stale Name', phone: '+15552220001' },
      { id: authId, email: authEmail, fullName: 'Placeholder', phone: null },
    ]);

    const [ann] = await db
      .insert(announcements)
      .values({
        communityId,
        title: 'Merge rekey test',
        body: '<p>test</p>',
        publishedBy: oldId,
      })
      .returning({ id: announcements.id });
    createdAnnouncementIds.push(ann!.id);

    await reconcilePublicUserIdWithAuthId(oldId, authId, {
      email: authEmail,
      fullName: 'Merge Final Name',
      phone: '+15552220002',
    });

    // Stale row gone.
    const staleAfter = await db.select().from(users).where(eq(users.id, oldId));
    expect(staleAfter).toHaveLength(0);

    // Auth row kept, profile fields updated to the passed profile.
    const authAfter = await db.select().from(users).where(eq(users.id, authId));
    expect(authAfter).toHaveLength(1);
    expect(authAfter[0]?.email).toBe(authEmail);
    expect(authAfter[0]?.fullName).toBe('Merge Final Name');
    expect(authAfter[0]?.phone).toBe('+15552220002');

    // FK followed the rekey.
    const annAfter = await db.select().from(announcements).where(eq(announcements.id, ann!.id));
    expect(annAfter[0]?.publishedBy).toBe(authId);
  });

  it('leaves compliance_audit_log append-only guard enabled after reconcile', async () => {
    const oldId = trackUser(randomUUID());
    const authId = trackUser(randomUUID());
    const email = emailFor('trigger-check');

    await db.insert(users).values({ id: oldId, email, fullName: 'Trigger Test' });

    const [audit] = await db
      .insert(complianceAuditLog)
      .values({
        userId: oldId,
        communityId,
        action: 'create',
        resourceType: 'document',
        resourceId: `reconcile-${runTag}-trigger-check`,
      })
      .returning({ id: complianceAuditLog.id });
    createdAuditLogIds.push(audit!.id);

    await reconcilePublicUserIdWithAuthId(oldId, authId, {
      email,
      fullName: 'Trigger Test',
    });

    // A direct UPDATE must still be rejected by the append-only trigger.
    await expect(
      sql.unsafe(
        `update compliance_audit_log set action = 'tamper' where id = $1`,
        [audit!.id],
      ),
    ).rejects.toThrow(/append-only/i);
  });
});
