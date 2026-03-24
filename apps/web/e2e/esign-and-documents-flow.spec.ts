/**
 * E-Sign + library documents E2E (dev server + agent-login + seeded demo data).
 *
 * Run from repo root (do not pass --filter to Playwright; root test:e2e already targets web):
 *   pnpm test:e2e -- e2e/esign-and-documents-flow.spec.ts
 *   pnpm test:e2e:esign
 * Or: cd apps/web && pnpm test:e2e e2e/esign-and-documents-flow.spec.ts
 *
 * Requires: NODE_ENV=development, Supabase from .env.local, `pnpm seed:demo`.
 * Not run in CI by default (see playwright.config.ts + root package.json).
 *
 * If the template dropdown never opens, a stale process on port 3000 may be serving
 * an old bundle; stop it so Playwright can start `pnpm dev:e2e` with current UI.
 *
 * Library upload uses board_president: CAM is not in ELEVATED_ROLES for document
 * library upload (see packages/shared/src/access-policies.ts — isElevatedRole).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/dev-login';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PDF = path.join(__dirname, 'fixtures', 'sample.pdf');

/** Demo seed slug with e-sign templates + Violation Acknowledgment. */
const SUNSET_CONDOS_SLUG = 'sunset-condos';

test.describe.configure({ mode: 'serial' });

test.describe('E-Sign send flow (CAM)', () => {
  test.setTimeout(120_000);

  test('CAM sends Violation Acknowledgment; public signer completes via Type signature', async ({
    page,
  }, testInfo) => {
    const { communityId } = await loginAs(page, 'cam', {
      communitySlug: SUNSET_CONDOS_SLUG,
    });

    await page.goto(`/esign?communityId=${communityId}`, { waitUntil: 'networkidle' });

    await page.getByRole('link', { name: /Send Document/i }).click();
    await expect(page.getByRole('heading', { name: /Send Document for Signing/i })).toBeVisible();

    const templateTrigger = page.getByTestId('esign-template-select-trigger');
    await templateTrigger.scrollIntoViewIfNeeded();
    await templateTrigger.click();
    await expect(page.getByPlaceholder('Search templates...')).toBeVisible({
      timeout: 30_000,
    });
    await page.getByPlaceholder('Search templates...').fill('Violation');
    const violationOption = page.getByRole('button', { name: 'Violation Acknowledgment' });
    try {
      await expect(violationOption).toBeVisible({ timeout: 60_000 });
    } catch {
      testInfo.skip(
        true,
        'No Violation Acknowledgment template in UI. Run: scripts/with-env-local.sh pnpm seed:demo',
      );
      return;
    }
    await violationOption.click();

    await page.getByPlaceholder('Full name').fill('Tenant One');
    await page.getByPlaceholder('Email address').fill('tenant.one@sunset.local');

    await page.getByRole('button', { name: /Review & Send/i }).click();

    const createResponsePromise = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        r.url().includes('/api/v1/esign/submissions') &&
        r.ok(),
      { timeout: 120_000 },
    );

    await page.getByRole('button', { name: /Send for Signing/i }).click();
    const createResp = await createResponsePromise;
    const createJson = (await createResp.json()) as {
      data: {
        submission: { id: number; externalId: string };
        signers: Array<{ slug: string | null }>;
      };
    };
    const submissionId = createJson.data.submission.id;
    const externalId = createJson.data.submission.externalId;
    const slug = createJson.data.signers[0]?.slug;
    expect(submissionId).toBeTruthy();
    expect(externalId).toBeTruthy();
    expect(slug).toBeTruthy();

    await expect(page.getByRole('heading', { name: /^E-Sign$/i })).toBeVisible();

    await page.goto(`/sign/${externalId}/${slug}`, { waitUntil: 'networkidle' });

    await expect(page.getByText(/Signing as:/i)).toBeVisible();
    await expect(page.getByText(/tenant\.one@sunset\.local/i)).toBeVisible();
    await expect(page.locator('canvas').first()).toBeVisible();
    await expect(page.getByText('PDF Document Preview')).toHaveCount(0);

    await page.getByPlaceholder('Owner Name').fill('Tenant One');
    await page.getByPlaceholder('Unit Number').fill('101');

    await page.locator('[title="Correction Deadline"]').click();
    await page.locator('[title="Date"]').click();

    await page.getByRole('button', { name: /I acknowledge receipt of this violation notice/i }).click();
    await page.getByRole('button', { name: /I agree to take corrective action/i }).click();

    await page.getByRole('button', { name: /Owner Signature/i }).click();
    // SignatureCapture uses <button> for Draw | Type | Upload, not role="tab"
    await page.getByRole('button', { name: 'Type' }).click();
    await page.getByPlaceholder(/Type your full name/i).fill('Tenant One');
    await page.getByRole('button', { name: 'Confirm' }).click();

    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Finish' }).click();

    await expect(page.getByRole('heading', { name: /Signing complete/i })).toBeVisible();

    await loginAs(page, 'cam', {
      communitySlug: SUNSET_CONDOS_SLUG,
    });
    await page.goto(`/esign/submissions/${submissionId}?communityId=${communityId}`, {
      waitUntil: 'networkidle',
    });

    await expect(page.locator('canvas').first()).toBeVisible();
    await expect(page.getByText('PDF preview unavailable')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Download Signed Document/i }),
    ).toBeVisible();
  });
});

test.describe('Library documents (board admin → tenant)', () => {
  test.setTimeout(120_000);

  test('board admin uploads a PDF to the library; tenant sees it on mobile documents', async ({
    page,
  }) => {
    const { communityId } = await loginAs(page, 'board_president', {
      communitySlug: SUNSET_CONDOS_SLUG,
    });
    const uniqueTitle = `E2E Library Doc ${Date.now()}`;

    await page.goto(`/communities/${communityId}/documents`, {
      waitUntil: 'networkidle',
    });

    await expect(
      page.locator('#main-content').getByRole('heading', { name: /^Documents$/i }),
    ).toBeVisible();

    // Category pills load async; tenant-visible categories include Rules & Regulations.
    const rulesTab = page.getByRole('button', { name: /^Rules & Regulations$/i });
    await expect(rulesTab).toBeVisible({ timeout: 60_000 });
    await rulesTab.click();

    await page.getByRole('button', { name: /Upload Document/i }).first().click();

    await page.setInputFiles('input[type="file"][accept]', FIXTURE_PDF);

    await page.getByPlaceholder('Document title').fill(uniqueTitle);

    const createDocResponse = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        r.url().includes('/api/v1/documents') &&
        r.ok(),
      { timeout: 120_000 },
    );

    await page.getByRole('button', { name: /^Upload Document$/i }).click();
    const docResp = await createDocResponse;
    expect(docResp.ok(), `POST /api/v1/documents failed: ${docResp.status()}`).toBeTruthy();

    await expect(page.getByText('Uploading...')).toBeHidden({ timeout: 120_000 });
    await expect(page.getByText(uniqueTitle)).toBeVisible();

    await loginAs(page, 'tenant', { communitySlug: SUNSET_CONDOS_SLUG });
    await page.goto(`/mobile/documents?communityId=${communityId}`, {
      waitUntil: 'networkidle',
    });

    await expect(page.getByText(uniqueTitle)).toBeVisible();
  });
});
