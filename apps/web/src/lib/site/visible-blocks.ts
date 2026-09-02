/**
 * Drops sections a PM has hidden from visitors.
 *
 * Applied at the two PUBLIC render paths — the public site and the PM preview
 * of it — and deliberately NOT in `listSiteBlocks`, because the editor API
 * (api/v1/pm/site/blocks) shares that reader and must keep returning hidden
 * sections so the PM can see and unhide them.
 *
 * Malformed content passes through untouched: each block renderer already
 * degrades a failed safeParse to null with a Sentry report, and quietly
 * dropping it here would remove that signal.
 */
export function visibleBlocks<T extends { content: unknown }>(blocks: readonly T[]): T[] {
  return blocks.filter(
    (b) =>
      !(
        typeof b.content === 'object' &&
        b.content !== null &&
        (b.content as { hidden?: unknown }).hidden === true
      ),
  );
}
