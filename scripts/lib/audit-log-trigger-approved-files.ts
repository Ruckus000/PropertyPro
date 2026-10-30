/**
 * Repo-relative files allowed to toggle `compliance_audit_log`'s append-only
 * trigger. Read by `verify-audit-log-trigger-overrides.ts` and by its test,
 * which must plant these in every fixture tree.
 */
export const AUDIT_LOG_TRIGGER_APPROVED_FILES = [
  'apps/web/__tests__/integration/helpers/multi-tenant-test-kit.ts',
  'apps/web/__tests__/elections/vote-integration.test.ts',
  'packages/db/__tests__/reconcile-auth-user-id.integration.test.ts',
  'packages/db/src/seed/community/users.ts',
] as const;
