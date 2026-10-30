/**
 * First-run onboarding — a fresh community, end to end (onboarding audit F11,
 * `docs/audits/2026-10-05-onboarding/01-evidence-brief.md`).
 *
 * This file used to hold two `test.fixme` blocks written against a 4-/5-step
 * wizard that never shipped. They are replaced by the path a founder ACTUALLY
 * takes today, verified against the app rather than a design doc:
 *
 *   founder signs in → dashboard setup checklist → adds a unit → imports a
 *   roster → posts a document → invites a resident → the resident accepts,
 *   lands signed in, and opens that document.
 *
 * What it deliberately does NOT do:
 *
 *   - A setup wizard. A 2-step one existed at `/onboarding/condo` and
 *     `/onboarding/apartment`, but nothing routed a founder there (signup,
 *     "Add community" and the agent login all land on the dashboard), so it
 *     was deleted. The dashboard checklist below IS the first run.
 *   - Self-serve signup and PM "Add community". Both create the community from
 *     a Stripe webhook; they are owned by `stripe-e2e.yml` and need its secrets.
 *     That also rules out the PORTFOLIO branch (a PM adding a second community
 *     goes through the same Stripe add-to-group checkout), so it has no block
 *     here.
 *
 * A FRESH community, not a seeded one. Every seeded community is already set
 * up (units, documents, members, a completed wizard row), so none can show a
 * founder's first run, and driving one would mutate data other specs read.
 * `scripts/agent-fixture.ts community` is the only Stripe-free path that runs
 * the real `createCommunityForPm` — the same function the provisioning paths
 * use — so the community gets its real default categories and checklist. It
 * refuses anything but loopback Supabase/Postgres and `agent-*` slugs. Each
 * attempt creates its own community, so a retry never sees the first
 * attempt's leftovers.
 *
 * The invitation token is read from the database with the service-role key
 * (the same way `helpers/stripe-e2e.ts` reads provisioning state). In
 * development without `RESEND_API_KEY` the email is kept in an in-memory inbox
 * inside the dev server, so no test process can read the link any other way —
 * and the API deliberately never returns it.
 *
 * Needs: NODE_ENV=development, a local Supabase stack (Auth + Storage),
 * `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL`
 * in the Playwright process env. `.github/workflows/e2e.yml` exports all
 * three; locally run it through `scripts/agent-env.sh exec`.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import { clickWhenHydrated, waitForHydrated } from './helpers/hydration';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const FIXTURE_PDF = path.join(__dirname, 'fixtures', 'sample.pdf');
// Meets PASSWORD_POLICY: mixed case, a digit and a symbol.
const RESIDENT_PASSWORD = 'E2e-Passw0rd!';

type CommunityType = 'condo_718' | 'apartment';

interface FreshCommunity {
  communityId: number;
  slug: string;
  name: string;
  founderEmail: string;
}

function runSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Create a brand-new community and its founder through the real create path. */
function createFreshCommunity(type: CommunityType): FreshCommunity {
  for (const name of ['DATABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!process.env[name]) {
      throw new Error(
        `${name} is not set. This spec creates its own community against the local stack; `
          + 'run it through scripts/agent-env.sh exec, or in the e2e workflow, which exports it.',
      );
    }
  }
  const suffix = runSuffix();
  const slug = `agent-e2e-${type === 'apartment' ? 'apt' : 'condo'}-${suffix}`;
  const name = `E2E First Run ${type === 'apartment' ? 'Apartments' : 'Condos'} ${suffix}`;
  const founderEmail = `founder-${suffix}@agent.local`;

  const stdout = execFileSync(
    'pnpm',
    [
      'exec', 'tsx', '--tsconfig', 'apps/web/tsconfig.json', 'scripts/agent-fixture.ts', 'community',
      '--slug', slug,
      '--type', type,
      '--name', name,
      '--root-email', founderEmail,
      '--root-name', 'First Run Founder',
    ],
    {
      cwd: REPO_ROOT,
      // The fixture CLI refuses to run without this flag; its loopback-only
      // check on the Supabase and Postgres URLs is what actually keeps it off
      // any shared database.
      env: { ...process.env, PROPERTYPRO_AGENT_SANDBOX: '1' },
      encoding: 'utf8',
      timeout: 120_000,
    },
  );
  const json = JSON.parse(stdout.slice(stdout.indexOf('{'))) as { ok: boolean; communityId: number };
  expect(json.ok).toBe(true);
  return { communityId: json.communityId, slug, name, founderEmail };
}

