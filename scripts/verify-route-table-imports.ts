/**
 * A3 Third Boundary Guard — Route → Table Import Restriction (ADR-003 Phase 1)
 *
 * Enforces the app-layer half of ADR-003: every server file under
 * `apps/web/src/app` — API routes, AND pages, layouts and non-API route
 * handlers (roadmap 2.3 / DBB-01) — may import from `@propertypro/db`, but
 * only the canonical helpers below. Direct table or schema-enum value-imports
 * must go through a service wrapper under `@/lib/services/...`.
 *
 * Why the scope widened: the API layer was drained to zero, and the same
 * queries moved into `page.tsx`, where nothing scanned (21 files on
 * 2026-09-28). Reading those 21 before freezing them found three pages that
 * skipped a read gate their own API applies (fixed separately, #1206) — a
 * baseline is a list of accepted debt, so it was read before it was written.
 *
 * Detection parses TypeScript (roadmap 2.4 / DBB-05). The regex scanner it
 * replaced saw only `import { … } from` and so missed three shapes that reach
 * the same tables: a namespace import (`import * as db`), a re-export
 * (`export { x } from`), and a dynamic `import('@propertypro/db')`. Each is
 * now a violation in its own right, as is a default import.
 *
 * Why: routes that import tables directly bypass:
 *   - Service-layer abstraction (test seams, behavior-naming, audit hooks)
 *   - Centralized read-visibility / role-aware filtering
 *   - The boundary that lets the schema evolve independently of route code
 *
 * Baseline: `KNOWN_DIRECT_TABLE_IMPORTS` freezes the server pages that still
 * import tables, per file AND per symbol, shrink-only:
 *   - a file not in the map, or a symbol not listed for its file, fails;
 *   - a listed symbol the file no longer imports also fails (stale), so every
 *     drain ratchets the map down in the same PR;
 *   - `app/api/**` has NO entries and must stay at zero — the API layer was
 *     drained to a hard floor by A3 Phase 2 drain #77.
 *
 * Companion guards:
 *   - guard:component-api-calls (#198)        — first boundary (UI → route)
 *   - guard:component-service-imports (#208)  — second boundary (UI → service)
 *   - guard:authz-comments (#203)             — gates @propertypro/db/unsafe
 *
 * Survey + rationale: docs/audits/a3-third-boundary-guard-survey-2026-05-08.md
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import { parseOrNull } from './lib/comment-ranges';
import { isMainModule } from './lib/is-main-module';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

// ---------------------------------------------------------------------------
// Scan scope
// ---------------------------------------------------------------------------

const SCAN_ROOT = 'apps/web/src/app';
const DB_MODULE = '@propertypro/db';

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
  // Storage bucket names + retention/TTL constants. Plain string/number
  // constants, not tables or schema enums — the thing this guard exists to
  // block is a route reaching for a TABLE and bypassing the service layer.
  // Keeping them in @propertypro/db (next to the storage helpers that consume
  // them) is what stopped bucket names being bare string literals scattered
  // across route files.
  'COMMUNITY_EXPORTS_BUCKET',
  'COMMUNITY_EXPORT_RETENTION_DAYS',
  'COMMUNITY_EXPORT_SIGNED_URL_TTL_SECONDS',
  'DOCUMENTS_BUCKET',
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
  // Notification insertion helper (canonical platform helper that wraps the
  // notifications table insert + transactional outbox; not a Drizzle table).
  'insertNotifications',
  // Document access control helpers (Plan B3 #235 extracted these)
  'buildAccessibleDocumentsFilter',
  'buildDocumentAccessFilter',
  'getAccessibleDocuments',
  'getDocumentWithAccessCheck',
  'isDocumentAccessible',
  // Pure data catalogue (not a table or query); used by move-checklist
  // step-action routes to validate which step keys support which integration
  // actions. Added 2026-05-09 (A3 drain #54) — re-exporting through a
  // service file would force every test that mocks @propertypro/db to add
  // it to its mock factory, vs allowing the import keeps the catalogue
  // close to the schema.
  'ACTIONABLE_STEPS',
]);

// ---------------------------------------------------------------------------
// Baseline — shrink-only, per file AND per symbol (roadmap 2.3, 2026-09-28).
//
// Every entry is a server PAGE (or the one non-API route handler) that reads a
// table directly. Each was read before it was frozen: see the census note in
// docs/audits/2026-09-28-route-authz-census.md. To drain one, move its query
// behind a service in `@/lib/services/…` (most already have one — named in
// the comment) and delete the entry; the guard fails a stale entry, so the
// map cannot keep debt that is already paid.
//
// `app/api/**` has NO entries: that layer is a hard floor at zero.
// ---------------------------------------------------------------------------

export const KNOWN_DIRECT_TABLE_IMPORTS: ReadonlyMap<string, readonly string[]> = new Map([
  // root-only Stripe portal redirect; one PK lookup of stripeCustomerId
  ['apps/web/src/app/(authenticated)/billing/portal/route.ts', ['communities']],
  // resident unit labels; getUnitLabelMap (lib/services/units-lookup) could replace it
  ['apps/web/src/app/(authenticated)/communities/[id]/payments/page.tsx', ['units']],
  // one column (allowResidentVisitorRevoke)
  ['apps/web/src/app/(authenticated)/dashboard/visitors/page.tsx', ['communities']],
  // community name only; membership.communityName already carries it
  ['apps/web/src/app/(authenticated)/emergency/new/page.tsx', ['communities']],
  // unbounded list ordered by initiatedAt; the service paginates by id (50)
  ['apps/web/src/app/(authenticated)/emergency/page.tsx', ['emergencyBroadcasts']],
  // manager-only FAQ editor (isAdmin redirect)
  ['apps/web/src/app/(authenticated)/help/manage/page.tsx', ['faqs']],
  // FAQ search filtered by filterFaqsForRole; searchCommunityFaqs is the service
  // the caller's own users row
  ['apps/web/src/app/(authenticated)/settings/account/page.tsx', ['users']],
  // root-only change-plan
  ['apps/web/src/app/(authenticated)/settings/billing/change-plan/page.tsx', ['communities']],
  // billing fields; Stripe internals only reach the management tier (#1206)
  ['apps/web/src/app/(authenticated)/settings/billing/page.tsx', ['communities']],
  // the caller's own users row
  ['apps/web/src/app/(authenticated)/settings/page.tsx', ['users']],
  // one column (slug), behind settings:read
  ['apps/web/src/app/(authenticated)/settings/transparency/page.tsx', ['communities']],
  // announcements via filterVisibleAnnouncements; compliance gated (#1206)
  [
    'apps/web/src/app/(authenticated)/welcome/page.tsx',
    ['announcements', 'complianceChecklistItems', 'units'],
  ],
  // public demo pages keyed by slug; getDemoInstanceForUpgrade is the service shape
  ['apps/web/src/app/demo/[slug]/converted/page.tsx', ['communities', 'demoInstances']],
  ['apps/web/src/app/demo/[slug]/page.tsx', ['communities', 'demoInstances']],
  ['apps/web/src/app/demo/[slug]/upgrade/page.tsx', ['communities', 'demoInstances']],
  // the caller's own requests; paginateMaintenanceRequestsForCommunity differs in scope
  ['apps/web/src/app/mobile/maintenance/page.tsx', ['maintenanceRequests']],
  // behind meetings:read; listMeetingsForCommunity (lib/services/meeting-service)
  ['apps/web/src/app/mobile/meetings/page.tsx', ['meetings']],
]);

// ---------------------------------------------------------------------------
// Detection (TypeScript AST)
// ---------------------------------------------------------------------------

/** "I could not check, so I refuse to pass" — the guard exits 2. */
export class CouldNotCheckError extends Error {}

