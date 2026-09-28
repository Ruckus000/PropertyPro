#!/usr/bin/env tsx
/**
 * Route Gate Guard (`pnpm guard:route-gates`, WS3)
 *
 * Every HTTP verb exported by a `route.ts` under `apps/web/src/app/api` or
 * `apps/admin/src/app/api` must either REFUSE someone or SAY, in writing, why
 * it refuses no one. Each app has its OWN helper list (`SCAN_TARGETS`), so a
 * web route is never credited by an admin helper's name, or the reverse.
 *
 *   gated      — the verb's body (followed through same-file top-level
 *                functions) calls a helper in `GATE_HELPERS`, calls a signed-
 *                token verifier (`TOKEN_VERIFIER_NAME`, shared with
 *                guard:token-auth-routes), or throws `ForbiddenError` inline
 *                under an `if` whose condition names the caller's role,
 *                admin/author flag or own user/unit ids (`IDENTITY_IDENTIFIER`).
 *   annotated  — the verb's statement carries, in its leading comments,
 *                  // route-gate: <self-scoped|community-open|public> — <reason>
 *
 * ## Why per VERB, not per file
 *
 * The 2026-09-28 route census (docs/audits/2026-09-28-route-authz-census.md)
 * found `GET /onboarding/{apartment,condo}` readable by any member while the
 * same files' POST/PATCH were gated. A per-file check passes that file. It is
 * the only one of the census's five findings this guard could have caught, and
 * only because it checks each verb.
 *
 * ## What this guard CANNOT see (read before trusting a green run)
 *
 * - A written claim is not a true claim. The census is the evidence behind the
 *   annotations present when this guard landed; a new one is only as good as
 *   the review of the PR that adds it.
 * - An over-broad gate. `require*ReadPermission` admits every role the matrix
 *   grants read to; the census's overview, help-search and amenity-schedule
 *   leaks all sat BEHIND a gate like that. So did the signup takeover, which is
 *   sessionless and belongs to guard:token-auth-routes.
 * - Whether an inline check's condition is RIGHT. An `if` naming a role or
 *   ownership identifier is credited; that it tests the right role is review's
 *   job. (Feature/plan/type checks are not credited — see IDENTITY_IDENTIFIER.)
 * - `route.ts` files OUTSIDE `app/api` (web: `billing/portal`,
 *   `auth/verify-signup` and three dev routes; admin: `dev/agent-login`).
 *   Trigger: a new non-dev `route.ts` outside `app/api`.
 *
 * ## Why admin is in scope (roadmap 2.5)
 *
 * Admin middleware already demands a `platform_admin_users` row — except on
 * `/api/health` and the PREFIX `/api/admin/internal/`, which it lets through
 * sessionless for the cron bearer. A route added under that prefix is
 * protected by nothing but its own call, and middleware path matching is one
 * edit away from exempting more. So each admin verb must refuse on its own.
 *
 * A helper NAME is not trusted, though: every `GATE_HELPERS` entry names the
 * file that defines it, and the guard checks that the definition exists there
 * and can refuse (its body throws, or calls another listed gate). That rule is
 * what keeps `requireReservationPermission` — a documented no-op — off the list.
 *
 * Exit codes are tri-state, per `.claude/rules/verification.md`:
 *   0  clean
 *   1  violations found
 *   2  could not check — refuses to pass rather than report a false clean
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import { collectCommentRanges, parseOrNull } from './lib/comment-ranges';
import { isMainModule } from './lib/is-main-module';
import { TOKEN_VERIFIER_NAME } from './verify-token-auth-routes';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = resolve(scriptDir, '..');

const HTTP_VERBS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

export const ROUTE_GATE_CLASSES = ['self-scoped', 'community-open', 'public'] as const;
export type RouteGateClass = (typeof ROUTE_GATE_CLASSES)[number];

// Same bar as guard:authz-comments: the reason must justify, not defer.
const FORBIDDEN_REASONS = new Set(['TODO', 'FIXME', 'XXX', '???']);
const MIN_REASON_LENGTH = 10;
const MARKER_RE = /^\/\/\s*route-gate:/;
const ANNOTATION_RE = /^\/\/\s*route-gate:\s*(\S+)\s+(?:—|--?)\s+(.+?)\s*$/;

export interface GateHelper {
  name: string;
  /** Repo-relative file that must define `name` and whose body must refuse. */
  file: string;
}

