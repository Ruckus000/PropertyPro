/**
 * Audit actor — request-scoped attribution stamped onto every
 * `compliance_audit_log` row.
 *
 * ## Why this exists
 *
 * Under a support (impersonation) session the web middleware sets `x-user-id`
 * to the IMPERSONATED user, so every audit row a route writes during that
 * session names the target as the actor. Nothing recorded that a platform
 * operator was actually driving — `documents/[id]/download` wrote
 * `document_accessed` with `userId = target` and no support marker at all.
 *
 * Threading a "support" flag through every one of the ~35 services that write
 * audit rows would be a change to every call site and would rot the moment a
 * new one is added. Instead the web app's `withErrorHandler` (which wraps every
 * session-authenticated API route) enters this store ONCE per request with the
 * actor derived from the middleware's trusted support headers, and every
 * audit-row writer merges it in via `stampAuditActorMetadata`:
 *
 *   - `logAuditEvent` (packages/db/src/utils/audit-logger.ts)
 *   - the in-transaction direct inserts in apps/web's elections, site-pages,
 *     site-blocks and work-orders services, which cannot use `logAuditEvent`
 *     because they must write on the caller's transaction handle.
 *
 * ## Runtime
 *
 * `node:async_hooks` is Node-only. Nothing on the Edge runtime imports this:
 * the only `runtime = 'edge'` routes are the two `/api/health` probes, which
 * import neither `withErrorHandler` nor `@propertypro/db`, and the middleware
 * imports neither. `@propertypro/db`'s root already requires Node (`postgres`).
 *
 * The store is kept on `globalThis` under a registered symbol so that if a
 * bundler ever instantiates this module twice (the subpath import used by
 * `withErrorHandler` and the relative import used by `audit-logger`), both
 * copies still share ONE store — two stores would silently drop every stamp.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface SupportAuditActor {
  /**
   * `support_sessions.id` of the live session. Null only if the forwarded
   * value was unreadable — the row is still marked as support-driven.
   */
  sessionId: number | null;
  /** `platform_admin_users.user_id` of the operator driving the session. */
  adminUserId: string | null;
}

export interface AuditActor {
  /** Present only while a support (impersonation) session drives the request. */
  support: SupportAuditActor | null;
}

const STORE_KEY = Symbol.for('propertypro.db.auditActorStore');

type GlobalWithStore = typeof globalThis & {
  [STORE_KEY]?: AsyncLocalStorage<AuditActor>;
};

function store(): AsyncLocalStorage<AuditActor> {
  const g = globalThis as GlobalWithStore;
  let existing = g[STORE_KEY];
  if (!existing) {
    existing = new AsyncLocalStorage<AuditActor>();
    g[STORE_KEY] = existing;
  }
  return existing;
}

/**
 * Run `fn` with `actor` as the current audit actor. A null actor runs `fn`
 * directly, so a request that is not a support session is byte-for-byte
 * unchanged (and does not even shadow an enclosing store).
 */
export function runWithAuditActor<T>(actor: AuditActor | null, fn: () => T): T {
  if (actor === null) return fn();
  return store().run(actor, fn);
}

/** The current request's audit actor, or undefined outside any run. */
export function getAuditActor(): AuditActor | undefined {
  return store().getStore();
}

/**
 * Merge the current actor's attribution into an audit row's `metadata`.
 *
 * - No actor / no support session → returns `metadata` UNCHANGED (including
 *   `null` / `undefined`), so rows written outside a support session are
 *   identical to before.
 * - Support session → a NEW object: every existing key preserved, plus
 *   `support: { sessionId, adminUserId }`. The actor's value wins over any
 *   caller-supplied `support` key: it comes from headers the middleware
 *   verified, and a row must not be able to claim a different operator.
 */
export function stampAuditActorMetadata<M extends Record<string, unknown>>(
  metadata: M | null | undefined,
): M | Record<string, unknown> | null | undefined {
  const support = getAuditActor()?.support ?? null;
  if (support === null) return metadata;
  return {
    ...(metadata ?? {}),
    support: { sessionId: support.sessionId, adminUserId: support.adminUserId },
  };
}