/**
 * Every value-level reach into `@propertypro/db` that is not an allowed
 * helper. Named value imports report the imported name; the other shapes
 * report a description, because they reach every table at once.
 * Type-only imports and exports are always allowed.
 */
export function findDisallowedDbImports(fileName: string, source: string): string[] {
  const sf = parseOrNull(fileName, source);
  if (!sf) throw new CouldNotCheckError(`${fileName} does not parse`);

  const found = new Set<string>();
  const isDb = (node: ts.Node | undefined): boolean =>
    !!node && ts.isStringLiteral(node) && node.text === DB_MODULE;

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && isDb(node.moduleSpecifier)) {
      const clause = node.importClause;
      if (clause && !clause.isTypeOnly) {
        if (clause.name) found.add(`default import (${clause.name.text})`);
        const bindings = clause.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) {
          found.add(`namespace import (* as ${bindings.name.text})`);
        } else if (bindings) {
          for (const el of bindings.elements) {
            if (el.isTypeOnly) continue;
            const name = (el.propertyName ?? el.name).text;
            if (!ALLOWED_SYMBOLS.has(name)) found.add(name);
          }
        }
      }
    } else if (ts.isExportDeclaration(node) && isDb(node.moduleSpecifier) && !node.isTypeOnly) {
      const clause = node.exportClause;
      if (!clause) found.add('re-export (export * from)');
      else if (ts.isNamespaceExport(clause)) found.add(`re-export (export * as ${clause.name.text})`);
      else {
        for (const el of clause.elements) {
          if (el.isTypeOnly) continue;
          const name = (el.propertyName ?? el.name).text;
          if (!ALLOWED_SYMBOLS.has(name)) found.add(`re-export (${name})`);
        }
      }
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      isDb(node.arguments[0])
    ) {
      found.add('dynamic import()');
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return [...found].sort();
}

// ---------------------------------------------------------------------------
// Filesystem walk
// ---------------------------------------------------------------------------

const SOURCE_FILE = /\.(ts|tsx)$/;
const TEST_FILE = /\.(test|spec)\.(ts|tsx)$/;

