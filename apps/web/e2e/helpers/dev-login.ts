/**
 * Dev-only authentication for Playwright E2E tests.
 * Uses /dev/agent-login (NODE_ENV=development only).
 */
import { expect, type Page } from '@playwright/test';

export type DevRole =
  | 'board_president'
  | 'owner'
  | 'tenant'
  | 'cam'
  | 'pm_admin'
  | 'site_manager';

type AgentLoginPayload = {
  ok: boolean;
  portal: string;
  community: { id: number } | null;
  allCommunities?: Array<{ id: number; slug: string }>;
};

export type LoginAsOptions = {
  /** Pin session to a seeded community (e.g. `sunset-condos` for demo e-sign templates). */
  communitySlug?: string;
};

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
): Promise<{ communityId: number; portal: string }> {
  async function fetchLogin(query: string): Promise<AgentLoginPayload> {
    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await page.request.get(`/dev/agent-login?${query}`, {
        headers: { accept: 'application/json' },
      });
      if (response.ok()) break;
      if (response.status() >= 500) {
        await page.waitForTimeout(2000);
      }
    }
    expect(response!.ok(), `agent-login failed for role=${role}: ${response!.status()}`).toBeTruthy();
    const payload = (await response!.json()) as AgentLoginPayload;
    expect(payload.ok).toBe(true);
    return payload;
  }

  let payload = await fetchLogin(`as=${encodeURIComponent(role)}`);

  if (options?.communitySlug && payload.allCommunities?.length) {
    const match = payload.allCommunities.find((c) => c.slug === options.communitySlug);
    if (match) {
      payload = await fetchLogin(
        `as=${encodeURIComponent(role)}&communityId=${encodeURIComponent(String(match.id))}`,
      );
    }
  }

  const portalUrl = new URL(payload.portal, 'http://127.0.0.1:3000');
  const communityId = Number(
    portalUrl.searchParams.get('communityId') ?? payload.community?.id,
  );

  if (!Number.isInteger(communityId) || communityId <= 0) {
    throw new Error(
      `Dev login for ${role} returned invalid communityId. Portal: ${payload.portal}`,
    );
  }

  await page.goto(payload.portal, { waitUntil: 'networkidle' });

  return { communityId, portal: payload.portal };
}
