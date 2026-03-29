/**
 * Detect demo session info from community + user email.
 *
 * Demo users have emails like:
 *   - `demo-board@[slug].getpropertypro.com` (board role)
 *   - `demo-resident@[slug].getpropertypro.com` (resident role)
 *
 * Returns null if not a demo session or the email doesn't match.
 */
import type { CommunityType } from '@propertypro/shared';
import { computeDemoStatus, type DemoLifecycleStatus } from '@propertypro/shared';

export interface DemoDetectionResult {
  isDemoMode: true;
  currentRole: 'board' | 'resident';
  slug: string;
  status: DemoLifecycleStatus;
  trialEndsAt: Date | null;
  demoExpiresAt: Date | null;
  communityType: CommunityType;
}

export function detectDemoInfo(
  isDemo: boolean,
  userEmail: string | null,
  trialEndsAt: Date | null = null,
  demoExpiresAt: Date | null = null,
  communityType: CommunityType = 'condo_718',
): DemoDetectionResult | null {
  if (!isDemo || !userEmail) return null;

  const boardMatch = userEmail.match(
    /^demo-board@(.+)\.getpropertypro\.com$/,
  );
  const residentMatch = userEmail.match(
    /^demo-resident@(.+)\.getpropertypro\.com$/,
  );

  const currentRole: 'board' | 'resident' | null =
    boardMatch?.[1] ? 'board' :
    residentMatch?.[1] ? 'resident' :
    null;

  const slug = boardMatch?.[1] ?? residentMatch?.[1] ?? null;
  if (!currentRole || !slug) return null;

  const status = computeDemoStatus({
    isDemo: true,
    trialEndsAt,
    demoExpiresAt,
    deletedAt: null,
  });

  return {
    isDemoMode: true,
    currentRole,
    slug,
    status,
    trialEndsAt,
    demoExpiresAt,
    communityType,
  };
}
