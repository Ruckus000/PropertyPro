import { describe, expect, it } from 'vitest';

import {
  KNOWN_UNAPPLIED_MIGRATIONS,
  reconcile,
  type LedgerRow,
  type MigrationFile,
} from '../verify-migration-ledger';

/**
 * Unit tests for the reconciliation behind `pnpm db:ledger:verify`.
 *
 * WHY THIS FILE CARRIES THE WEIGHT. The command itself cannot be tested in CI,
 * and that is a property of the problem, not an omission: a freshly-migrated
 * database is reconciled by construction, because `drizzle-kit migrate` writes
 * the ledger from the very files this compares against. Measured — main had 70
 * journal entries, the disposable local DB had 70 ledger rows, production had
 * 69. So an end-to-end CI run would pass unconditionally, which
 * `.claude/rules/verification.md` rates worse than no check at all.
 *
 * What CI can prove is that the comparison is correct, so `reconcile()` is pure
 * and every condition gets its own case here. Each of the four kinds of drift
 * below actually occurred in this repo within 48 hours in September 2026; none
 * of them is hypothetical.
 *
 * Both directions are pinned deliberately. A suite of positives alone would be
 * satisfied by a function that reports everything, and the "clean" case alone by
 * one that reports nothing.
 */
const file = (tag: string, when: number, sha256: string, idx = 0): MigrationFile => ({
  idx,
  tag,
  when,
  sha256,
});

const FILES: MigrationFile[] = [
  file('0001_alpha', 1000, 'aaa', 1),
  file('0002_beta', 2000, 'bbb', 2),
  file('0003_gamma', 3000, 'ccc', 3),
];

/** Every file applied, each recorded at its own journal `when`. */
const CLEAN: LedgerRow[] = [
  { hash: 'aaa', createdAt: 1000 },
  { hash: 'bbb', createdAt: 2000 },
  { hash: 'ccc', createdAt: 3000 },
];

/** No allowlist, so "expected" never masks a finding unless a case asks for it. */
const NONE: ReadonlyArray<{ tag: string; reason: string }> = [];

describe('a reconciled ledger', () => {
  it('reports nothing when every file is applied at its journal `when`', () => {
    const r = reconcile(FILES, CLEAN, NONE);

    expect(r.orphans).toEqual([]);
    expect(r.unapplied).toEqual([]);
    expect(r.stranded).toEqual([]);
    expect(r.timestampMismatches).toEqual([]);
    expect(r.deadAllowlistEntries).toEqual([]);
    // The population, so a clean result carries evidence of work done.
    expect(r.applied).toEqual(['0001_alpha', '0002_beta', '0003_gamma']);
    expect(r.filesScanned).toBe(3);
    expect(r.ledgerRows).toBe(3);
    expect(r.ledgerTip).toBe(3000);
  });
});

describe('the four kinds of drift', () => {
  it('ORPHAN: a ledger row whose hash matches no file — the #1068 shape', () => {
    // Applied to prod from a branch that never landed.
    const r = reconcile(FILES, [...CLEAN, { hash: 'zzz', createdAt: 4000 }], NONE);

    expect(r.orphans).toEqual([{ hash: 'zzz', createdAt: 4000 }]);
    expect(r.unapplied).toEqual([]);
  });

  it('MISMATCH: created_at disagreeing with the journal `when`', () => {
    // What a renumbered-after-applying migration looks like.
    const rows = CLEAN.map((row) => (row.hash === 'bbb' ? { ...row, createdAt: 1999 } : row));

    const r = reconcile(FILES, rows, NONE);

    expect(r.timestampMismatches).toEqual([
      { tag: '0002_beta', journalWhen: 2000, ledgerCreatedAt: 1999 },
    ]);
    // Still counted as applied — the row exists, it is just recorded wrongly.
    expect(r.applied).toContain('0002_beta');
    expect(r.unapplied).toEqual([]);
  });

  it('UNAPPLIED: a file with no ledger row', () => {
    const r = reconcile(FILES, CLEAN.filter((row) => row.hash !== 'ccc'), NONE);

    expect(r.unapplied.map((f) => f.tag)).toEqual(['0003_gamma']);
    expect(r.orphans).toEqual([]);
  });

  it('STRANDED: unapplied AND below the tip, so the migrator will skip it forever', () => {
    /*
     * The condition that has no other detector. Drizzle applies only when
     * `lastApplied.created_at < folderMillis`, so an unapplied migration below
     * the ledger's max is unreachable — `drizzle-kit migrate` does not error,
     * it does nothing. `0062_secret_ballot` is in exactly this state today.
     */
    const r = reconcile(FILES, CLEAN.filter((row) => row.hash !== 'bbb'), NONE);

    expect(r.unapplied.map((f) => f.tag)).toEqual(['0002_beta']);
    expect(r.stranded.map((f) => f.tag)).toEqual(['0002_beta']);
    expect(r.ledgerTip).toBe(3000);
  });

  it('does NOT call an unapplied migration stranded when it is above the tip', () => {
    // The discriminating half. Without this, "stranded" could just be an alias
    // for "unapplied" and the distinction the warning rests on would be fake.
    const r = reconcile(FILES, CLEAN.filter((row) => row.hash !== 'ccc'), NONE);

    expect(r.unapplied.map((f) => f.tag)).toEqual(['0003_gamma']);
    expect(r.stranded).toEqual([]);
  });
});

