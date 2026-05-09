/**
 * A3 Third Boundary Guard — Route → Table Import Restriction (ADR-003 Phase 1)
 *
 * Enforces the routes-layer half of ADR-003: API route handlers under
 * `apps/web/src/app/api/**\/route.ts` may import from `@propertypro/db`,
 * but only the canonical helpers below. Direct table or schema-enum
 * value-imports must go through a service wrapper under
 * `@/lib/services/...`.
 *
 * Why: routes that import tables directly bypass:
 *   - Service-layer abstraction (test seams, behavior-naming, audit hooks)
 *   - Centralized read-visibility / role-aware filtering
 *   - The boundary that lets the schema evolve independently of route code
 *
 * Existing violators: 89 files, grandfathered via
 * KNOWN_DIRECT_TABLE_IMPORT_FILES. They are NOT rewritten as part of this
 * guard's introduction (per ADR-003, "no big-bang refactors"). Existing
 * files remain on the allowlist; new files MUST go through services.
 *
 * Goal: drain KNOWN_DIRECT_TABLE_IMPORT_FILES over time. As features touch
 * a grandfathered file, the author should extract a service wrapper for
 * the table query and remove the file from this list.
 *
 * Companion guards:
 *   - guard:component-api-calls (#198)        — first boundary (UI → route)
 *   - guard:component-service-imports (#208)  — second boundary (UI → service)
 *   - guard:authz-comments (#203)             — gates @propertypro/db/unsafe
 *
 * Survey + rationale: docs/audits/a3-third-boundary-guard-survey-2026-05-08.md
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

// ---------------------------------------------------------------------------
// Scan scope
// ---------------------------------------------------------------------------

const SCAN_ROOT = 'apps/web/src/app/api';

// ---------------------------------------------------------------------------
// Allowed @propertypro/db symbols (canonical DB-layer surface for routes)
//
// These are the helpers a route MAY import directly without going through a
// service wrapper. Anything else from @propertypro/db (table refs, schema
// enum value-imports) is restricted.
//
// Type-only imports (`import type { ... }`) are always allowed regardless
// of what's imported — type-only imports have no runtime cost and the
// project relies on cross-cutting types like `WorkOrderStatus` for narrow
// filter param typing.
// ---------------------------------------------------------------------------

const ALLOWED_SYMBOLS = new Set<string>([
  // Tenant-scoped DB access (Plan A2 / B3 canonical)
  'createScopedClient',
  'paginate',
  // Mutation audit
  'logAuditEvent',
  // Storage helpers
  'createPresignedDownloadUrl',
  'createPresignedUploadUrl',
  'deleteStorageObject',
  // Search query helpers (canonical re-exports — implement in @propertypro/db
  // because they need raw SQL or trigram operators)
  'searchDocuments',
  'searchUsersByTrigram',
  'searchResidentsByTrigram',
  'searchViolationsByTrigram',
  'searchMaintenanceByTrigram',
  'searchMeetingsByTrigram',
  // Notification query helpers
  'markNotificationsRead',
  'archiveNotifications',
  'countUnreadNotifications',
  // Document access control helpers (Plan B3 #235 extracted these)
  'buildAccessibleDocumentsFilter',
  'buildDocumentAccessFilter',
  'getAccessibleDocuments',
  'getDocumentWithAccessCheck',
  'isDocumentAccessible',
]);

// ---------------------------------------------------------------------------
// Grandfather allowlist — 89 files as of 2026-05-08 survey
//
// These files predate the guard and are allowed to keep their direct table
// imports. New files MUST NOT be added without explicit review — the guard
// errors on any new file.
//
// To migrate a file off the list:
//   1. Identify the table queries inlined in the route handler.
//   2. Move them to a service wrapper under `@/lib/services/<domain>-service.ts`
//      (matches the existing convention; see `work-orders-service.ts`,
//      `package-visitor-service.ts`, etc.).
//   3. Update the route to call the wrapper instead of importing the table.
//   4. Remove the file from this set.
// ---------------------------------------------------------------------------

const KNOWN_DIRECT_TABLE_IMPORT_FILES = new Set<string>([
  'apps/web/src/app/api/v1/access-requests/route.ts',
  'apps/web/src/app/api/v1/account/delete/route.ts',
  'apps/web/src/app/api/v1/account/profile/route.ts',
  'apps/web/src/app/api/v1/announcements/route.ts',
  'apps/web/src/app/api/v1/arc/route.ts',
  'apps/web/src/app/api/v1/audit-trail/route.ts',
  'apps/web/src/app/api/v1/auth/confirm-verification/route.ts',
  'apps/web/src/app/api/v1/auth/demo-login/route.ts',
  'apps/web/src/app/api/v1/auth/provisioning-status/route.ts',
  'apps/web/src/app/api/v1/auth/resend-verification/route.ts',
  'apps/web/src/app/api/v1/billing-groups/[id]/preview/route.ts',
  'apps/web/src/app/api/v1/billing/upgrade-requests/route.ts',
  'apps/web/src/app/api/v1/communities/[id]/cancel-preview/route.ts',
  'apps/web/src/app/api/v1/communities/[id]/cancel/route.ts',
  'apps/web/src/app/api/v1/communities/delete/route.ts',
  'apps/web/src/app/api/v1/community/contact/route.ts',
  'apps/web/src/app/api/v1/compliance/route.ts',
  'apps/web/src/app/api/v1/contracts/route.ts',
  'apps/web/src/app/api/v1/demo/[slug]/enter/route.ts',
  'apps/web/src/app/api/v1/demo/[slug]/self-service-upgrade/route.ts',
  'apps/web/src/app/api/v1/document-categories/route.ts',
  'apps/web/src/app/api/v1/documents/drafts/[id]/document-search/route.ts',
  'apps/web/src/app/api/v1/documents/drafts/[id]/images/route.ts',
  'apps/web/src/app/api/v1/documents/drafts/[id]/publish/route.ts',
  'apps/web/src/app/api/v1/documents/drafts/[id]/route.ts',
  'apps/web/src/app/api/v1/documents/drafts/route.ts',
  'apps/web/src/app/api/v1/documents/route.ts',
  'apps/web/src/app/api/v1/emergency-broadcasts/route.ts',
  'apps/web/src/app/api/v1/import-residents/route.ts',
  'apps/web/src/app/api/v1/internal/account-lifecycle/route.ts',
  'apps/web/src/app/api/v1/internal/coupon-sync-retry/route.ts',
  'apps/web/src/app/api/v1/internal/expire-demos/route.ts',
  'apps/web/src/app/api/v1/internal/provision/route.ts',
  'apps/web/src/app/api/v1/internal/readiness/route.ts',
  'apps/web/src/app/api/v1/internal/revenue-snapshot/health/route.ts',
  'apps/web/src/app/api/v1/internal/revenue-snapshot/route.ts',
  'apps/web/src/app/api/v1/internal/visitor-auto-checkout/route.ts',
  'apps/web/src/app/api/v1/invitations/route.ts',
  'apps/web/src/app/api/v1/leases/route.ts',
  'apps/web/src/app/api/v1/maintenance-requests/[id]/route.ts',
  'apps/web/src/app/api/v1/maintenance-requests/route.ts',
  'apps/web/src/app/api/v1/meetings/[id]/route.ts',
  'apps/web/src/app/api/v1/meetings/route.ts',
  'apps/web/src/app/api/v1/move-checklists/[id]/steps/[stepKey]/action/route.ts',
  'apps/web/src/app/api/v1/notification-preferences/route.ts',
  'apps/web/src/app/api/v1/notifications/all/route.ts',
  'apps/web/src/app/api/v1/notifications/route.ts',
  'apps/web/src/app/api/v1/onboarding/apartment/route.ts',
  'apps/web/src/app/api/v1/onboarding/condo/route.ts',
  'apps/web/src/app/api/v1/packages/route.ts',
  'apps/web/src/app/api/v1/phone/verify/confirm/route.ts',
  'apps/web/src/app/api/v1/phone/verify/send/route.ts',
  'apps/web/src/app/api/v1/pm/bulk/announcements/route.ts',
  'apps/web/src/app/api/v1/pm/bulk/documents/route.ts',
  'apps/web/src/app/api/v1/polls/route.ts',
  'apps/web/src/app/api/v1/public/communities/search/route.ts',
  'apps/web/src/app/api/v1/residents/invite/route.ts',
  'apps/web/src/app/api/v1/residents/route.ts',
  'apps/web/src/app/api/v1/search/documents/route.ts',
  'apps/web/src/app/api/v1/subscribe/change-plan/route.ts',
  'apps/web/src/app/api/v1/subscribe/route.ts',
  'apps/web/src/app/api/v1/units/route.ts',
  'apps/web/src/app/api/v1/violations/[id]/hearing-notice/route.ts',
  'apps/web/src/app/api/v1/violations/[id]/notice/route.ts',
  'apps/web/src/app/api/v1/violations/route.ts',
  'apps/web/src/app/api/v1/visitors/[id]/revoke/route.ts',
  'apps/web/src/app/api/v1/visitors/denied/route.ts',
  'apps/web/src/app/api/v1/webhooks/stripe/route.ts',
  'apps/web/src/app/api/v1/webhooks/twilio/route.ts',
  'apps/web/src/app/api/v1/work-orders/route.ts',
]);

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

interface Violation {
  file: string;
  symbols: string[];
}

/**
 * Collapse a file's import statements (which may span multiple lines into a
 * `{ ... }` block) into single-line strings. Only returns lines that import
 * from `@propertypro/db` exactly (NOT `/filters` or `/unsafe` — those have
 * their own handling).
 */
