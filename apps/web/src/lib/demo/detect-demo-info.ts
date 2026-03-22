/**
 * Detect demo session info from community + user email.
 *
 * Demo users have emails like:
 *   - `demo-board@[slug].propertyprofl.com` (board role)
 *   - `demo-resident@[slug].propertyprofl.com` (resident role)
 *
 * Returns null if not a demo session or the email doesn't match.
 */
export interface DemoDetectionResult {
  isDemoMode: true;
  currentRole: 'board' | 'resident';
  slug: string;
}

export function detectDemoInfo(
  isDemo: boolean,
  userEmail: string | null,
): DemoDetectionResult | null {
  if (!isDemo || !userEmail) return null;

  const boardMatch = userEmail.match(
    /^demo-board@(.+)\.propertyprofl\.com$/,
  );
  if (boardMatch?.[1]) {
    return { isDemoMode: true, currentRole: 'board', slug: boardMatch[1] };
  }

  const residentMatch = userEmail.match(
    /^demo-resident@(.+)\.propertyprofl\.com$/,
  );
  if (residentMatch?.[1]) {
    return { isDemoMode: true, currentRole: 'resident', slug: residentMatch[1] };
  }

  return null;
}