/**
 * Helpers whose call counts as a gate. Deliberately NOT here:
 * - `requireCommunityMembership` — membership only; that is `community-open`.
 * - `require*Enabled`, `requirePlanFeature` — feature/plan flags, not who.
 * - `requireEntitledForAdminRead` — subscription lifecycle, and a no-op for
 *   residents by design.
 * - `requireReservationPermission` — an explicit no-op kept for call-site
 *   compatibility (work-orders/common.ts). The self-check below rejects it.
 * - `requireCommunityRole` — validates a role STRING; refuses no caller.
 */
export const GATE_HELPERS: ReadonlyArray<GateHelper> = [
  { name: 'requirePermission', file: 'apps/web/src/lib/db/access-control.ts' },
  { name: 'requireBoardDesignation', file: 'apps/web/src/lib/db/access-control.ts' },
  { name: 'requireRole', file: 'apps/web/src/lib/api/role-guard.ts' },
  { name: 'requireRootManager', file: 'apps/web/src/lib/api/role-guard.ts' },
  { name: 'requirePlatformAdmin', file: 'apps/web/src/lib/api/require-platform-admin.ts' },
  { name: 'requireCronSecret', file: 'apps/web/src/lib/api/cron-auth.ts' },
  { name: 'requirePmPortfolioAccess', file: 'apps/web/src/lib/api/pm-portfolio-access.ts' },
  { name: 'requireMutationAuthorization', file: 'apps/web/src/lib/onboarding/wizard-common.ts' },
  { name: 'requireStaffOperator', file: 'apps/web/src/lib/logistics/common.ts' },
  { name: 'requirePackagesReadPermission', file: 'apps/web/src/lib/logistics/common.ts' },
  { name: 'requirePackagesWritePermission', file: 'apps/web/src/lib/logistics/common.ts' },
  { name: 'requireVisitorsReadPermission', file: 'apps/web/src/lib/logistics/common.ts' },
  { name: 'requireVisitorsWritePermission', file: 'apps/web/src/lib/logistics/common.ts' },
  { name: 'requireFinanceReadPermission', file: 'apps/web/src/lib/finance/common.ts' },
  { name: 'requireFinanceWritePermission', file: 'apps/web/src/lib/finance/common.ts' },
  { name: 'requireFinanceAdminWrite', file: 'apps/web/src/lib/finance/common.ts' },
  { name: 'requireAccountingReadPermission', file: 'apps/web/src/lib/accounting/common.ts' },
  { name: 'requireAccountingWritePermission', file: 'apps/web/src/lib/accounting/common.ts' },
  { name: 'requireEsignReadPermission', file: 'apps/web/src/lib/esign/esign-route-helpers.ts' },
  { name: 'requireEsignManagementRead', file: 'apps/web/src/lib/esign/esign-route-helpers.ts' },
  { name: 'requireEsignWritePermission', file: 'apps/web/src/lib/esign/esign-route-helpers.ts' },
  { name: 'requirePollReadPermission', file: 'apps/web/src/lib/polls/common.ts' },
  { name: 'requirePollWritePermission', file: 'apps/web/src/lib/polls/common.ts' },
  { name: 'requirePollCreatorRole', file: 'apps/web/src/lib/polls/common.ts' },
  { name: 'requireForumModerationPermission', file: 'apps/web/src/lib/polls/common.ts' },
  { name: 'requireWorkOrdersReadPermission', file: 'apps/web/src/lib/work-orders/common.ts' },
  { name: 'requireWorkOrdersWritePermission', file: 'apps/web/src/lib/work-orders/common.ts' },
  { name: 'requireWorkOrderAdminWrite', file: 'apps/web/src/lib/work-orders/common.ts' },
  { name: 'requireAmenitiesReadPermission', file: 'apps/web/src/lib/work-orders/common.ts' },
  { name: 'requireAmenitiesWritePermission', file: 'apps/web/src/lib/work-orders/common.ts' },
  { name: 'requireAmenityAdminWrite', file: 'apps/web/src/lib/work-orders/common.ts' },
  { name: 'requireCalendarSyncReadPermission', file: 'apps/web/src/lib/calendar/common.ts' },
  { name: 'requireCalendarSyncWritePermission', file: 'apps/web/src/lib/calendar/common.ts' },
  { name: 'requireViolationAdminWrite', file: 'apps/web/src/lib/violations/common.ts' },
  { name: 'requireArcReviewPermission', file: 'apps/web/src/lib/violations/common.ts' },
  { name: 'requireArcSubmitterRole', file: 'apps/web/src/lib/violations/common.ts' },
  { name: 'requireElectionsAdminRole', file: 'apps/web/src/lib/elections/common.ts' },
  { name: 'requireExportPermission', file: 'apps/web/src/lib/services/export/export-route-auth.ts' },
  { name: 'requireExportAccess', file: 'apps/web/src/lib/services/export/export-route-auth.ts' },
];

