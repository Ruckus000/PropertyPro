import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static guards on migration 0079 (user_roles / communities policies match
 * ADR-006).
 *
 * rls-policies.integration.test.ts proves the behaviour on a live database, but
 * it is skipped in the unit job, and for the communities column grant the test
 * database has a second author (local-supabase-post-migrate.sql re-applies it),
 * so a grant deleted from the migration would stay green there while
 * production kept table-level SELECT. This file reads the migration itself.
 */

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

function normalize(sql: string): string {
  return stripComments(sql).replace(/\s+/g, ' ');
}

const MIGRATION = normalize(
  readFileSync(
    path.resolve(__dirname, '../migrations/0079_tighten_user_roles_communities_policies.sql'),
    'utf8',
  ),
);

const POST_MIGRATE_RAW = readFileSync(
  path.resolve(__dirname, '../../../scripts/sql/local-supabase-post-migrate.sql'),
  'utf8',
);
const MARKER = 'Migration 0079: communities is readable by authenticated COLUMN BY COLUMN.';
const POST_MIGRATE_0079 = normalize(POST_MIGRATE_RAW.slice(POST_MIGRATE_RAW.indexOf(MARKER)));

function grantedColumns(sql: string): string[] {
  const body = /GRANT SELECT \((.*?)\) ON TABLE public\.communities TO authenticated;/.exec(sql)?.[1] ?? '';
  return body
    .split(',')
    .map((column) => column.trim())
    .filter(Boolean);
}

function policy(name: string): string {
  return new RegExp(`CREATE POLICY "${name}" ON public\\."user_roles"[^;]*;`).exec(MIGRATION)?.[0] ?? '';
}

/** Never readable by a member, and never writable except by the application. */
const BILLING_SECRETS = [
  'stripe_customer_id',
  'stripe_subscription_id',
  'billing_group_id',
  'cancellation_reason',
  'cancellation_note',
  'cancellation_captured_at',
  'payment_failed_at',
  'next_reminder_at',
  'subscription_canceled_at',
  'subscription_current_period_end_at',
  'free_access_expires_at',
];

