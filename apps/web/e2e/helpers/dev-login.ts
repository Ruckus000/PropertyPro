/**
 * Dev-only authentication for Playwright E2E tests.
 * Uses /dev/agent-login (NODE_ENV=development only).
 */
import { expect, type Page } from '@playwright/test';

/** Mirrors `ROLE_EMAIL_MAP` in `src/app/dev/agent-login/route.ts`. */
export type DevRole =
  | 'board_president'
  | 'board_member'
  | 'owner'
  | 'tenant'
  | 'cam'
  | 'pm_admin'
  | 'founding_admin'
  | 'site_manager';

type AgentLoginPayload = {
  ok: boolean;
  portal: string;
  community: { id: number } | null;
  allCommunities?: Array<{ id: number; slug: string; name: string }>;
};

export type LoginAsOptions = {
  /** Pin session to a seeded community (e.g. `sunset-condos` for demo e-sign templates). */
  communitySlug?: string;
  /**
   * Skip the trailing `page.goto(portal)`.
   *
   * Use when the caller navigates somewhere else immediately anyway (an
   * onboarding wizard, a deep link) — the portal hop is a wasted full page
   * load, and for onboarding it also races the wizard's own redirect.
   */
  skipPortalNav?: boolean;
};

// `localhost`, not `127.0.0.1` — the admin dev server pins its origin the same
// way the web one does, so a 127.0.0.1 origin loses the session across any
// redirect. See the baseURL comment in playwright.config.ts.
const ADMIN_BASE_URL = 'http://localhost:3001';

/** Max characters of a failed response body to fold into an assertion message. */
const BODY_EXCERPT_LIMIT = 400;

/**
 * Collapse a failed response body to one short line.
 *
 * A Next.js error page is many KB of HTML; pasted whole it buries the failure
 * in the Playwright report. JSON bodies survive intact — they are well under
 * the limit and are the case that matters.
 */
function summarizeBody(raw: string): string {
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (!collapsed) return '<empty body>';
  return collapsed.length > BODY_EXCERPT_LIMIT
    ? `${collapsed.slice(0, BODY_EXCERPT_LIMIT)}… (${collapsed.length} chars)`
    : collapsed;
}

/**
 * Authenticate via the dev agent-login endpoint.
 *
 * Uses the JSON API endpoint first (no page navigation cost), then navigates
 * to the portal URL only after confirming auth succeeded.
 *
 * When `communitySlug` is set, performs a second login with `?communityId=`
 * so the session uses that community (see agent-login route).
 */
export async function loginAs(
  page: Page,
  role: DevRole,
  options?: LoginAsOptions,
): Promise<{
  communityId: number;
  portal: string;
  allCommunities: Array<{ id: number; slug: string; name: string }>;
}> {
  async function fetchLogin(query: string): Promise<AgentLoginPayload> {
    let response;
    let body = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await page.request.get(`/dev/agent-login?${query}`, {
        headers: { accept: 'application/json' },
      });
      if (response.ok()) break;

      // Read the body as TEXT, not JSON. The route answers 500 with a useful
      // `{ error, details, hint }`, but the non-development path returns plain
      // `Not Found`, and an unhandled throw returns a Next.js HTML error page —
      // `.json()` would throw on both and hide the status behind a parse error.
      // The route has no `console.error` on its 500 paths, so this body is the
      // ONLY record of why a login failed. Discarding it cost the 2026-08-03
      // audit an entire investigation cycle.
      body = summarizeBody(await response.text().catch(() => '<unreadable>'));

      // Only 5xx is worth retrying. A 400 (bad role) is deterministic — the old
      // loop re-fired two more identical doomed requests.
      if (response.status() < 500) break;
      await page.waitForTimeout(2000);
    }
    expect(
      response!.ok(),
      `agent-login failed for role=${role} (?${query}): ${response!.status()} ${body}`,
    ).toBeTruthy();
    const payload = (await response!.json()) as AgentLoginPayload;
    expect(payload.ok).toBe(true);
    return payload;
  }

  let payload = await fetchLogin(`as=${encodeURIComponent(role)}`);

  if (options?.communitySlug) {
    const available = payload.allCommunities ?? [];
    const match = available.find((c) => c.slug === options.communitySlug);

    // Fail loudly. The route falls back to `communities[0]` ordered by
    // `communities.name`, so an unmatched slug silently lands the session on
    // whichever community sorts first — today Palm Shores HOA, which is seeded
    // on Essentials and plan-gates most surfaces. That silent fallback is
    // exactly what made `phase1-roadmap-smoke` fail 0/7 with "Upgrade now"
    // instead of a useful error (PR #898).
    if (!match) {
      throw new Error(
        `Dev login for ${role} could not pin community "${options.communitySlug}" — `
          + `not among this user's communities [${available.map((c) => c.slug).join(', ') || 'none'}]. `
          + `Without a pin the session falls back to the alphabetically-first community. `
          + `Check the slug, or run: pnpm seed:demo`,
      );
    }

    payload = await fetchLogin(
      `as=${encodeURIComponent(role)}&communityId=${encodeURIComponent(String(match.id))}`,
    );
  }

  const portalUrl = new URL(payload.portal, 'http://localhost:3000');
  const communityId = Number(
    portalUrl.searchParams.get('communityId') ?? payload.community?.id,
  );

  if (!Number.isInteger(communityId) || communityId <= 0) {
    throw new Error(
      `Dev login for ${role} returned invalid communityId. Portal: ${payload.portal}`,
    );
  }

  if (!options?.skipPortalNav) {
    await page.goto(payload.portal, { waitUntil: 'domcontentloaded' });
  }

  return {
    communityId,
    portal: payload.portal,
    allCommunities: payload.allCommunities ?? [],
  };
}

export async function loginAsPlatformAdmin(page: Page): Promise<void> {
  await page.goto(`${ADMIN_BASE_URL}/dev/agent-login?as=pm_admin`, {
    waitUntil: 'domcontentloaded',
  });
  await page.goto(`${ADMIN_BASE_URL}/clients`, {
    waitUntil: 'domcontentloaded',
  });

  await expect(page).toHaveURL(/\/clients/);
}