/**
 * The platform-admin console's gates (roadmap 2.5). `billingActionRoute` is a
 * route FACTORY whose handler calls `requirePlatformAdmin()` first; the
 * self-check below verifies that, the same way it verifies every web entry.
 */
export const ADMIN_GATE_HELPERS: ReadonlyArray<GateHelper> = [
  { name: 'requirePlatformAdmin', file: 'apps/admin/src/lib/auth/platform-admin.ts' },
  { name: 'requireCronSecret', file: 'apps/admin/src/lib/api/cron-auth.ts' },
  { name: 'billingActionRoute', file: 'apps/admin/src/lib/api/billing-action-route.ts' },
];

export interface ScanTarget {
  /** Repo-relative directory whose `route.ts` files are checked. */
  root: string;
  helpers: ReadonlyArray<GateHelper>;
}

export const SCAN_TARGETS: ReadonlyArray<ScanTarget> = [
  { root: 'apps/web/src/app/api', helpers: GATE_HELPERS },
  { root: 'apps/admin/src/app/api', helpers: ADMIN_GATE_HELPERS },
];

export class CannotCheckError extends Error {}

export type VerbStatus = 'helper' | 'token' | 'inline' | 'annotated' | 'ungated';

export interface VerbResult {
  verb: string;
  status: VerbStatus;
  gateClass?: RouteGateClass;
}

export interface FileAnalysis {
  verbs: VerbResult[];
  /** Human-readable problems (exit 1). */
  problems: string[];
}

function calleeName(expr: ts.Expression): string | null {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return null;
}

function hasExportModifier(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  );
}

type GateKind = 'helper' | 'token' | 'inline';

/**
 * Identifiers that make an `if` condition a decision about WHO is calling: a
 * role or role set, the admin/board/author flags, or the caller's own user or
 * unit ids (ownership). A condition naming none of these — `!features.hasX`,
 * `!created`, `invalidIds.length > 0` — refuses on the community's plan or the
 * data, not the caller, and is not a gate. That distinction is load-bearing:
 * crediting ANY inline ForbiddenError let `requireCondoCommunity()` (a
 * community-TYPE check) stand in for the role gate on GET /onboarding/condo,
 * which is exactly census finding F3 — caught by this guard's own revert-check.
 */
const IDENTITY_IDENTIFIER =
  /role|^isAdmin|^designation$|^canModerate$|^canRequestUpgrade$|^isAuthor$|^isResident$|^isDemoUser$|userid$|unitids$/i;

function isForbiddenThrow(node: ts.Node): boolean {
  return (
    ts.isThrowStatement(node) &&
    node.expression !== undefined &&
    ts.isNewExpression(node.expression) &&
    calleeName(node.expression.expression) === 'ForbiddenError'
  );
}

