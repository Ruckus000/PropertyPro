/**
 * Component / Page API-call Guard (ADR-003)
 *
 * Enforces the layering rule from ADR-003: components and pages must not call
 * `fetch('/api/v1/*')` directly. The single sanctioned client-side entry to
 * the API is via hooks under `apps/web/src/hooks/`, which use TanStack Query
 * + the `requestJson` helper to centralize cache, retry, and error handling.
 *
 * Why: when components fetch directly they bypass:
 *   - Query-key cache invalidation (mutations elsewhere don't refresh them)
 *   - Retry / dedupe (every render that triggers a fetch hits the API)
 *   - Uniform error parsing (the `err.error` → "[object Object]" family)
 *
 * Existing violators: 62 files, grandfathered via KNOWN_DIRECT_API_CALL_FILES.
 * They are NOT rewritten as part of this guard's introduction (per ADR-003,
 * "no big-bang refactors"). Existing files remain on the allowlist; new
 * files MUST go through hooks.
 *
 * Goal: drain KNOWN_DIRECT_API_CALL_FILES over time. As features touch a
 * grandfathered file, the author should migrate it to a hook and remove the
 * file from this list.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');

// ---------------------------------------------------------------------------
// Scan scope
// ---------------------------------------------------------------------------

const SCAN_ROOTS: readonly string[] = [
  'apps/web/src/components',
  'apps/web/src/app/(authenticated)',
  'apps/web/src/app/(marketing)',
  'apps/web/src/app/(public)',
  'apps/web/src/app/(onboarding)',
  'apps/web/src/app/(auth)',
  'apps/web/src/app/auth',
  'apps/web/src/app/sign',
  'apps/web/src/app/legal',
  'apps/web/src/app/demo',
  'apps/web/src/app/mobile',
];

const FILE_EXTENSIONS = new Set(['.ts', '.tsx']);

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Match `fetch('/api/v1/...`, `fetch("/api/v1/...`, or `` fetch(`/api/v1/... ``.
 * The leading `fetch(` plus a string-literal opener means we ignore innocuous
 * content (e.g. a comment or a string mentioning `/api/v1/` for documentation).
 */