/** Sign the page in as a fixture user and open their portal. */
async function signInAs(page: Page, email: string, communityId: number): Promise<string> {
  const response = await page.request.get(
    `/dev/agent-login?email=${encodeURIComponent(email)}&communityId=${communityId}`,
    { headers: { accept: 'application/json' } },
  );
  expect(response.ok(), `agent-login for ${email}: ${response.status()} ${await response.text()}`).toBe(true);
  const { portal } = (await response.json()) as { portal: string };
  await page.goto(portal, { waitUntil: 'domcontentloaded' });
  return portal;
}

function serviceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** The newest unconsumed invitation for this person in this community. */
async function readInvitationToken(email: string, communityId: number): Promise<string> {
  const db = serviceRoleClient();
  const user = await db.from('users').select('id').eq('email', email).single();
  expect(user.error, `users lookup for ${email}`).toBeNull();
  const invitation = await db
    .from('invitations')
    .select('token')
    .eq('user_id', (user.data as { id: string }).id)
    .eq('community_id', communityId)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  expect(invitation.error, `invitation lookup for ${email}`).toBeNull();
  return (invitation.data as { token: string }).token;
}

/**
 * Resolve once React owns the invite form. Its submit button has no click
 * handler (the form handles submit), so `waitForHydrated` cannot be used, and
 * typing into the server-rendered inputs before hydration is lost.
 */
async function waitForInviteFormHydrated(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.getByTestId('set-password-form').evaluate((el) => {
          const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
          const props = key ? (el as unknown as Record<string, { onSubmit?: unknown }>)[key] : null;
          return typeof props?.onSubmit === 'function';
        }),
      { timeout: 30_000, message: 'React never attached the invite form submit handler' },
    )
    .toBe(true);
}

/** Poll the founder's checklist until these items report complete. */
async function expectChecklistComplete(page: Page, communityId: number, keys: string[]): Promise<void> {
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`/api/v1/onboarding/checklist?communityId=${communityId}`);
        if (!res.ok()) return `HTTP ${res.status()}`;
        const { data } = (await res.json()) as { data: Array<{ itemKey: string; completedAt: string | null }> };
        return keys.filter((key) => !data.some((item) => item.itemKey === key && item.completedAt));
      },
      // Completion is a fire-and-forget write after each mutation's response.
      { timeout: 20_000, message: `checklist items still open for community ${communityId}` },
    )
    .toEqual([]);
}

