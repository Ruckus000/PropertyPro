/**
 * Website editor v3 rollout flag.
 *
 * Server-side only, deliberately NOT `NEXT_PUBLIC_*`. This is a rollout
 * switch, not an entitlement: it decides which of two editors a PM is sent
 * to, never what they are allowed to do. Both editors enforce the same
 * authorization (PM manager role + community membership + `hasSiteEditor`),
 * so flipping this on cannot widen anyone's access — and keeping it off the
 * client bundle removes the temptation to treat it as a security boundary.
 *
 * Entitlement lives in `packages/shared/src/features` (`hasSiteEditor` and
 * friends). If you find yourself wanting to read this flag to decide whether
 * someone *may* do something, you want a plan feature instead.
 *
 * Removed in Phase 12 when the stacked-form editor is retired.
 */
export function isSiteEditorV3Enabled(): boolean {
  return process.env['SITE_EDITOR_V3_ENABLED'] === 'true';
}

/** Canonical path of the v3 editor, including the required community scope. */
export function siteEditorV3Path(communityId: number): string {
  return `/pm/website-editor?communityId=${communityId}`;
}