function walkDir(dirAbs: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dirAbs);
  } catch (err) {
    throw new CouldNotCheckError(`could not read directory ${dirAbs}: ${(err as Error).message}`);
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '__tests__') continue;
    const abs = join(dirAbs, entry);
    let s;
    try {
      s = statSync(abs);
    } catch (err) {
      throw new CouldNotCheckError(`could not stat ${abs}: ${(err as Error).message}`);
    }
    if (s.isDirectory()) {
      out.push(...walkDir(abs));
    } else if (s.isFile() && SOURCE_FILE.test(entry) && !TEST_FILE.test(entry) && !entry.endsWith('.d.ts')) {
      out.push(abs);
    }
  }
  return out;
}

const toPosix = (p: string) => p.split(sep).join('/');

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Run the guard over `baseDir/SCAN_ROOT` and return its exit code:
 * 0 clean · 1 violations · 2 could not check (missing root, walk or read
 * error, a file that does not parse, or zero route.ts files — a scan that
 * examined nothing must not pass). `baseDir` defaults to the repo root; tests
 * point it at a fixture tree and may pass their own baseline.
 */
export function checkRouteTableImports(
  baseDir: string = repoRoot,
  baseline: ReadonlyMap<string, readonly string[]> = KNOWN_DIRECT_TABLE_IMPORTS,
): number {
  console.log('🔍 App → Table Import Guard (ADR-003 / A3, widened by roadmap 2.3)');
  console.log('='.repeat(60));

  const rootAbs = resolve(baseDir, SCAN_ROOT);
  const found = new Map<string, string[]>();
  let files: string[];
  try {
    if (!statSync(rootAbs, { throwIfNoEntry: false })?.isDirectory()) {
      throw new CouldNotCheckError(`scan root ${SCAN_ROOT} does not exist under ${baseDir}.`);
    }
    files = walkDir(rootAbs);
    if (!files.some((f) => /[\\/]route\.ts$/.test(f))) {
      throw new CouldNotCheckError(`0 route.ts files under ${SCAN_ROOT}.`);
    }
    for (const fileAbs of files) {
      const rel = toPosix(relative(baseDir, fileAbs));
      let content: string;
      try {
        content = readFileSync(fileAbs, 'utf-8');
      } catch (err) {
        throw new CouldNotCheckError(`could not read ${rel}: ${(err as Error).message}`);
      }
      const symbols = findDisallowedDbImports(rel, content);
      if (symbols.length > 0) found.set(rel, symbols);
    }
  } catch (err) {
    if (!(err instanceof CouldNotCheckError)) throw err;
    console.error(`\n❌ Could not check app → table imports (refusing to pass): ${err.message}`);
    return 2;
  }

  const newViolations: Array<{ file: string; symbols: string[] }> = [];
  const stale: string[] = [];
  for (const [file, symbols] of found) {
    const allowed = new Set(baseline.get(file) ?? []);
    const extra = symbols.filter((s) => !allowed.has(s));
    if (extra.length > 0) newViolations.push({ file, symbols: extra });
  }
  for (const [file, symbols] of baseline) {
    const present = new Set(found.get(file) ?? []);
    for (const s of symbols) if (!present.has(s)) stale.push(`${file} → ${s}`);
  }

  const baselined = [...baseline.values()].reduce((n, s) => n + s.length, 0);
  console.log(
    `\nScanned ${files.length} server files under ${SCAN_ROOT} ` +
      `(${files.filter((f) => /[\\/]route\.ts$/.test(f)).length} route.ts). ` +
      `Baseline: ${baseline.size} files / ${baselined} symbols.`,
  );

  if (stale.length > 0) {
    console.error(
      `\n❌ ${stale.length} baseline entr${stale.length === 1 ? 'y is' : 'ies are'} stale — ` +
        'the file no longer imports that symbol. Remove it from KNOWN_DIRECT_TABLE_IMPORTS:',
    );
    for (const s of stale) console.error(`  - ${s}`);
  }

  if (newViolations.length > 0) {
    console.error(
      `\n❌ ${newViolations.length} file(s) import non-helper symbols from @propertypro/db:`,
    );
    for (const v of newViolations) {
      console.error(`  ${v.file}`);
      console.error(`      → ${v.symbols.join(', ')}`);
    }
    console.error(
      '\nADR-003: app code (routes AND pages) should call services, not import tables ' +
        'or schema enums directly. Move the query into a service wrapper ' +
        'under `@/lib/services/<domain>-service.ts` and import the wrapper.\n' +
        'Allowed canonical helpers: createScopedClient, paginate, logAuditEvent, ' +
        'plus storage / search / notification / document-access helpers (see ' +
        'ALLOWED_SYMBOLS in this script). Type-only imports are always allowed.',
    );
  }

  if (stale.length > 0 || newViolations.length > 0) return 1;

  console.log(
    '\n✅ No app → table imports outside the baseline. ' +
      `${baseline.size} baselined file(s) remain; the map is shrink-only.`,
  );
  return 0;
}

// ESM main-detection via the shared helper (symlink- and encoding-safe).
if (isMainModule(import.meta.url)) {
  process.exit(checkRouteTableImports());
}