const DIRECT_API_FETCH_REGEX = /\bfetch\s*\(\s*[`'"]\/api\/v1\//;

interface Violation {
  file: string;
  line: number;
  excerpt: string;
}

function findViolations(content: string, filePath: string): Violation[] {
  const lines = content.split('\n');
  const violations: Violation[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (DIRECT_API_FETCH_REGEX.test(line)) {
      violations.push({
        file: filePath,
        line: i + 1,
        excerpt: line.trim().slice(0, 200),
      });
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// File walking
// ---------------------------------------------------------------------------

function walkDirectory(dir: string, files: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    // Directory may not exist in this branch — skip silently.
    return;
  }

  for (const entry of entries) {
    const full = join(dir, entry);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }

    if (stats.isDirectory()) {
      // Skip __tests__ directories — tests are allowed to call APIs directly.
      if (entry === '__tests__' || entry === 'node_modules') continue;
      walkDirectory(full, files);
      continue;
    }

    const ext = full.slice(full.lastIndexOf('.'));
    if (!FILE_EXTENSIONS.has(ext)) continue;
    // Skip *.test.ts(x) and *.spec.ts(x).
    if (full.endsWith('.test.ts') || full.endsWith('.test.tsx')) continue;
    if (full.endsWith('.spec.ts') || full.endsWith('.spec.tsx')) continue;
    files.push(full);
  }
}

// ---------------------------------------------------------------------------
// Grandfathered allowlist (ADR-003)
//
// These files exist on the date this guard was introduced (2026-05-06) and
// already call `fetch('/api/v1/*')` directly. Adding new entries here
// requires explicit reviewer + ADR-author sign-off; the goal is to drain
// this set, not grow it.
//
// To migrate a file off the list:
//   1. Move the fetch into a hook under apps/web/src/hooks/.
//   2. Use `requestJson` from `apps/web/src/lib/request/`.
//   3. Wire the component to the hook and remove from this set.
// ---------------------------------------------------------------------------

const KNOWN_DIRECT_API_CALL_FILES = new Set<string>([
  'apps/web/src/app/(authenticated)/dashboard/overview/overview-client.tsx',
  'apps/web/src/app/(authenticated)/esign/templates/[id]/template-detail-client.tsx',
  'apps/web/src/app/(authenticated)/esign/templates/new/template-builder-client.tsx',
  'apps/web/src/app/(authenticated)/settings/payments/connected/page.tsx',
  'apps/web/src/app/demo/[slug]/upgrade/upgrade-form.tsx',
  'apps/web/src/components/access-requests/approve-dialog.tsx',
  'apps/web/src/components/access-requests/deny-dialog.tsx',
  'apps/web/src/components/access-requests/request-access-form.tsx',
  'apps/web/src/components/announcements/announcement-authoring-form.tsx',
  'apps/web/src/components/auth/set-password-form.tsx',
  'apps/web/src/components/billing/upgrade-dialog.tsx',
  'apps/web/src/components/command-palette/useDataSearch.ts',
  'apps/web/src/components/compliance/compliance-activity-feed.tsx',
  'apps/web/src/components/documents/document-search.tsx',
  'apps/web/src/components/documents/document-version-history.tsx',
  'apps/web/src/components/finance/connect-status.tsx',
  'apps/web/src/components/finance/fee-policy-settings.tsx',
  'apps/web/src/components/finance/payment-dialog.tsx',
  'apps/web/src/components/finance/payment-portal.tsx',
  'apps/web/src/components/help/article-feedback.tsx',
  'apps/web/src/components/help/article-view-tracker.tsx',
  'apps/web/src/components/help/help-faq-manage-client.tsx',
  'apps/web/src/components/join-requests/admin-review-list.tsx',
  'apps/web/src/components/join-requests/join-request-form.tsx',
  'apps/web/src/components/layout/profile-menu.tsx',
  'apps/web/src/components/maintenance/AssignmentModal.tsx',
  'apps/web/src/components/mobile/MobileFaqManageContent.tsx',
  'apps/web/src/components/mobile/MobileSettingsContent.tsx',
  'apps/web/src/components/onboarding/apartment-wizard.tsx',
  'apps/web/src/components/onboarding/condo-wizard.tsx',
  'apps/web/src/components/onboarding/steps/profile-step.tsx',
  'apps/web/src/components/onboarding/steps/statutory-documents-step.tsx',
  'apps/web/src/components/onboarding/welcome-screen.tsx',
  'apps/web/src/components/pm/BrandingCopyDialog.tsx',
  'apps/web/src/components/pm/BrandingForm.tsx',
  'apps/web/src/components/pm/BulkAnnouncementDialog.tsx',
  'apps/web/src/components/pm/BulkDocumentDialog.tsx',
  'apps/web/src/components/pm/PmDashboardClient.tsx',
  'apps/web/src/components/pm/add-community-modal.tsx',
  'apps/web/src/components/pm/cancel-community-dialog.tsx',
  'apps/web/src/components/residents/import-residents-client.tsx',
  'apps/web/src/components/residents/residents-page-client.tsx',
  'apps/web/src/components/settings/SupportAccessSettings.tsx',
  'apps/web/src/components/settings/account-settings-client.tsx',
  'apps/web/src/components/settings/change-plan-form.tsx',
  'apps/web/src/components/settings/export-button.tsx',
  'apps/web/src/components/settings/notification-preferences.tsx',
  'apps/web/src/components/settings/sms-consent-form.tsx',
  'apps/web/src/components/shared/ResidentSearchCombobox.tsx',
  'apps/web/src/components/shared/UnitSearchCombobox.tsx',
  'apps/web/src/components/signup/signup-form.tsx',
  'apps/web/src/components/signup/subdomain-checker.tsx',
  'apps/web/src/components/signup/verify-email-content.tsx',
  'apps/web/src/components/transparency/transparency-toggle.tsx',
]);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  console.log('🔍 Component / Page API-call Guard (ADR-003)');
  console.log('='.repeat(60));

  const files: string[] = [];
  for (const root of SCAN_ROOTS) {
    walkDirectory(join(repoRoot, root), files);
  }

  const newViolations: Violation[] = [];
  const allowlistedHits = new Set<string>();
  const allowlistedHitDetails: Violation[] = [];

  for (const file of files) {
    const rel = relative(repoRoot, file);
    let content: string;
    try {
      content = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }

    const violations = findViolations(content, rel);
    if (violations.length === 0) continue;

    if (KNOWN_DIRECT_API_CALL_FILES.has(rel)) {
      allowlistedHits.add(rel);
      allowlistedHitDetails.push(...violations);
    } else {
      newViolations.push(...violations);
    }
  }

  // Detect dead allowlist entries — files that no longer have a violation
  // (or no longer exist). Pruning these keeps the debt ledger honest.
  const deadAllowlistEntries: string[] = [];
  for (const entry of KNOWN_DIRECT_API_CALL_FILES) {
    if (!allowlistedHits.has(entry)) {
      deadAllowlistEntries.push(entry);
    }
  }

  console.log(`\nScanned ${files.length} files.`);
  console.log(
    `Allowlist: ${KNOWN_DIRECT_API_CALL_FILES.size} grandfathered files; ` +
      `${allowlistedHitDetails.length} known direct fetches.`,
  );

  if (deadAllowlistEntries.length > 0) {
    console.error(
      `\n❌ ${deadAllowlistEntries.length} file(s) are in KNOWN_DIRECT_API_CALL_FILES ` +
        `but no longer contain a direct \`fetch('/api/v1/*')\`. ` +
        `Remove them from the allowlist:`,
    );
    for (const entry of deadAllowlistEntries) {
      console.error(`  - ${entry}`);
    }
  }

  if (newViolations.length > 0) {
    console.error(
      `\n❌ ${newViolations.length} new direct API call(s) detected outside the allowlist:`,
    );
    for (const v of newViolations) {
      console.error(`  ${v.file}:${v.line}`);
      console.error(`      ${v.excerpt}`);
    }
    console.error(
      '\nADR-003: components and pages must call /api/v1/* through hooks ' +
        '(apps/web/src/hooks/), not via direct fetch. Use `requestJson` from ' +
        '`apps/web/src/lib/request/`. If the call is genuinely server-only ' +
        '(server component or route handler), move it to that layer.',
    );
  }

  const hasErrors = newViolations.length > 0 || deadAllowlistEntries.length > 0;
  if (hasErrors) {
    process.exit(1);
  }

  console.log(
    `\n✅ No new direct API calls in components/pages. ` +
      `${KNOWN_DIRECT_API_CALL_FILES.size} grandfathered files remain — drain over time.`,
  );
}

main();
