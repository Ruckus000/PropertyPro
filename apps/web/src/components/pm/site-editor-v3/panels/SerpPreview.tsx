'use client';

import type { SiteSettings } from '@/lib/site-editor/site-settings';
import { resolveSeoDescription, resolveSeoTitle } from '@/lib/site-editor/site-settings';

export interface SerpPreviewProps {
  settings: SiteSettings;
  community: {
    name: string;
    slug: string;
    communityType: 'condo_718' | 'hoa_720' | 'apartment';
    city?: string | null;
  };
  tagline?: string | null;
}

/**
 * A mock search result, so a manager can see what the title and description
 * they just typed will look like where it matters.
 *
 * ## This is DECORATION, and it is hidden from assistive technology
 *
 * `aria-hidden="true"` on the whole thing, deliberately. Everything shown here
 * is already present on the page as a real, labelled form value — this adds no
 * information, only a visual arrangement of it. Left in the accessibility tree
 * it would make a screen-reader user hear every field twice, the second time
 * without its label and with no way to act on it.
 *
 * The corollary: nothing may ever appear ONLY here. If a future edit wants to
 * surface a warning ("your title will be truncated"), that belongs in the form
 * next to the field, not in this box.
 *
 * ## It renders through the same resolvers as the real page
 *
 * `resolveSeoTitle` / `resolveSeoDescription` are the functions
 * `buildCommunityMetadata` calls. A preview with its own copy of the fallback
 * rules is worse than no preview — it drifts, and it drifts silently, and the
 * whole point of the box is to be believed.
 */
export function SerpPreview({ settings, community, tagline }: SerpPreviewProps) {
  const title = resolveSeoTitle(settings, community);
  const description = resolveSeoDescription(settings, community, tagline);
  const displayUrl = `${community.slug}.getpropertypro.com`;

  return (
    <div
      aria-hidden="true"
      data-testid="serp-preview"
      className="rounded-[var(--radius-md)] border border-edge bg-surface-card p-4"
    >
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-content-tertiary">
        Search result preview
      </p>
      <p className="truncate text-xs text-content-secondary">{displayUrl}</p>
      <p className="truncate text-base font-medium text-content-link">{title}</p>
      <p className="line-clamp-2 text-sm text-content-secondary">{description}</p>
    </div>
  );
}