/** `if (…) throw new ForbiddenError(…)`, bare or as a statement of the block. */
function thenThrowsForbidden(node: ts.IfStatement): boolean {
  const then = node.thenStatement;
  return isForbiddenThrow(then) || (ts.isBlock(then) && then.statements.some(isForbiddenThrow));
}

function namesAnIdentity(condition: ts.Expression, sf: ts.SourceFile): boolean {
  let hit = false;
  const visit = (node: ts.Node): void => {
    if (hit) return;
    if (ts.isIdentifier(node) && IDENTITY_IDENTIFIER.test(node.text)) hit = true;
    else node.getChildren(sf).forEach(visit);
  };
  visit(condition);
  return hit;
}

/**
 * How `root` refuses, following references to same-file top-level functions
 * and constants. `null` when nothing reachable refuses.
 */
function findGate(
  root: ts.Node,
  sf: ts.SourceFile,
  locals: Map<string, ts.Node>,
  gateNames: ReadonlySet<string>,
): GateKind | null {
  const seen = new Set<string>();
  let found: GateKind | null = null;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(node)) {
      const name = calleeName(node.expression);
      if (name && gateNames.has(name)) {
        found = 'helper';
        return;
      }
      if (name && TOKEN_VERIFIER_NAME.test(name)) {
        found = 'token';
        return;
      }
    }
    if (ts.isIfStatement(node) && thenThrowsForbidden(node) && namesAnIdentity(node.expression, sf)) {
      found = 'inline';
      return;
    }
    if (ts.isIdentifier(node) && locals.has(node.text) && !seen.has(node.text)) {
      seen.add(node.text);
      visit(locals.get(node.text)!);
      if (found) return;
    }
    node.getChildren(sf).forEach(visit);
  };
  visit(root);
  return found;
}

function parseAnnotation(text: string): { gateClass?: RouteGateClass; problem?: string } {
  const m = ANNOTATION_RE.exec(text.trim());
  if (!m) {
    return { problem: `malformed \`${text.trim()}\` — expected \`// route-gate: <class> — <reason>\`` };
  }
  const [, cls, reason] = m as unknown as [string, string, string];
  if (!(ROUTE_GATE_CLASSES as readonly string[]).includes(cls)) {
    return { problem: `unknown class "${cls}" — use one of ${ROUTE_GATE_CLASSES.join(', ')}` };
  }
  if (reason.length < MIN_REASON_LENGTH || FORBIDDEN_REASONS.has(reason.toUpperCase())) {
    return { problem: `reason "${reason}" must justify the claim (≥${MIN_REASON_LENGTH} chars, not TODO)` };
  }
  return { gateClass: cls as RouteGateClass };
}

/**
 * Classify every exported verb in one route file.
 * Throws `CannotCheckError` when the file cannot be analysed faithfully.
 */
