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
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { loginAs } from './helpers/dev-login';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PDF = path.join(__dirname, 'fixtures', 'sample.pdf');

/** Demo seed slug with e-sign templates + Violation Acknowledgment. */
const SUNSET_CONDOS_SLUG = 'sunset-condos';

async function assertPdfJsAssetsReachable(page: Page) {
  const [moduleResponse, workerResponse] = await Promise.all([
    page.request.get('/pdfjs/pdf.mjs'),
    page.request.get('/pdfjs/pdf.worker.min.mjs'),
  ]);

  expect(moduleResponse.status()).toBe(200);
  expect(workerResponse.status()).toBe(200);
}

async function expectPdfPreviewCanvas(page: Page, timeout = 30_000) {
  const canvas = page.locator('canvas').first();
  const previewUnavailable = page.getByText(/preview unavailable/i).first();

  await expect
    .poll(
      async () => {
        if (await previewUnavailable.count()) {
          return 'preview_unavailable';
        }

        if (await canvas.count()) {
          return (await canvas.isVisible()) ? 'canvas' : 'pending';
        }

        return 'pending';
      },
      { timeout, message: 'Expected the PDF preview to render a canvas or surface a stable unavailable state.' },
    )
    .toBe('canvas');
}

async function gotoEsignOrSkipForSeedMismatch(
  page: Page,
  communityId: number,
  testInfo: TestInfo,
) {
  const esignPath = `/esign?communityId=${communityId}`;
  const response = await page.request.get(esignPath, { maxRedirects: 0 });
  const redirectLocation = response.headers()['location'] ?? null;
  const responseText = await response.text();

  if (
    redirectLocation?.includes('/dashboard?reason=feature-not-available') ||
    responseText.includes('/dashboard?reason=feature-not-available')
  ) {
    testInfo.skip(
      true,
      // `DEMO_SEED_SYNC_AUTH_USERS=0` was a workaround for the wrapper leaving
      // Supabase pointed at production; the wrapper now redirects Supabase to
      // local and refuses to run otherwise, so the seed is safe with auth sync
      // ON — given local keys. See the script's own usage text.
      'Sunset Condos is not on a hasEsign-enabled plan in this database. Run: scripts/with-env-local-demo-db.sh pnpm seed:demo (supply PROPERTYPRO_LOCAL_SUPABASE_* keys from `supabase status`).',
    );
    return false;
  }

  await page.goto(esignPath, { waitUntil: 'networkidle' });

  const currentUrl = new URL(page.url());
  expect(
    currentUrl.pathname,
    `Expected /esign after CAM login, but landed on ${page.url()} (initial /esign response: ${response.status()}${redirectLocation ? ` -> ${redirectLocation}` : ''})`,
  ).toBe('/esign');

  return true;
}

test.describe.configure({ mode: 'serial' });

test.describe('E-Sign send flow (CAM)', () => {
  test.setTimeout(120_000);

  test('CAM sends Violation Acknowledgment; public signer completes via Type signature', async ({
    page,
  }, testInfo) => {
    const { communityId } = await loginAs(page, 'cam', {
      communitySlug: SUNSET_CONDOS_SLUG,
    });

    if (!(await gotoEsignOrSkipForSeedMismatch(page, communityId, testInfo))) {
      return;
    }

    await page.getByRole('link', { name: /Send Document/i }).click();
    await expect(page.getByRole('heading', { name: /Send Document for Signing/i })).toBeVisible();

    const templateTrigger = page.getByTestId('esign-template-select-trigger');
    await templateTrigger.scrollIntoViewIfNeeded();
    await templateTrigger.click();
    await expect(page.getByPlaceholder('Search templates...')).toBeVisible({
      timeout: 30_000,
    });
    await page.getByPlaceholder('Search templates...').fill('Violation');
    const violationOption = page.locator('[cmdk-item]').filter({
      has: page.getByText('Violation Acknowledgment', { exact: true }),
    });
    try {
      await expect(violationOption).toBeVisible({ timeout: 60_000 });
    } catch {
      testInfo.skip(
        true,
        'No Violation Acknowledgment template in UI. Run: scripts/with-env-local-demo-db.sh pnpm seed:demo (supply PROPERTYPRO_LOCAL_SUPABASE_* keys from `supabase status`).',
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

    await assertPdfJsAssetsReachable(page);
    await expect(page.getByText(/Signing as:/i)).toBeVisible();
    await expect(page.getByText(/tenant\.one@sunset\.local/i)).toBeVisible();
    await expectPdfPreviewCanvas(page);
    await expect(page.getByText('PDF Document Preview')).toHaveCount(0);

    await page.getByPlaceholder('Owner Name').fill('Tenant One');
    await page.getByPlaceholder('Unit Number').fill('101');

    await page.locator('[title="Correction Deadline"]').click();
    await page.locator('[title="Date"]').click();

    await page.getByRole('button', { name: /I acknowledge receipt of this violation notice/i }).click();
    await page.getByRole('button', { name: /I agree to take corrective action/i }).click();

    await page.getByRole('button', { name: /Owner Signature/i }).click();
    await page.getByRole('tab', { name: 'Type' }).click();
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

    await expectPdfPreviewCanvas(page);
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

    const seededDoc = page.getByText('Sunset Condos Annual Budget').first();
    await expect(seededDoc).toBeVisible();
    await seededDoc.click();
    await assertPdfJsAssetsReachable(page);
    await expectPdfPreviewCanvas(page);
    await expect(page.locator('iframe')).toHaveCount(0);

    await page.getByRole('button', { name: /Open upload panel/i }).click();

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
    await page.getByText(uniqueTitle).click();
    await expectPdfPreviewCanvas(page);
    await expect(page.locator('iframe')).toHaveCount(0);

    await loginAs(page, 'tenant', { communitySlug: SUNSET_CONDOS_SLUG });
    await page.goto(`/mobile/documents?communityId=${communityId}`, {
      waitUntil: 'networkidle',
    });

    await expect(page.getByText(uniqueTitle)).toBeVisible();
  });
});