describe('the allowlist', () => {
  const ALLOW = [{ tag: '0002_beta', reason: 'held deliberately' }];

  it('moves a known-unapplied migration out of the errors, with its reason', () => {
    const r = reconcile(FILES, CLEAN.filter((row) => row.hash !== 'bbb'), ALLOW);

    expect(r.unapplied).toEqual([]);
    expect(r.expectedUnapplied.map((e) => [e.file.tag, e.reason])).toEqual([
      ['0002_beta', 'held deliberately'],
    ]);
  });

  it('still reports it as STRANDED — being deliberate does not make it reachable', () => {
    // The point of separating the two. Whoever finally ships 0062 needs to know
    // the migrator will silently do nothing, and "we meant to hold it" says
    // nothing about that.
    const r = reconcile(FILES, CLEAN.filter((row) => row.hash !== 'bbb'), ALLOW);

    expect(r.stranded.map((f) => f.tag)).toEqual(['0002_beta']);
  });

  it('reports an entry naming a migration that does not exist', () => {
    // An allowlist that can accumulate dead names stops being a record of
    // decisions — the same reasoning as the dead-entry detection in
    // verify-scoped-db-access.ts and verify-contracts.ts.
    const r = reconcile(FILES, CLEAN, [{ tag: '0099_deleted', reason: 'stale' }]);

    expect(r.deadAllowlistEntries).toEqual(['0099_deleted']);
  });

  it('the real allowlist names only migrations that exist — checked against fixtures', () => {
    // Guards the shipped list itself, not just the mechanism.
    const shipped = KNOWN_UNAPPLIED_MIGRATIONS.map((e) => e.tag);
    expect(shipped).toContain('0062_secret_ballot');
    for (const entry of KNOWN_UNAPPLIED_MIGRATIONS) {
      expect(entry.reason.length).toBeGreaterThan(40);
    }
  });
});

describe('degenerate ledgers', () => {
  it('treats a null created_at as unusable for the tip rather than as zero', () => {
    /*
     * `created_at` is nullable in the real table (verified against prod's
     * information_schema). Coercing null to 0 would drag the tip to 0 and make
     * every unapplied migration look reachable.
     */
    const r = reconcile(FILES, [{ hash: 'aaa', createdAt: null }], NONE);

    expect(r.ledgerTip).toBe(null);
    expect(r.stranded).toEqual([]);
    expect(r.timestampMismatches).toEqual([
      { tag: '0001_alpha', journalWhen: 1000, ledgerCreatedAt: null },
    ]);
  });

  it('reports every file as unapplied when the ledger is empty', () => {
    // The CLI turns this into exit 2 rather than 1 — an empty ledger is a
    // database it cannot speak about, not one with 70 problems — but the pure
    // function still describes it honestly.
    const r = reconcile(FILES, [], NONE);

    expect(r.unapplied).toHaveLength(3);
    expect(r.ledgerTip).toBe(null);
    expect(r.stranded).toEqual([]);
  });
});