export function analyzeRouteFile(
  fileName: string,
  source: string,
  gateNames: ReadonlySet<string> = new Set(GATE_HELPERS.map((h) => h.name)),
): FileAnalysis {
  const collected = collectCommentRanges(fileName, source);
  if (collected === null) throw new CannotCheckError(`${fileName} does not parse`);
  const sf = collected.sourceFile;

  const locals = new Map<string, ts.Node>();
  const verbNodes: Array<{ verb: string; statement: ts.Statement; body: ts.Node }> = [];

  for (const statement of sf.statements) {
    const exported = hasExportModifier(statement);
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      const name = statement.name.text;
      if (exported && HTTP_VERBS.has(name)) verbNodes.push({ verb: name, statement, body: statement });
      else locals.set(name, statement);
    } else if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) {
          if (exported) {
            throw new CannotCheckError(
              `${fileName}: destructured export — cannot tell which verbs it defines`,
            );
          }
          continue;
        }
        const name = decl.name.text;
        if (!decl.initializer) continue;
        if (exported && HTTP_VERBS.has(name)) {
          verbNodes.push({ verb: name, statement, body: decl.initializer });
        } else {
          locals.set(name, decl.initializer);
        }
      }
    } else if (ts.isExportDeclaration(statement)) {
      const clause = statement.exportClause;
      const verbElements =
        clause && ts.isNamedExports(clause)
          ? clause.elements.filter((e) => HTTP_VERBS.has(e.name.text))
          : [];
      // `export * from` or `export { GET } from './x'`: the handler body lives
      // in another module this guard does not follow.
      if (statement.moduleSpecifier && (clause === undefined || verbElements.length > 0)) {
        throw new CannotCheckError(
          `${fileName}: re-exports a handler from another module — ` +
            'teach this guard that shape rather than let it pass unchecked',
        );
      }
      // `export { handleOptions as OPTIONS }`: the local name is the body. If it
      // is imported rather than defined here, nothing is followed and the verb
      // needs a claim like any other ungated verb.
      for (const element of verbElements) {
        verbNodes.push({ verb: element.name.text, statement, body: element.propertyName ?? element.name });
      }
    }
  }

  const problems: string[] = [];
  const consumedMarkers = new Set<number>();
  const verbs: VerbResult[] = [];

  for (const { verb, statement, body } of verbNodes) {
    const markers = (ts.getLeadingCommentRanges(source, statement.pos) ?? []).filter((r) =>
      MARKER_RE.test(source.slice(r.pos, r.end)),
    );
    for (const r of markers) consumedMarkers.add(r.pos);

    const gate = findGate(body, sf, locals, gateNames);
    if (gate) {
      if (markers.length > 0) {
        problems.push(`${verb}: carries a route-gate claim but is already gated (${gate}) — delete the stale claim`);
      }
      verbs.push({ verb, status: gate });
      continue;
    }
    if (markers.length === 0) {
      problems.push(
        `${verb}: calls no gate and carries no \`// route-gate: <${ROUTE_GATE_CLASSES.join('|')}> — <reason>\` claim`,
      );
      verbs.push({ verb, status: 'ungated' });
      continue;
    }
    if (markers.length > 1) problems.push(`${verb}: more than one route-gate claim`);
    const parsed = parseAnnotation(source.slice(markers[0]!.pos, markers[0]!.end));
    if (parsed.problem) {
      problems.push(`${verb}: ${parsed.problem}`);
      verbs.push({ verb, status: 'ungated' });
    } else {
      verbs.push({ verb, status: 'annotated', gateClass: parsed.gateClass });
    }
  }

  // A claim anywhere else (file header, inside a handler, above an import)
  // attaches to no verb, so it would read as coverage while covering nothing.
  for (const r of collected.ranges) {
    if (consumedMarkers.has(r.pos)) continue;
    const text = source.slice(r.pos, r.end);
    if (MARKER_RE.test(text)) {
      const { line } = sf.getLineAndCharacterOfPosition(r.pos);
      problems.push(
        `line ${line + 1}: route-gate claim is not directly above an exported verb, so it covers nothing`,
      );
    }
  }

  return { verbs, problems };
}

/**
 * Problems with the helper list itself: a missing file or definition is a
 * could-not-check (it throws); a definition that cannot refuse is a violation.
 */
