/**
 * First-run onboarding journeys — BOTH BLOCKS ARE `test.fixme`.
 *
 * These tests describe a wizard that was never built. They were authored from a
 * design document (`specs/phase-2-multi-tenancy/39-condo-onboarding-wizard.md`),
 * not from the app, so they have never been capable of passing:
 *
 *   - They wait on `data-testid="condo-onboarding-wizard"` /
 *     `"apartment-onboarding-wizard"` with `data-hydrated="true"`. Neither test id
 *     has ever existed in `apps/web/src` (`git log -S` finds only the spec and the
 *     design doc), and `data-hydrated` appears on exactly one unrelated component
 *     app-wide (`components/help/article-feedback.tsx`).
 *   - They drive a 4-/5-step flow (statutory documents → profile → branding →
 *     units → rules → invite). What ships is a **2-step** wizard for BOTH
 *     community types — "Community Profile" → "Compliance Preview"
 *     (`components/onboarding/condo-wizard.tsx:29`,
 *     `components/onboarding/apartment-wizard.tsx:32`). The app contains exactly
 *     two step components: `steps/profile-step.tsx` and `compliance-preview.tsx`.
 *     The API contracts agree — `MAX_STEP_INDEX = 1`
 *     (`app/api/v1/onboarding/condo/contract.ts:12`).
 *
 * Marking `fixme` rather than deleting keeps the coverage gap visible in the
 * suite. Rewriting these against the shipped 2-step flow is a from-scratch spec,
 * not an edit, and is a product decision about what first-run onboarding should
 * guarantee — deliberately not taken here.
 *
 * NOT a blocker: the `/dev/reset-onboarding` fixture below is still correct. It
 * writes `onboarding_wizard_state` keyed `(community_id, wizard_type)` with
 * `last_completed_step = NULL`, which is exactly what the shipped
 * `GET /api/v1/onboarding/{condo,apartment}` reads. It needs no change.
 *
 * See `docs/audits/2026-08-03-e2e-inventory.md` (eighth addendum).
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { loginAs } from './helpers/dev-login';

const HOA_WIZARD_SLUG = 'sunset-condos';
const APARTMENT_WIZARD_SLUG = 'sunset-ridge-apartments';
test.describe.configure({ mode: 'serial' });

type WizardType = 'condo' | 'apartment';
type MutationMethod = 'PATCH' | 'POST';

async function resetWizardFixture(
  request: APIRequestContext,
  communitySlug: string,
  wizardType: WizardType,
): Promise<void> {
  const response = await request.post('/dev/reset-onboarding', {
    data: { slug: communitySlug, wizardType },
    headers: { accept: 'application/json' },
  });
  expect(response.ok()).toBe(true);
}

async function waitForOnboardingMutation(
  page: Page,
  wizardType: WizardType,
  method: MutationMethod,
): Promise<void> {
  const response = await page.waitForResponse(
    (candidate) =>
      candidate.url().includes(`/api/v1/onboarding/${wizardType}`)
      && candidate.request().method() === method,
  );
  expect(response.ok()).toBe(true);
}

async function fillProfileStep(
  page: Page,
  labelSuffix: string,
  wizardType: WizardType,
): Promise<void> {
  await expect(page.getByRole('heading', { name: /community profile/i })).toBeVisible();
  await page.getByLabel(/community name/i).fill(`E2E ${labelSuffix} Community`);
  await page.getByLabel(/street address/i).fill('100 Audit Lane');
  await page.getByLabel(/^city$/i).fill('Miami');
  await page.getByLabel(/^state$/i).fill('FL');
  await page.getByLabel(/zip code/i).fill('33101');
  const patchPromise = waitForOnboardingMutation(page, wizardType, 'PATCH');
  await page.getByRole('button', { name: /^Next$/i }).click();
  await patchPromise;
}

async function waitForWizardHydration(
  page: Page,
  testId: 'condo-onboarding-wizard' | 'apartment-onboarding-wizard',
): Promise<void> {
  await expect(page.getByTestId(testId)).toHaveAttribute('data-hydrated', 'true');
}

async function completeBrandingStep(page: Page, wizardType: WizardType): Promise<void> {
  await expect(page.getByRole('heading', { name: /choose your branding/i })).toBeVisible({
    timeout: 15_000,
  });
  const patchPromise = waitForOnboardingMutation(page, wizardType, 'PATCH');
  await page.getByRole('button', { name: /^Continue$/i }).click();
  await patchPromise;
}

async function completeUnitsStep(
  page: Page,
  unitPrefix: string,
  wizardType: WizardType,
  options?: { awaitCompletion?: boolean },
): Promise<void> {
  await expect(page.getByRole('heading', { name: /add units/i })).toBeVisible({
    timeout: 15_000,
  });
  const uniqueUnitNumber = `${unitPrefix}-${Date.now()}`;
  await page.locator('tbody tr').first().locator('input[type="text"]').first().fill(uniqueUnitNumber);
  const patchPromise = waitForOnboardingMutation(page, wizardType, 'PATCH');
  const completionPromise = options?.awaitCompletion
    ? waitForOnboardingMutation(page, wizardType, 'POST')
    : Promise.resolve();
  await page.getByRole('button', { name: /^Next$/i }).click();
  await patchPromise;
  await completionPromise;
}

async function skipRulesStep(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: /upload rules document/i })).toBeVisible({
    timeout: 15_000,
  });
  const patchPromise = waitForOnboardingMutation(page, 'apartment', 'PATCH');
  await page.getByRole('button', { name: /^Skip Step$/i }).click();
  await patchPromise;
}

async function skipInviteStep(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: /invite your first resident/i })).toBeVisible({
    timeout: 15_000,
  });
  const patchPromise = waitForOnboardingMutation(page, 'apartment', 'PATCH');
  const completionPromise = waitForOnboardingMutation(page, 'apartment', 'POST');
  await page.getByRole('button', { name: /^Skip Invite$/i }).click();
  await patchPromise;
  await completionPromise;
}

test.describe('first-run onboarding journeys', () => {
  test.setTimeout(150_000);

  test.beforeEach(async ({ request }, testInfo) => {
    if (testInfo.title.includes('condo/HOA')) {
      await resetWizardFixture(request, HOA_WIZARD_SLUG, 'condo');
      return;
    }

    await resetWizardFixture(request, APARTMENT_WIZARD_SLUG, 'apartment');
  });

  // fixme: drives a 4-step flow; the shipped condo wizard has 2 steps and no
  // `condo-onboarding-wizard` test id. See the file header.
  test.fixme('condo/HOA first-run wizard is reachable and completable for a board admin', async ({ page }) => {
    const { communityId } = await loginAs(page, 'board_president', {
      communitySlug: HOA_WIZARD_SLUG,
      skipPortalNav: true,
    });

    await page.goto(`/onboarding/condo?communityId=${communityId}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page).toHaveURL(new RegExp(`/onboarding/condo\\?communityId=${communityId}`));
    await waitForWizardHydration(page, 'condo-onboarding-wizard');

    await expect(page.getByRole('heading', { name: /statutory documents/i })).toBeVisible();
    await page.getByRole('button', { name: /continue|skip remaining & continue/i }).click();

    await fillProfileStep(page, 'Condo', 'condo');
    await completeBrandingStep(page, 'condo');
    await completeUnitsStep(page, 'C', 'condo', { awaitCompletion: true });

    await expect(page).toHaveURL(new RegExp(`/dashboard\\?communityId=${communityId}`), {
      timeout: 15_000,
    });
  });

  // fixme: drives a 5-step flow; the shipped apartment wizard has the same 2
  // steps as condo and no `apartment-onboarding-wizard` test id. See the header.
  test.fixme('apartment first-run wizard is reachable and completable for site manager', async ({ page }) => {
    const { communityId } = await loginAs(page, 'site_manager', {
      communitySlug: APARTMENT_WIZARD_SLUG,
      skipPortalNav: true,
    });

    await page.goto(`/onboarding/apartment?communityId=${communityId}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page).toHaveURL(new RegExp(`/onboarding/apartment\\?communityId=${communityId}`));
    await waitForWizardHydration(page, 'apartment-onboarding-wizard');

    await fillProfileStep(page, 'Apartment', 'apartment');
    await completeBrandingStep(page, 'apartment');
    await completeUnitsStep(page, 'A', 'apartment');
    await skipRulesStep(page);
    await skipInviteStep(page);

    await expect(page).toHaveURL(new RegExp(`/dashboard/apartment\\?communityId=${communityId}`), {
      timeout: 15_000,
    });
  });
});