describe('migration 0079 — user_roles / communities policies match ADR-006', () => {
  it('strips comments without emptying the migration', () => {
    expect(MIGRATION).toContain('CREATE POLICY');
    expect(MIGRATION.length).toBeGreaterThan(2000);
  });

  describe('user_roles writes', () => {
    it.each(['pp_user_roles_insert', 'pp_user_roles_update', 'pp_user_roles_delete'])(
      '%s admits the root manager, and the rest of the admin tier only on resident rows',
      (name) => {
        const sql = policy(name);
        expect(sql).not.toBe('');
        expect(sql).toContain('pp_rls_is_root_manager(community_id)');
        expect(sql).toContain("(pp_rls_can_read_audit_log(community_id) AND role = 'resident')");
      },
    );

    it('UPDATE constrains the NEW row too, so a resident cannot be turned into a manager', () => {
      const sql = policy('pp_user_roles_update');
      const withCheck = sql.slice(sql.indexOf('WITH CHECK'));
      expect(withCheck).toContain("role = 'resident'");
    });

    it('never admits the admin tier without the resident-row restriction', () => {
      // Every occurrence of the admin-tier predicate in a write policy must be
      // ANDed with role = 'resident'. A bare occurrence anywhere (standalone, or
      // OR-ed next to the root check) is the pre-0079 hole.
      for (const name of ['pp_user_roles_insert', 'pp_user_roles_update', 'pp_user_roles_delete']) {
        const sql = policy(name);
        const occurrences = sql.match(/pp_rls_can_read_audit_log\(community_id\)/g) ?? [];
        const restricted = sql.match(/pp_rls_can_read_audit_log\(community_id\) AND role = 'resident'/g) ?? [];
        expect(occurrences.length, name).toBeGreaterThan(0);
        expect(restricted.length, name).toBe(occurrences.length);
      }
    });

    it('guards designation with a trigger that only the root manager passes', () => {
      expect(MIGRATION).toContain(
        'CREATE TRIGGER pp_user_roles_guard_designation BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles',
      );
      expect(MIGRATION).toContain('IF pp_rls_is_root_manager(NEW.community_id) THEN RETURN NEW;');
      expect(MIGRATION).toContain('NEW.designation IS DISTINCT FROM OLD.designation');
    });

    it('stops a non-root writer moving a role row (and its board seat) to someone else', () => {
      expect(MIGRATION).toContain('NEW.user_id IS DISTINCT FROM OLD.user_id');
      expect(MIGRATION).toContain('NEW.community_id IS DISTINCT FROM OLD.community_id');
    });

    it('stops a non-root writer deleting a board-designated row', () => {
      expect(MIGRATION).toContain(
        'IF OLD.designation IS NOT NULL AND NOT pp_rls_is_root_manager(OLD.community_id) THEN',
      );
    });

    it('defines pp_rls_is_root_manager as SECURITY DEFINER with a pinned search_path', () => {
      expect(MIGRATION).toMatch(
        /FUNCTION public\.pp_rls_is_root_manager\(target_community_id bigint\) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO/,
      );
      expect(MIGRATION).toContain("ur.role = 'root_manager'");
    });
  });

  describe('pp_rls_effective_role', () => {
    it('reads the JSON claims PostgREST v12 sends, after the legacy GUC, before session_user', () => {
      const fn = /FUNCTION public\.pp_rls_effective_role\(\).*?\$function\$;/.exec(MIGRATION)?.[0] ?? '';
      const legacy = fn.indexOf("current_setting('request.jwt.claim.role', true)");
      const json = fn.indexOf("current_setting('request.jwt.claims', true)");
      const session = fn.indexOf('session_user');
      expect(legacy).toBeGreaterThan(-1);
      expect(json).toBeGreaterThan(legacy);
      expect(session).toBeGreaterThan(json);
      expect(fn).toContain("->> 'role'");
    });
  });

  describe('communities', () => {
    it('guards billing, lifecycle and identity columns against every non-privileged UPDATE', () => {
      expect(MIGRATION).toContain(
        'CREATE TRIGGER pp_communities_guard_protected_columns BEFORE UPDATE ON public.communities',
      );
      expect(MIGRATION).toContain('IF pp_rls_is_privileged() THEN RETURN NEW;');
      const guarded = /FOREACH col IN ARRAY ARRAY\[(.*?)\]/.exec(MIGRATION)?.[1] ?? '';
      for (const column of [
        ...BILLING_SECRETS.filter((c) => c !== 'free_access_expires_at'),
        'free_access_expires_at',
        'subscription_plan',
        'subscription_status',
        'is_demo',
        'deleted_at',
        'slug',
        'community_type',
        'custom_domain',
      ]) {
        expect(guarded, column).toContain(`'${column}'`);
      }
    });

    it('guards the e-voting attorney-review key inside community_settings', () => {
      expect(MIGRATION).toContain("(new_row -> 'community_settings' -> 'electionsAttorneyReviewed')");
    });

    it('replaces table-level SELECT with a column grant', () => {
      expect(MIGRATION).toContain('REVOKE SELECT ON TABLE public.communities FROM anon, authenticated;');
      expect(grantedColumns(MIGRATION).length).toBeGreaterThan(30);
    });

    it.each(BILLING_SECRETS)('does not grant %s to authenticated', (column) => {
      expect(grantedColumns(MIGRATION)).not.toContain(column);
    });

    it('grants nothing to anon', () => {
      expect(MIGRATION).not.toMatch(/\bGRANT\b[^;]*\bTO\b[^;]*\banon\b/i);
    });
  });

  describe('the local/CI post-migrate backstop mirrors the communities grant', () => {
    it('has a 0079 block', () => {
      expect(POST_MIGRATE_RAW.indexOf(MARKER)).toBeGreaterThan(-1);
      expect(POST_MIGRATE_0079).toContain('REVOKE SELECT ON TABLE public.communities FROM anon, authenticated;');
    });

    it('grants exactly the same columns', () => {
      expect(grantedColumns(POST_MIGRATE_0079)).toEqual(grantedColumns(MIGRATION));
    });
  });
});
