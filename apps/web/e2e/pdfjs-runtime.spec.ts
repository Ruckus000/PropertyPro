import { expect, test, type Page } from '@playwright/test';
import { PDFJS_SMOKE_TEST_PDF_BASE64 } from '../src/lib/pdfjs/fixtures';

const PDF_LOAD_ERROR_MESSAGE = "This PDF preview couldn't be loaded. Please try again.";

async function expectPdfViewerCanvas(page: Page) {
  await expect(page.locator('canvas').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
}

test.describe('PDF.js runtime', () => {
  test('loads the public PDF.js module and worker in a production build', async ({ page }) => {
    await page.goto('/auth/login', { waitUntil: 'networkidle' });

    const moduleResponsePromise = page.waitForResponse((response) => (
      response.url().includes('/pdfjs/pdf.mjs') && response.status() === 200
    ));
    const workerResponsePromise = page.waitForResponse((response) => (
      response.url().includes('/pdfjs/pdf.worker.min.mjs') && response.status() === 200
    ));

    const runtimeResultPromise = page.evaluate(async (pdfBase64) => {
      // Runtime URL served by the app, not a resolvable module specifier —
      // this import is evaluated in the BROWSER via page.evaluate, so there is
      // nothing for tsc to resolve at build time.
      // @ts-expect-error -- browser-side dynamic import of a served asset
      const pdfjs = await import('/pdfjs/pdf.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';

      const binary = atob(pdfBase64);
      const pdfData = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const loadingTask = pdfjs.getDocument({ data: pdfData });
      const pdf = await loadingTask.promise;
      const pdfPage = await pdf.getPage(1);
      const viewport = pdfPage.getViewport({ scale: 1 });

      await pdf.destroy();

      return {
        numPages: pdf.numPages,
        workerSrc: pdfjs.GlobalWorkerOptions.workerSrc,
        viewportWidth: viewport.width,
      };
    }, PDFJS_SMOKE_TEST_PDF_BASE64);

    const [moduleResponse, workerResponse, runtimeResult] = await Promise.all([
      moduleResponsePromise,
      workerResponsePromise,
      runtimeResultPromise,
    ]);

    expect(moduleResponse.status()).toBe(200);
    expect(workerResponse.status()).toBe(200);
    expect(runtimeResult.numPages).toBe(1);
    expect(runtimeResult.viewportWidth).toBe(612);
    expect(runtimeResult.workerSrc).toContain('/pdfjs/pdf.worker.min.mjs');

    const missingResponse = await page.request.get('/pdfjs/missing.mjs');
    expect(missingResponse.status()).toBe(404);
  });

  test('degrades cleanly when the PDF.js module bootstrap request fails', async ({ page }) => {
    await page.route('**/pdfjs/pdf.mjs*', async (route) => {
      await route.abort('failed');
    });

    await page.goto('/pdfjs-test', { waitUntil: 'networkidle' });

    await expect(page.getByText(PDF_LOAD_ERROR_MESSAGE)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(page.getByText(/Failed to fetch dynamically imported module/i)).toHaveCount(0);
  });

  test('recovers after a transient module bootstrap failure when the user retries', async ({ page }) => {
    let moduleFailuresRemaining = 1;

    await page.route('**/pdfjs/pdf.mjs*', async (route) => {
      if (moduleFailuresRemaining > 0) {
        moduleFailuresRemaining -= 1;
        await route.abort('failed');
        return;
      }

      await route.continue();
    });

    await page.goto('/pdfjs-test', { waitUntil: 'networkidle' });

    await expect(page.getByText(PDF_LOAD_ERROR_MESSAGE)).toBeVisible();

    const moduleRecoveryPromise = page.waitForResponse((response) => (
      response.url().includes('/pdfjs/pdf.mjs') && response.status() === 200
    ));

    await page.getByRole('button', { name: 'Retry' }).click();
    await moduleRecoveryPromise;

    await expectPdfViewerCanvas(page);
    await expect(page.getByText(PDF_LOAD_ERROR_MESSAGE)).toHaveCount(0);
  });

  test('surfaces malformed PDF bytes with stable error copy', async ({ page }) => {
    await page.goto('/pdfjs-test?variant=invalid', { waitUntil: 'networkidle' });

    await expect(page.getByText(PDF_LOAD_ERROR_MESSAGE)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(page.getByText(/Invalid PDF/i)).toHaveCount(0);
  });
});
