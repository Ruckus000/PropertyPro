import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  ALLOWED_SEED_ENVIRONMENTS,
  SeedSafetyError,
  assertDemoUsersNotAttachedToRealCommunities,
  assertSeedEnvironment,
  logDatabaseTarget,
  resolveDemoCommunityIds,
} from '../../../scripts/lib/seed-safety';

/**
 * Minimal db stub matching the SqlExecutor shape: execute() returns a RowList
 * (postgres-js) and records each query's bound params.
 */
function fakeDb(rows: Array<Record<string, unknown>>) {
  const params: unknown[][] = [];
  return {
    params,
    execute: vi.fn(async (query: Parameters<PgDialect['sqlToQuery']>[0]) => {
      params.push(new PgDialect().sqlToQuery(query).params);
      return rows;
    }),
  };
}

describe('assertSeedEnvironment', () => {
  const originalEnv = process.env.PROPERTYPRO_SEED_ENV;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.PROPERTYPRO_SEED_ENV;
    } else {
      process.env.PROPERTYPRO_SEED_ENV = originalEnv;
    }
  });

  it('throws SeedSafetyError when unset', () => {
    delete process.env.PROPERTYPRO_SEED_ENV;
    expect(() => assertSeedEnvironment()).toThrow(SeedSafetyError);
    try {
      assertSeedEnvironment();
    } catch (err) {
      expect((err as Error).message).toContain('PROPERTYPRO_SEED_ENV');
      expect((err as Error).message).toContain('development | ci | demo-nightly');
      expect((err as Error).message).toContain('(unset)');
    }
  });

  it('throws when value is "production"', () => {
    process.env.PROPERTYPRO_SEED_ENV = 'production';
    expect(() => assertSeedEnvironment()).toThrow(/must be set to one of/);
  });

  it('throws when value is the empty string', () => {
    process.env.PROPERTYPRO_SEED_ENV = '';
    expect(() => assertSeedEnvironment()).toThrow(SeedSafetyError);
  });

  it('throws on typos', () => {
    process.env.PROPERTYPRO_SEED_ENV = 'developmnet';
    expect(() => assertSeedEnvironment()).toThrow(/must be set to one of/);
  });

  for (const allowed of ALLOWED_SEED_ENVIRONMENTS) {
    it(`returns "${allowed}" when set to that value`, () => {
      process.env.PROPERTYPRO_SEED_ENV = allowed;
      expect(assertSeedEnvironment()).toBe(allowed);
    });
  }
});

describe('logDatabaseTarget', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('prints the hostname of a valid URL', () => {
    logDatabaseTarget('postgresql://postgres:secret@db.example.com:5432/propertypro');
    expect(logSpy).toHaveBeenCalledOnce();
    expect(logSpy.mock.calls[0]?.[0]).toContain('db.example.com');
  });

  it('does not leak passwords or query strings', () => {
    logDatabaseTarget('postgresql://postgres:SUPER_SECRET@host.pooler.supabase.com:6543/db?sslmode=require');
    const logged = String(logSpy.mock.calls[0]?.[0] ?? '');
    expect(logged).toContain('host.pooler.supabase.com');
    expect(logged).not.toContain('SUPER_SECRET');
    expect(logged).not.toContain('sslmode');
  });

  it('falls back to placeholder on unparseable input', () => {
    logDatabaseTarget('not-a-url');
    expect(logSpy.mock.calls[0]?.[0]).toContain('(unparseable)');
  });
});

describe('assertDemoUsersNotAttachedToRealCommunities', () => {
  it('passes when no real community references a demo user', async () => {
    const db = fakeDb([]);
    await expect(
      assertDemoUsersNotAttachedToRealCommunities(db, ['pm.admin@sunset.local']),
    ).resolves.toBeUndefined();
  });

  it('asks about exactly the demo emails it was given, lower-cased', async () => {
    const db = fakeDb([]);
    await assertDemoUsersNotAttachedToRealCommunities(db, ['PM.Admin@Sunset.local', 'owner.one@sunset.local']);
    expect(db.params[0]).toEqual(
      expect.arrayContaining(['pm.admin@sunset.local', 'owner.one@sunset.local']),
    );
  });

  it('refuses, naming each real community and the demo user attached to it', async () => {
    const db = fakeDb([
      { id: 2360, slug: 'quantum-lake-villas', email: 'pm.admin@sunset.local' },
    ]);
    await expect(
      assertDemoUsersNotAttachedToRealCommunities(db, ['pm.admin@sunset.local']),
    ).rejects.toThrow(SeedSafetyError);
    await expect(
      assertDemoUsersNotAttachedToRealCommunities(db, ['pm.admin@sunset.local']),
    ).rejects.toThrow('quantum-lake-villas (id=2360) via pm.admin@sunset.local');
  });

  it('refuses to run with no demo emails, rather than checking nothing', async () => {
    const db = fakeDb([]);
    await expect(assertDemoUsersNotAttachedToRealCommunities(db, [])).rejects.toThrow(SeedSafetyError);
    expect(db.execute).not.toHaveBeenCalled();
  });
});

describe('resolveDemoCommunityIds', () => {
  it('returns the ids the query yields, as numbers', async () => {
    const db = fakeDb([{ id: '1' }, { id: 3 }]);
    expect(await resolveDemoCommunityIds(db, ['sunset-condos', 'sunset-ridge-apartments'])).toEqual([1, 3]);
    expect(db.params[0]).toEqual(expect.arrayContaining(['sunset-condos', 'sunset-ridge-apartments']));
  });

  it('issues no query for an empty slug list', async () => {
    const db = fakeDb([]);
    expect(await resolveDemoCommunityIds(db, [])).toEqual([]);
    expect(db.execute).not.toHaveBeenCalled();
  });
});