test.describe('first-run onboarding: a fresh community', () => {
  test('a founder sets up a condo and their first resident gets in', async ({ page, browser }) => {
    test.setTimeout(300_000);
    const community = createFreshCommunity('condo_718');
    const { communityId } = community;
    const suffix = community.slug.split('-').pop()!;
    const residentEmail = `resident-${suffix}@agent.local`;
    const residentName = `Pat Resident ${suffix}`;
    const documentTitle = `First Run Declaration ${suffix}`;

    // ── 1. The founder lands on the dashboard: the website card, then the checklist ──
    // A new community's site is live from day one, so the "Your website is live"
    // card leads and the checklist sits below it in its secondary form.
    const portal = await signInAs(page, community.founderEmail, communityId);
    expect(portal).toBe(`/dashboard?communityId=${communityId}`);
    await expect(page.getByRole('region', { name: 'Your website is live' })).toBeVisible({
      timeout: 60_000,
    });
    const checklist = page.getByRole('region', { name: `Setup checklist for ${community.name}` });
    await expect(checklist.getByRole('heading', { name: 'Strengthen your community' })).toBeVisible();
    await expect(checklist.getByText(/^0 of \d+ complete$/)).toBeVisible();

    // ── 2. Add a unit, starting from the checklist's own action ───────────
    const unitsRow = checklist.getByRole('listitem').filter({ hasText: 'Add your units' });
    await clickWhenHydrated(unitsRow.getByRole('button', { name: 'Add' }));
    // First visits compile on demand under `next dev`; give navigations room.
    await expect(page).toHaveURL(/\/dashboard\/directory\?.*tab=units/, { timeout: 60_000 });
    await clickWhenHydrated(page.getByRole('button', { name: 'Add unit' }).first());
    const unitDialog = page.getByRole('dialog', { name: 'Add a unit' });
    await unitDialog.getByLabel(/Unit number/).fill('101');
    const unitCreated = page.waitForResponse(
      (r) => r.url().includes('/api/v1/units') && r.request().method() === 'POST',
    );
    await unitDialog.getByRole('button', { name: 'Add unit' }).click();
    expect((await unitCreated).ok()).toBe(true);
    await expect(unitDialog).toBeHidden();

    // ── 3. Import the roster: preview, then import ─────────────────────────
    await page.goto(`/dashboard/import-residents?communityId=${communityId}`, { waitUntil: 'domcontentloaded' });
    // A file set before hydration lands on server markup with no change
    // handler, and nothing happens. Wait for React to own the page first.
    await waitForHydrated(page.getByRole('button', { name: 'Download CSV template' }));
    await page.locator('input[type="file"][accept=".csv"]').setInputFiles({
      name: 'roster.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(`name,email,role,unit_number\n${residentName},${residentEmail},owner,101\n`),
    });
    const importButton = page.getByRole('button', { name: /^Import 1 Residents?$/ });
    await expect(importButton).toBeVisible({ timeout: 30_000 });
    await clickWhenHydrated(importButton);
    await expect(page.getByText(/1 resident(s)? imported successfully/)).toBeVisible({ timeout: 30_000 });

    // ── 4. Post a governing document residents can read ────────────────────
    await page.goto(`/communities/${communityId}/documents`, { waitUntil: 'domcontentloaded' });
    await clickWhenHydrated(page.getByRole('button', { name: /^Governing Documents$/i }));
    await clickWhenHydrated(page.getByRole('button', { name: /Open upload panel/i }));
    await page.setInputFiles('input[type="file"][accept]', FIXTURE_PDF);
    await page.getByLabel('Title', { exact: true }).fill(documentTitle);
    const documentPosted = page.waitForResponse(
      (r) => r.url().includes('/api/v1/documents') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /^Post 1 now$/ }).click();
    expect((await documentPosted).ok()).toBe(true);
    await expect(page.getByRole('list', { name: 'Files to upload' })).toBeHidden({ timeout: 30_000 });

    // ── 5. Invite the imported resident from the directory ─────────────────
    await page.goto(`/dashboard/directory?communityId=${communityId}&tab=residents`, {
      waitUntil: 'domcontentloaded',
    });
    await clickWhenHydrated(page.getByRole('button', { name: residentName }));
    const inviteSent = page.waitForResponse(
      (r) => r.url().endsWith('/api/v1/invitations') && r.request().method() === 'POST',
    );
    await clickWhenHydrated(page.getByRole('button', { name: 'Send invite' }));
    expect((await inviteSent).ok()).toBe(true);
    await expect(page.getByText('Invitation sent.')).toBeVisible();

    // The founder's checklist reflects all three: the unit, the roster (which
    // adds a member) and the document.
    await expectChecklistComplete(page, communityId, ['add_units', 'invite_first_member', 'upload_first_document']);

    // ── 6. The resident accepts in their own browser ───────────────────────
    const token = await readInvitationToken(residentEmail, communityId);
    const acceptUrl = `/auth/accept-invite?token=${token}&communityId=${communityId}`;
    const residentContext = await browser.newContext();
    try {
      const resident = await residentContext.newPage();
      await resident.goto(acceptUrl, { waitUntil: 'domcontentloaded' });
      await expect(resident.getByRole('heading', { name: `Join ${community.name}` })).toBeVisible();
      await waitForInviteFormHydrated(resident);
      await resident.getByLabel('Password', { exact: true }).fill(RESIDENT_PASSWORD);
      await resident.getByLabel('Confirm password').fill(RESIDENT_PASSWORD);
      await resident.getByTestId('invite-terms-checkbox').check();
      await resident.getByRole('button', { name: 'Set password and join' }).click();
      await expect(resident.getByTestId('invite-success')).toBeVisible({ timeout: 30_000 });

      // Signed in: the welcome screen, then the resident's own dashboard.
      await resident.getByRole('link', { name: 'Continue' }).click();
      await clickWhenHydrated(resident.getByRole('button', { name: 'Go to your dashboard' }));
      await expect(resident).toHaveURL(new RegExp(`/dashboard\\?communityId=${communityId}`), { timeout: 30_000 });

      // ── 7. A useful resident action: open the document just posted ──────
      const residentChecklist = resident.getByRole('region', { name: `Setup checklist for ${community.name}` });
      const documentsRow = residentChecklist.getByRole('listitem').filter({ hasText: 'Access a community document' });
      await clickWhenHydrated(documentsRow.getByRole('button', { name: 'Browse' }));
      await expect(resident).toHaveURL(new RegExp(`/communities/${communityId}/documents`), { timeout: 60_000 });
      await expect(resident.getByText(documentTitle).first()).toBeVisible({ timeout: 30_000 });
      await expectChecklistComplete(resident, communityId, ['access_document']);

      // ── 8. The same link cannot be used twice ────────────────────────────
      const second = await (await browser.newContext()).newPage();
      await second.goto(acceptUrl, { waitUntil: 'domcontentloaded' });
      await waitForInviteFormHydrated(second);
      await second.getByLabel('Password', { exact: true }).fill(RESIDENT_PASSWORD);
      await second.getByLabel('Confirm password').fill(RESIDENT_PASSWORD);
      await second.getByTestId('invite-terms-checkbox').check();
      await second.getByRole('button', { name: 'Set password and join' }).click();
      await expect(second.getByTestId('set-password-error')).toHaveText(
        'This invitation link has already been used.',
      );
      await second.context().close();
    } finally {
      await residentContext.close();
    }
  });

  test('an apartment founder gets the apartment dashboard and its own checklist', async ({ page }) => {
    test.setTimeout(180_000);
    const community = createFreshCommunity('apartment');

    await signInAs(page, community.founderEmail, community.communityId);
    // The shared dashboard sends apartments to their own; the condo
    // compliance panel must never appear.
    await expect(page).toHaveURL(new RegExp(`/dashboard/apartment\\?communityId=${community.communityId}`), {
      timeout: 60_000,
    });
    // Apartments have websites too, so the same card leads here.
    await expect(page.getByRole('region', { name: 'Your website is live' })).toBeVisible({
      timeout: 60_000,
    });
    const checklist = page.getByRole('region', { name: `Setup checklist for ${community.name}` });
    await expect(checklist.getByRole('heading', { name: 'Strengthen your community' })).toBeVisible();
    await expect(checklist.getByText('Upload your community rules')).toBeVisible();
    await expect(checklist.getByText('Add your units')).toBeVisible();
    // Apartments have no compliance feature, so no compliance step.
    await expect(checklist.getByText('Review your compliance score')).toHaveCount(0);
    await expect(checklist.getByText('Upload your first compliance document')).toHaveCount(0);
  });
});
