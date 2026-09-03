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
 * If the template dropdown never opens, the first thing to suspect is a click
 * dispatched BEFORE React hydrated the trigger — the event is swallowed and no
 * timeout can recover it. That was the measured cause here; use
 * `clickWhenHydrated` (helpers/hydration.ts). A stale process on port 3000
 * serving an old bundle produces the same symptom and is worth ruling out
 * second, but it was not the cause of this spec's long-standing failure.
 *
 * Library upload uses board_president: CAM is not in ELEVATED_ROLES for document
 * library upload (see packages/shared/src/access-policies.ts — isElevatedRole).
 *
 * Navigation uses `waitUntil: 'domcontentloaded'`, never `'networkidle'`. Every
 * page here renders a PDF.js preview, which keeps fetching (worker, font and
 * range requests) well past any idle window — `networkidle` did not settle
 * inside the 120s test timeout and failed in `page.goto` before a single
 * assertion ran. The assertions below already auto-wait, and
 * `expectPdfPreviewCanvas` polls for a real terminal state, so nothing is lost.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { loginAs } from './helpers/dev-login';
import { clickWhenHydrated } from './helpers/hydration';

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

  await page.goto(esignPath, { waitUntil: 'domcontentloaded' });

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

    // The single-page form became a four-step builder. The E-Sign screen's own
    // link still lands on it, at step 1.
    await page.getByRole('link', { name: /Send Document/i }).click();
    // `exact` matters: without it this also matches the global search button,
    // whose aria-label is "Search documents, residents, meetings".
    await expect(
      page.getByRole('button', { name: 'Document', exact: true }),
    ).toBeVisible({ timeout: 30_000 });

    // Resolve the template through the API rather than driving the templates
    // list. The "Send for Signing" href is covered by
    // `__tests__/esign/template-detail-client.test.tsx`; what this spec is here
    // to exercise is the builder and everything downstream of it.
    const templatesResp = await page.request.get(
      `/api/v1/esign/templates?communityId=${communityId}`,
    );
    const templatesJson = (await templatesResp.json()) as {
      data?: Array<{ id: number; name: string }>;
    };
    const violationTemplate = (templatesJson.data ?? []).find(
      (t) => t.name === 'Violation Acknowledgment',
    );
    if (!violationTemplate) {
      testInfo.skip(
        true,
        'No Violation Acknowledgment template in UI. Run: scripts/with-env-local-demo-db.sh pnpm seed:demo (supply PROPERTYPRO_LOCAL_SUPABASE_* keys from `supabase status`).',
      );
      return;
    }

    await page.goto(
      `/esign/submissions/new?communityId=${communityId}&templateId=${violationTemplate.id}`,
      { waitUntil: 'domcontentloaded' },
    );

    // Seeded from a template, the builder opens on Recipients — the one thing a
    // template cannot supply. The role arrives filled in; the person does not.
    // Waiting for the seeded value also waits out hydration, since this step is
    // only rendered by a client effect.
    await expect(page.getByLabel(/^Role/)).toHaveValue('owner', { timeout: 30_000 });

    await page.getByPlaceholder('Alice Alvarez').fill('Tenant One');
    await page.getByPlaceholder('alice@example.com').fill('tenant.one@sunset.local');

    // Recipients → Place fields → Review. The template brings its own fields,
    // so there is nothing to place by hand.
    // `exact` again: in a dev server, "Next" also matches the Next.js Dev Tools
    // button, whose aria-label is "Open Next.js Dev Tools".
    const nextButton = page.getByRole('button', { name: 'Next', exact: true });
    await clickWhenHydrated(nextButton);
    await clickWhenHydrated(nextButton);
    await expect(page.getByText('tenant.one@sunset.local')).toBeVisible({
      timeout: 30_000,
    });

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

    await page.goto(`/sign/${externalId}/${slug}`, { waitUntil: 'domcontentloaded' });

    await assertPdfJsAssetsReachable(page);
    // `/sign/[externalId]/[slug]` is a route this run has not compiled yet, and
    // `domcontentloaded` returns before it has rendered. Measured: this assertion
    // passes comfortably when the spec runs alone but fails DETERMINISTICALLY at
    // the 5s default in a full-suite run, where the dev server has already
    // compiled ~20 other routes — it is first-compile latency, not missing
    // content. Neighbouring assertions in this file already allow 30-60s for the
    // same reason. The assertion itself is unchanged.
    await expect(page.getByText(/Signing as:/i)).toBeVisible({ timeout: 30_000 });
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
      waitUntil: 'domcontentloaded',
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
      waitUntil: 'domcontentloaded',
    });

    await expect(
      page.locator('#main-content').getByRole('heading', { name: /^Documents$/i }),
    ).toBeVisible();

    // Category pills load async.
    //
    // The pill is "Governing Documents", NOT "Rules & Regulations". No category
    // by that name exists — `document_categories` has `Rules` (0 documents) and
    // `Governing Documents` (13), and the doc this test goes on to open,
    // "Sunset Condos Annual Budget", is itself in `Governing Documents`. So the
    // old locator asked for a pill that could never render and then burned its
    // full 60s budget; the assertion was self-inconsistent with the very next
    // line.
    const categoryTab = page.getByRole('button', { name: /^Governing Documents$/i });
    await expect(categoryTab).toBeVisible({ timeout: 60_000 });
    await categoryTab.click();

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

    // Scoped to the submit BUTTON, not bare text. `document-upload-area.tsx`
    // renders "Uploading..." twice while an upload is in flight — once as a
    // `<span>` (:281) and once as the button label (:300) — so
    // `getByText('Uploading...')` matched two elements and threw a strict mode
    // violation.
    //
    // It failed only on slow machines, which is what made it look flaky rather
    // than wrong: when the upload finishes quickly, both nodes are already gone
    // by the time this line runs, the locator matches ZERO elements, and
    // `toBeHidden` passes vacuously. CI is slow enough to catch them both alive.
    await expect(page.getByRole('button', { name: 'Uploading...' })).toBeHidden({
      timeout: 120_000,
    });
    await expect(page.getByText(uniqueTitle)).toBeVisible();
    await page.getByText(uniqueTitle).click();
    await expectPdfPreviewCanvas(page);
    await expect(page.locator('iframe')).toHaveCount(0);

    await loginAs(page, 'tenant', { communitySlug: SUNSET_CONDOS_SLUG });
    await page.goto(`/mobile/documents?communityId=${communityId}`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(page.getByText(uniqueTitle)).toBeVisible();
  });
});