function collapseDbImports(content: string): string[] {
  const lines = content.split('\n');
  const collapsed: string[] = [];
  let buffer = '';
  let inImport = false;

  for (const line of lines) {
    if (!inImport) {
      // Single-line import (no curly brace) on @propertypro/db
      if (/^import\s+[^{}]+from\s+['"]@propertypro\/db['"]/.test(line)) {
        collapsed.push(line);
        continue;
      }
      // Start of a multi-line `{ ... }` import
      if (/^import\s+.*\{/.test(line)) {
        buffer = line;
        inImport = true;
        if (line.includes('}')) {
          if (/from\s+['"]@propertypro\/db['"]/.test(line)) {
            collapsed.push(line);
          }
          buffer = '';
          inImport = false;
        }
      }
    } else {
      buffer += ' ' + line;
      if (line.includes('}')) {
        if (/from\s+['"]@propertypro\/db['"]/.test(buffer)) {
          collapsed.push(buffer);
        }
        buffer = '';
        inImport = false;
      }
    }
  }
  return collapsed;
}

/**
 * Extract the imported value-symbols (NOT `type` imports) from a single
 * collapsed import statement.
 */
function extractValueSymbols(importLine: string): string[] {
  const braceMatch = importLine.match(/\{([^}]+)\}/);
  if (!braceMatch?.[1]) return [];
  return braceMatch[1]
    .split(',')
    .map((sym) => sym.trim())
    .filter((sym) => sym.length > 0)
    // Drop `type X` and `type { X }` imports — type-only is always allowed.
    .filter((sym) => !sym.startsWith('type '))
    // Strip `as Alias` if present — we only care about the source name.
    .map((sym) => sym.split(/\s+as\s+/)[0]?.trim() ?? sym);
}

function findViolation(content: string, filePath: string): Violation | null {
  const dbImports = collapseDbImports(content);
  const offendingSymbols: string[] = [];

  for (const imp of dbImports) {
    // If the entire import is `import type { ... } from ...`, skip.
    if (/^import\s+type\s+/.test(imp)) continue;
    const syms = extractValueSymbols(imp);
    for (const sym of syms) {
      if (!ALLOWED_SYMBOLS.has(sym)) {
        offendingSymbols.push(sym);
      }
    }
  }

  if (offendingSymbols.length === 0) return null;
  return { file: filePath, symbols: [...new Set(offendingSymbols)] };
}

// ---------------------------------------------------------------------------
// Filesystem walk
// ---------------------------------------------------------------------------

function walkDir(dirAbs: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dirAbs);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === 'node_modules') continue;
    const abs = join(dirAbs, entry);
    let s;
    try {
      s = statSync(abs);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      out.push(...walkDir(abs));
    } else if (s.isFile() && entry === 'route.ts') {
      out.push(abs);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  console.log('🔍 Route → Table Import Guard (ADR-003 / A3 Phase 1)');
  console.log('='.repeat(60));

  const rootAbs = resolve(repoRoot, SCAN_ROOT);
  const files = walkDir(rootAbs);

  const allowlistedHits = new Set<string>();
  const newViolations: Violation[] = [];

  for (const fileAbs of files) {
    const rel = relative(repoRoot, fileAbs);
    const content = readFileSync(fileAbs, 'utf-8');
    const violation = findViolation(content, rel);
    if (!violation) continue;

    if (KNOWN_DIRECT_TABLE_IMPORT_FILES.has(rel)) {
      allowlistedHits.add(rel);
    } else {
      newViolations.push(violation);
    }
  }

  // Detect dead allowlist entries — files that no longer have a violation
  // (or no longer exist). Pruning these keeps the debt ledger honest.
  const deadAllowlistEntries: string[] = [];
  for (const entry of KNOWN_DIRECT_TABLE_IMPORT_FILES) {
    if (!allowlistedHits.has(entry)) {
      deadAllowlistEntries.push(entry);
    }
  }

  console.log(`\nScanned ${files.length} route.ts files.`);
  console.log(
    `Allowlist: ${KNOWN_DIRECT_TABLE_IMPORT_FILES.size} grandfathered files; ` +
      `${allowlistedHits.size} active hits.`,
  );

  if (deadAllowlistEntries.length > 0) {
    console.error(
      `\n❌ ${deadAllowlistEntries.length} file(s) are in KNOWN_DIRECT_TABLE_IMPORT_FILES ` +
        `but no longer import a non-helper symbol from @propertypro/db. ` +
        `Remove them from the allowlist:`,
    );
    for (const entry of deadAllowlistEntries) {
      console.error(`  - ${entry}`);
    }
  }

  if (newViolations.length > 0) {
    console.error(
      `\n❌ ${newViolations.length} new route(s) import non-helper symbols from @propertypro/db:`,
    );
    for (const v of newViolations) {
      console.error(`  ${v.file}`);
      console.error(`      → imports: ${v.symbols.join(', ')}`);
    }
    console.error(
      '\nADR-003: route handlers should call services, not import tables ' +
        'or schema enums directly. Move the query into a service wrapper ' +
        'under `@/lib/services/<domain>-service.ts` and import the wrapper.\n' +
        'Allowed canonical helpers: createScopedClient, paginate, logAuditEvent, ' +
        'plus storage / search / notification / document-access helpers (see ' +
        'ALLOWED_SYMBOLS in this script). Type-only imports (`import type { ... }`) ' +
        'are always allowed.',
    );
  }

  const hasErrors = newViolations.length > 0 || deadAllowlistEntries.length > 0;
  if (hasErrors) {
    process.exit(1);
  }

  console.log(
    `\n✅ No new route → table imports outside the allowlist. ` +
      `${KNOWN_DIRECT_TABLE_IMPORT_FILES.size} grandfathered files remain — drain over time.`,
  );
}

main();
