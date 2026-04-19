import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALLOWED_SEED_ENVIRONMENTS,
  SeedSafetyError,
  assertSeedEnvironment,
  logDatabaseTarget,
} from '../../../scripts/lib/seed-safety';

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