export function checkGateHelpers(repoRoot: string, helpers: ReadonlyArray<GateHelper>): string[] {
  const names = new Set(helpers.map((h) => h.name));
  const problems: string[] = [];
  const parsed = new Map<string, ts.SourceFile>();
  for (const helper of helpers) {
    let sf = parsed.get(helper.file);
    if (!sf) {
      let source: string;
      try {
        source = readFileSync(join(repoRoot, helper.file), 'utf8');
      } catch {
        throw new CannotCheckError(`GATE_HELPERS: ${helper.file} (for ${helper.name}) is missing`);
      }
      const parsedFile = parseOrNull(helper.file, source);
      if (!parsedFile) throw new CannotCheckError(`GATE_HELPERS: ${helper.file} does not parse`);
      sf = parsedFile;
      parsed.set(helper.file, sf);
    }
    const definition = sf.statements.find(
      (s): s is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(s) && s.name?.text === helper.name && s.body !== undefined,
    );
    if (!definition) {
      throw new CannotCheckError(
        `GATE_HELPERS: ${helper.name} is not defined as a function in ${helper.file} — update the entry`,
      );
    }
    let refuses = false;
    const visit = (node: ts.Node): void => {
      if (refuses) return;
      if (ts.isThrowStatement(node)) refuses = true;
      else if (ts.isCallExpression(node)) {
        const name = calleeName(node.expression);
        if (name && name !== helper.name && names.has(name)) refuses = true;
      }
      if (!refuses) node.getChildren(sf).forEach(visit);
    };
    visit(definition.body!);
    if (!refuses) {
      problems.push(
        `GATE_HELPERS: ${helper.name} (${helper.file}) neither throws nor calls another gate — it refuses no one, so it is not a gate`,
      );
    }
  }
  return problems;
}

function walkRouteFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) walkRouteFiles(abs, out);
    else if (entry.isFile() && /^route\.(ts|tsx|js|mjs)$/.test(entry.name)) out.push(abs);
  }
}

export function checkRouteGates(
  repoRoot: string = defaultRepoRoot,
  targets: ReadonlyArray<ScanTarget> = SCAN_TARGETS,
): 0 | 1 | 2 {
  const violations: string[] = [];

  for (const { root, helpers } of targets) {
    const scanRoot = join(repoRoot, root);
    try {
      if (!statSync(scanRoot).isDirectory()) throw new Error('not a directory');
    } catch {
      console.error(`❌ Cannot check: scan root ${root} does not exist.`);
      return 2;
    }

    const counts: Record<VerbStatus, number> = { helper: 0, token: 0, inline: 0, annotated: 0, ungated: 0 };
    const byClass: Record<RouteGateClass, number> = { 'self-scoped': 0, 'community-open': 0, public: 0 };
    let files: string[] = [];

    try {
      violations.push(...checkGateHelpers(repoRoot, helpers));
      walkRouteFiles(scanRoot, files);
      files = files.sort();
      if (files.length === 0) throw new CannotCheckError(`found 0 route files under ${root}`);

      const gateNames = new Set(helpers.map((h) => h.name));
      for (const file of files) {
        const rel = relative(repoRoot, file);
        const result = analyzeRouteFile(rel, readFileSync(file, 'utf8'), gateNames);
        for (const v of result.verbs) {
          counts[v.status] += 1;
          if (v.gateClass) byClass[v.gateClass] += 1;
        }
        for (const p of result.problems) violations.push(`${rel}: ${p}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ Cannot check: ${message}`);
      return 2;
    }

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) {
      console.error(`❌ Cannot check: ${files.length} route files under ${root} exported 0 HTTP verbs.`);
      return 2;
    }

    console.log(
      `${root}: ${files.length} route files, ${total} exported verbs: ` +
        `${counts.helper} helper-gated, ${counts.token} token-verified, ${counts.inline} inline ForbiddenError, ` +
        `${counts.annotated} claimed (${byClass['self-scoped']} self-scoped, ` +
        `${byClass['community-open']} community-open, ${byClass.public} public). ` +
        `${helpers.length} gate helpers verified.`,
    );
  }

  if (violations.length > 0) {
    console.error(`\n❌ ${violations.length} route-gate violation(s):\n`);
    for (const v of violations) console.error(`  ${v}`);
    console.error(
      '\nEvery exported verb must call a gate, or state why it refuses no one:\n' +
        `  // route-gate: <${ROUTE_GATE_CLASSES.join('|')}> — <reason>\n` +
        'directly above the export. See docs/audits/2026-09-28-route-authz-census.md.',
    );
    return 1;
  }

  console.log('\n✅ Every exported route verb is gated or carries a reviewed route-gate claim.');
  return 0;
}

if (isMainModule(import.meta.url)) {
  process.exit(checkRouteGates());
}
